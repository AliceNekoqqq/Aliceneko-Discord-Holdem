import { replyToMention } from "./ai-chat.mjs";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const GATEWAY_INTENTS = (1 << 0) | (1 << 9); // GUILDS + GUILD_MESSAGES; message content is only used for direct bot mentions.

export class DiscordGateway {
  constructor(host) {
    this.host = host;
    this.env = host.env;
    this.storage = host.ctx.storage;
    this.socket = null;
    this.chatQueues = new Map();
    this.heartbeatTimer = null;
    this.heartbeatInterval = null;
    this.retryTimer = null;
    this.retryMs = 1000;
    this.awaitingAck = false;
    this.sequence = null;
    this.sessionId = null;
    this.resumeUrl = null;
    this.botId = null;
    this.lastSequencePersistAt = 0;
  }

  async ensure() {
    if (!this.env.BOT_TOKEN) return {connected:false,reason:"missing_bot_token"};
    await this.storage.put("gatewayMode",true);
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return {connected:true,connecting:this.socket.readyState === WebSocket.CONNECTING};
    }
    if (this.retryTimer) return {connected:false,retryScheduled:true};
    this.sessionId = await this.storage.get("gatewaySession") || null;
    this.resumeUrl = await this.storage.get("gatewayResumeUrl") || null;
    this.sequence = await this.storage.get("gatewaySequence") ?? null;
    this.botId = await this.storage.get("gatewayBotId") || null;
    this.connect();
    return {connected:true,connecting:true};
  }

  connect() {
    const baseUrl = this.resumeUrl || GATEWAY_URL;
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = /(?:\?|&)v=10(?:&|$)/.test(baseUrl) ? baseUrl : baseUrl + separator + "v=10&encoding=json";
    try {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.addEventListener("message",event => {
        const task = this.onMessage(event.data);
        this.host.ctx.waitUntil(task.catch(() => {}));
      });
      socket.addEventListener("close",event => this.onClose(event));
      socket.addEventListener("error",() => {
        try { socket.close(); } catch {}
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  async onMessage(raw) {
    let packet;
    try { packet = JSON.parse(typeof raw === "string" ? raw : String(raw)); }
    catch { return; }
    if (Number.isInteger(packet.s)) {
      this.sequence = packet.s;
      const now = Date.now();
      if (packet.t === "READY" || now - this.lastSequencePersistAt > 15000) {
        this.lastSequencePersistAt = now;
        await this.storage.put("gatewaySequence",this.sequence);
      }
    }
    if (packet.op === 10) {
      const interval = Number(packet.d?.heartbeat_interval) || 45000;
      this.startHeartbeats(interval);
      if (this.sessionId && this.sequence !== null) {
        this.send({op:6,d:{token:this.env.BOT_TOKEN,session_id:this.sessionId,seq:this.sequence}});
      } else {
        this.send({op:2,d:{
          token:this.env.BOT_TOKEN,
          intents:GATEWAY_INTENTS,
          properties:{os:"linux",browser:"aliceneko-worker",device:"aliceneko-worker"}
        }});
      }
      return;
    }
    if (packet.op === 11) {
      this.awaitingAck = false;
      return;
    }
    if (packet.op === 1) {
      this.send({op:1,d:this.sequence});
      return;
    }
    if (packet.op === 7) {
      this.closeForReconnect();
      return;
    }
    if (packet.op === 9) {
      if (!packet.d) await this.clearSession();
      this.closeForReconnect();
      return;
    }
    if (packet.op !== 0) return;
    if (packet.t === "READY") {
      this.botId = packet.d?.user?.id || null;
      this.sessionId = packet.d?.session_id || null;
      this.resumeUrl = packet.d?.resume_gateway_url || null;
      await Promise.all([
        this.storage.put("gatewayBotId",this.botId),
        this.storage.put("gatewaySession",this.sessionId),
        this.storage.put("gatewayResumeUrl",this.resumeUrl)
      ]);
      this.retryMs = 1000;
      return;
    }
    if (packet.t === "RESUMED") {
      this.retryMs = 1000;
      return;
    }
    if (packet.t === "MESSAGE_CREATE") this.onGuildMessage(packet.d);
  }

  onGuildMessage(message) {
    if (!this.botId || !message?.guild_id || !message?.channel_id || !message?.id) return;
    // Only message identity is needed to follow the channel tail; no chat text is stored.
    if(this.env.TABLES&&/^\d+$/.test(message.id)){
      const table=this.env.TABLES.get(this.env.TABLES.idFromName(`table:${message.guild_id}:${message.channel_id}`));
      this.host.ctx.waitUntil(table.fetch('https://internal',{method:'POST',body:JSON.stringify({
        op:'channelMessage',guild:message.guild_id,channel:message.channel_id,messageId:message.id
      })}).catch(()=>{}));
    }
    if (!message.author?.id || message.author.bot || message.author.id === this.botId) return;
    const mentioned = (message.mentions || []).some(user => user.id === this.botId) ||
      new RegExp("<@!?" + this.botId + ">").test(String(message.content || ""));
    if (!mentioned) return;
    const key = String(message.guild_id) + ":" + String(message.author.id);
    const previous = this.chatQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => replyToMention(this.env,message,this.botId));
    this.chatQueues.set(key,next);
    const tracked = next.finally(() => {
      if (this.chatQueues.get(key) === tracked) this.chatQueues.delete(key);
    });
    this.host.ctx.waitUntil(tracked.catch(() => {}));
  }

  startHeartbeats(interval) {
    this.clearHeartbeats();
    const first = Math.floor(Math.random() * interval);
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      this.sendHeartbeat();
      this.heartbeatInterval = setInterval(() => this.sendHeartbeat(),interval);
    },first);
  }

  sendHeartbeat() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.awaitingAck) {
      try { this.socket.close(4000,"Gateway heartbeat acknowledgement missing"); } catch {}
      return;
    }
    this.awaitingAck = true;
    this.send({op:1,d:this.sequence});
  }

  send(packet) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try { this.socket.send(JSON.stringify(packet)); return true; }
    catch { return false; }
  }

  closeForReconnect() {
    if (this.socket) {
      try { this.socket.close(4000,"Reconnect requested"); } catch {}
    }
  }

  onClose() {
    this.clearHeartbeats();
    this.awaitingAck = false;
    this.socket = null;
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (!this.env.BOT_TOKEN || this.retryTimer) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2,60000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.ensure().catch(() => this.scheduleReconnect());
    },delay);
  }

  clearHeartbeats() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatTimer = null;
    this.heartbeatInterval = null;
  }

  async clearSession() {
    this.sessionId = null;
    this.resumeUrl = null;
    this.sequence = null;
    await Promise.all([
      this.storage.delete("gatewaySession"),
      this.storage.delete("gatewayResumeUrl"),
      this.storage.delete("gatewaySequence")
    ]);
  }
}
