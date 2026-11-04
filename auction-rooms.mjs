// Guild-scoped multiplayer rooms for the warehouse auction.
//
// M1: create a room with a short code, join it from the same server, pick a
// role, ready up and start. Empty seats are filled by the three NPC bidders.
// M2: five sealed-bid rounds with a deadline, escrow of fee + budget, and
// settlement through the same decideAuction the solo mode uses.
//
// Money rules mirror the solo mode: the fee is never refunded, the budget is
// held while the game runs, and the winner pays only their winning bid.

import {
  AUCTION_TIERS,
  generateAuction,
  decideAuction,
  npcAuctionBid,
  revealAuction,
  shuffleAuction,
} from "./tavern-auction.mjs";
import { AUCTION_RATE } from "./tavern-auction-currency.mjs";
import { AUCTION_REGIONS, drawAuctionWarehouse } from "./tavern-auction-regions.mjs";
import { generateLargeAuction, largeCatalog, estimateLargeAuction } from "./tavern-auction-large.mjs";
import { layoutAuction, auctionBoardView } from "./tavern-auction-board.mjs";

export const ROOM_SEATS = 4;
export const ROOM_ROUNDS = 5;
export const ROOM_ROUND_MS = 60_000;
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WAITING_TTL = 30 * 60_000;
export const ROOM_REVEAL_MS = 900;
const ACTIVE_TTL = 2 * 60 * 60_000;
const NPC_SEATS = [
  { id: "npc:aji", name: "阿吉" },
  { id: "npc:laomao", name: "老猫" },
  { id: "npc:zhanggui", name: "掌柜" },
];
const ROLES = ["sophie", "gabriella", "viktor", "zhou", "lucia"];

export class AuctionRooms {
  constructor(tavern, random = (n) => Math.floor(Math.random() * n)) {
    this.tavern = tavern;
    this.random = random;
    this.sql = tavern.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS auction_rooms (
        code TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        host_id TEXT NOT NULL,
        tier TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        state TEXT NOT NULL
      )`,
    );
    this.sql.exec(`CREATE TABLE IF NOT EXISTS auction_room_requests (
      room_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
      round INTEGER NOT NULL, bid INTEGER NOT NULL,
      PRIMARY KEY(room_id,user_id,request_id))`);
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS auction_room_seats (
        code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        ready INTEGER NOT NULL DEFAULT 0,
        npc INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (code, user_id)
      )`,
    );
  }

  atomic(fn) {
    if (this.inTransaction) return fn();
    return this.tavern.storage.transactionSync(() => {
      this.inTransaction = true;
      try { return fn(); } finally { this.inTransaction = false; }
    });
  }

  dispatch(p) {
    return this.atomic(() => this.dispatchAction(p));
  }

  dispatchAction(p) {
    this.sweep(p.now ?? Date.now());
    switch (p.action) {
      case "roomView":
        return this.view(p);
      case "roomCreate":
        return this.create(p);
      case "roomJoin":
        return this.join(p);
      case "roomLeave":
        return this.leave(p);
      case "roomRole":
        return this.setRole(p);
      case "roomReady":
        return this.setReady(p);
      case "roomStart":
        return this.start(p);
      case "roomBid":
        return this.bid(p);
      case "roomReveal":
        return this.reveal(p);
      default:
        throw Error("未知的房间操作。");
    }
  }

  // --- helpers -----------------------------------------------------------
  one(q, ...a) {
    return this.tavern.one(q, ...a);
  }

  row(code) {
    const r = this.one("SELECT * FROM auction_rooms WHERE code=?", code);
    return r ? { ...r, data: JSON.parse(r.state) } : null;
  }

  save(room) {
    this.sql.exec(
      "UPDATE auction_rooms SET status=?, state=? WHERE code=?",
      room.status,
      JSON.stringify(room.data),
      room.code,
    );
  }

  mine(guild, id) {
    return this.one(
      `SELECT r.code FROM auction_rooms r
        JOIN auction_room_seats s ON s.code=r.code
        WHERE s.user_id=? AND r.guild_id=? AND (r.status IN ('waiting','active') OR (r.status='settled' AND json_extract(r.state,'$.reveal.complete')=0))
        LIMIT 1`,
      id,
      guild,
    );
  }

  // Finished rooms stay readable long enough for everyone to see the result.
  mineAny(guild, id) {
    return this.one(
      `SELECT r.code FROM auction_rooms r
        JOIN auction_room_seats s ON s.code=r.code
        WHERE s.user_id=? AND r.guild_id=?
        ORDER BY r.created_at DESC
        LIMIT 1`,
      id,
      guild,
    );
  }

  roomId(room) {
    return room.data.id ?? `legacy:${room.code}:${room.created_at}`;
  }

  forPlayer(p, required = false) {
    let match;
    if (p.roomId) {
      match = this.one(`SELECT r.code FROM auction_rooms r
        JOIN auction_room_seats s ON s.code=r.code
        WHERE r.guild_id=? AND s.user_id=?
        AND (json_extract(r.state,'$.id')=? OR ('legacy:'||r.code||':'||r.created_at)=?)`,
        p.guild, p.id, p.roomId, p.roomId);
    } else if (!required) match = this.mine(p.guild, p.id) ?? this.mineAny(p.guild, p.id);
    const room = match ? this.row(match.code) : null;
    if (required && (!p.roomId || !room || this.roomId(room) !== p.roomId))
      throw Error("房间已变化，请刷新后重试。");
    return room;
  }

  releaseFinished(p) {
    this.sql.exec(`DELETE FROM auction_room_seats WHERE user_id=? AND code IN (
      SELECT code FROM auction_rooms WHERE guild_id=? AND status='settled'
      AND COALESCE(json_extract(state,'$.reveal.complete'),1)=1)`,p.id,p.guild);
  }

  seats(code) {
    return this.tavern.sql
      .exec(
        "SELECT * FROM auction_room_seats WHERE code=? ORDER BY joined_at, user_id",
        code,
      )
      .toArray();
  }

  sweep(now) {
    const rooms = this.tavern.sql
      .exec("SELECT code, status, created_at FROM auction_rooms")
      .toArray();
    for (const r of rooms) {
      const ttl = r.status === "waiting" ? WAITING_TTL : ACTIVE_TTL;
      if (r.created_at + ttl <= now) this.drop(r.code);
    }
  }

  drop(code) {
    if (!this.inTransaction) return this.atomic(() => this.drop(code));
    // An abandoned running room still holds its players' budgets: give the
    // money back before the row disappears. The entry fee stays spent.
    const room = this.row(code);
    if (room?.status === "active" && Array.isArray(room.data?.seats))
      for (const seat of room.data.seats) {
        if (seat.npc) continue;
        this.tavern.auctionCurrency.adjust(
          seat.id,
          room.data.budget,
          `room:${room.data.id ?? code}:expire:${seat.id}`,
          "auction_room_expire",
          `房间 ${code} 超时退回`,
          Date.now(),
        );
      }
    if (room?.status === "settled" && room.data.reveal && !room.data.reveal.complete)
      this.unlock(room);
    if (room) this.sql.exec("DELETE FROM auction_room_requests WHERE room_id=?", this.roomId(room));
    this.sql.exec("DELETE FROM auction_room_seats WHERE code=?", code);
    this.sql.exec("DELETE FROM auction_rooms WHERE code=?", code);
  }

  newCode() {
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = "";
      for (let i = 0; i < 6; i++)
        code += ALPHABET[this.random(ALPHABET.length)];
      if (!this.one("SELECT code FROM auction_rooms WHERE code=?", code))
        return code;
    }
    throw Error("房号生成失败，请重试。");
  }

  // --- views -------------------------------------------------------------
  view(p, now = p.now ?? Date.now()) {
    this.sweep(now);
    let room = this.forPlayer(p);
    if (!room) return { room: null };
    if (room.status === "active") this.advance(room, now);
    if (room.status === "settled") this.advanceReveal(room, now);
    const seats = room.status === "waiting" ? this.seats(room.code) : room.data.seats.map(s => ({
      user_id:s.id, name:s.name, role:s.role, ready:1, npc:s.npc,
    }));
    const humans = seats.filter((s) => !s.npc);
    const state = room.data,
      live = room.status === "active",
      currentRow = live ? (state.bids[state.round - 1] ?? []) : [],
      own = state.seats?.find(s => s.id === p.id && !s.npc),
      info = own && state.infos ? state.infos[own.index] : null,
      complete = !state.reveal || state.reveal.complete,
      visible = state.items?.map((x,i) => !live && complete ||
        !live && state.revealOrder?.slice(0,state.reveal.count).includes(i) ? x : null),
      result = state.result ? {
        winner:state.result.winner, winnerName:state.result.winnerName,
        price:state.result.price, settledAt:state.result.settledAt, itemCount:state.itemCount,
        won:state.result.winner === own?.index,
        cashNet:-state.fee-(state.result.winner === own?.index ? state.result.price : 0),
        ...(complete ? {total:state.total,
          net:state.result.winner === own?.index ? state.total-state.result.price-state.fee : -state.fee} : {}),
      } : null;
    return {
      room: {
        id: this.roomId(room),
        code: room.code,
        status: room.status,
        tier: room.tier,
        host: room.host_id === p.id,
        you: p.id,
        seats: seats.map((s) => {
          const seat = state.seats?.find((x) => x.id === s.user_id);
          const idx = seat?.index ?? -1;
          const mineRow = s.user_id === p.id;
          return {
            id: s.user_id,
            name: s.name,
            role: s.role,
            ready: Boolean(s.ready),
            npc: Boolean(s.npc),
            index: idx,
            you: mineRow,
            budget: live ? state.budget : null,
            bid: live && mineRow ? (currentRow[idx] ?? null) : null,
            submitted: live && Number.isInteger(currentRow[idx]),
          };
        }),
        canStart:
          room.status === "waiting" &&
          room.host_id === p.id &&
          humans.length >= 2 &&
          humans.every((s) => s.user_id === room.host_id || s.ready),
        humans: humans.length,
        started:
          live || room.status === "settled"
            ? {
                round: state.round,
                rounds: ROOM_ROUNDS,
                roundEndsAt: live ? state.roundEndsAt : null,
                budget: state.budget,
                fee: state.fee,
                warehouse: state.warehouse,
                itemCount: state.itemCount,
                history: state.history ?? [],
                result,
                ...(info ? {info, estimate:Math.round(this.estimate(state, info)),
                  currency:"auction", items:visible,
                  board:auctionBoardView({...state,infos:[info]}, this.roomId(room), visible),
                  priority:state.priority, reveal:state.reveal ? {...state.reveal,total:state.itemCount} : null} : {}),
              }
            : null,
        result,
      },
    };
  }

  // --- lobby actions -----------------------------------------------------
  create(p, now = p.now ?? Date.now()) {
    this.sweep(now);
    if (this.mine(p.guild, p.id))
      throw Error("你已经在一个房间里了，先退出来再开。");
    const tier = p.tier ?? "standard";
    if (!Object.hasOwn(AUCTION_TIERS, tier)) throw Error("没有这个区域。");
    this.releaseFinished(p);
    const code = this.newCode(),
      state = { id: crypto.randomUUID().replaceAll("-", "").slice(0,16), round: 0, seats: [], startedAt: null };
    this.sql.exec(
      "INSERT INTO auction_rooms(code,guild_id,host_id,tier,status,created_at,state) VALUES(?,?,?,?,?,?,?)",
      code,
      p.guild,
      p.id,
      tier,
      "waiting",
      now,
      JSON.stringify(state),
    );
    this.sql.exec(
      "INSERT INTO auction_room_seats(code,user_id,name,role,ready,npc,joined_at) VALUES(?,?,?,?,?,?,?)",
      code,
      p.id,
      p.name,
      "sophie",
      1,
      0,
      now,
    );
    return this.view(p, now);
  }

  join(p, now = p.now ?? Date.now()) {
    this.sweep(now);
    const code = String(p.code ?? "").toUpperCase();
    if (!ROOM_CODE.test(code)) throw Error("房号是 6 位，别输错了。");
    const room = this.row(code);
    if (!room) throw Error("没有这个房间，可能已经散了。");
    if (room.guild_id !== p.guild) throw Error("这个房间不在这台服务器上。");
    if (room.status !== "waiting") throw Error("这局已经开始了，进不去了。");
    if (this.mine(p.guild, p.id)?.code === code) return this.view(p, now);
    if (this.mine(p.guild, p.id)) throw Error("你已经在另一个房间里了。");
    const seats = this.seats(code);
    if (seats.length >= ROOM_SEATS) throw Error("人满了，等下一局吧。");
    this.releaseFinished(p);
    const used = new Set(seats.map((s) => s.role));
    const role = ROLES.find((r) => !used.has(r)) ?? "sophie";
    this.sql.exec(
      "INSERT INTO auction_room_seats(code,user_id,name,role,ready,npc,joined_at) VALUES(?,?,?,?,?,?,?)",
      code,
      p.id,
      p.name,
      role,
      0,
      0,
      now,
    );
    return this.view(p, now);
  }

  leave(p, now = p.now ?? Date.now()) {
    const room = this.forPlayer(p, true);
    if (room.status === "active") throw Error("这局已经开始了，打完才能走。");
    if (room.data.reveal && !room.data.reveal.complete) throw Error("先完成共享揭晓，再离开这局。");
    if (room.status === "waiting" && room.host_id === p.id) this.drop(room.code);
    else {
      if(room.status === "settled") this.releaseFinished(p);
      this.sql.exec("DELETE FROM auction_room_seats WHERE code=? AND user_id=?", room.code, p.id);
      if (!this.seats(room.code).some(s => !s.npc)) this.drop(room.code);
    }
    return {room:null};
  }

  setRole(p) {
    const room = this.forPlayer(p, true);
    if (room.status !== "waiting") throw Error("开局了就不能换能力了。");
    if (!ROLES.includes(p.role)) throw Error("没有这种能力。");
    const taken = this.seats(room.code).find(s => s.role === p.role && s.user_id !== p.id);
    if (taken) throw Error("这个能力有人选了，挑别的。");
    this.sql.exec("UPDATE auction_room_seats SET role=?,ready=? WHERE code=? AND user_id=?",
      p.role, room.host_id === p.id ? 1 : 0, room.code, p.id);
    return this.view(p);
  }

  setReady(p) {
    const room = this.forPlayer(p, true);
    if (room.status !== "waiting") return this.view(p);
    if (typeof p.ready !== "boolean") throw Error("无效准备状态。");
    this.sql.exec("UPDATE auction_room_seats SET ready=? WHERE code=? AND user_id=?",
      p.ready ? 1 : 0, room.code, p.id);
    return this.view(p);
  }

  // --- start -------------------------------------------------------------
  start(p, now = p.now ?? Date.now()) {
    const room = this.forPlayer(p, true);
    if (room.host_id !== p.id) throw Error("只有房主能开局。");
    if (room.status !== "waiting") return this.view(p, now);
    const seated = this.seats(room.code).filter(s => !s.npc);
    if (!seated.length) throw Error("房间里没人。");
    // A table of one is just the solo mode with extra steps, so two humans
    // are the minimum; the remaining seats still go to the NPCs.
    if (seated.length < 2) throw Error("至少要有两个真人才能开局，等个人进来。");
    if (seated.some((s) => s.user_id !== room.host_id && !s.ready))
      throw Error("还有人没准备好。");

    const tier = room.tier,
      { scale, budget, fee } = AUCTION_TIERS[tier],
      unit = AUCTION_RATE * scale,
      weights = AUCTION_REGIONS[tier].quality;

    // Hold fee + budget first: a player who cannot pay stops the start instead
    // of losing a warehouse they never bid on.
    for (const seat of seated)
      this.tavern.auctionCurrency.adjust(
        seat.user_id,
        -(fee + budget),
        `room:${this.roomId(room)}:escrow:${seat.user_id}`,
        "auction_room_escrow",
        `房间 ${room.code} 托管`,
        now,
      );

    const usedRoles = new Set(seated.map((s) => s.role));
    const freeRoles = ROLES.filter((r) => !usedRoles.has(r));
    const npcSeats = [];
    for (let i = seated.length; i < ROOM_SEATS; i++) {
      const npc = NPC_SEATS[npcSeats.length];
      npcSeats.push({
        id: npc.id,
        name: npc.name,
        role: freeRoles[npcSeats.length] ?? "sophie",
        npc: true,
      });
    }

    const warehouse = drawAuctionWarehouse(tier, this.random),
      items = generateLargeAuction(
        this.random,
        unit,
        tier,
        warehouse,
        generateAuction,
      ),
      board = layoutAuction(items, room.code, warehouse);

    const seats = [
      ...seated.map((s) => ({
        id: s.user_id,
        name: s.name,
        role: s.role,
        npc: false,
      })),
      ...npcSeats,
    ].map((s, index) => ({ ...s, index }));

    const state = {
      id: room.data.id ?? crypto.randomUUID().replaceAll("-", "").slice(0,16),
      contractVersion:2, catalogVersion:8, skillVersion:2, dropVersion:5, weights,
      round: 1,
      roundEndsAt: now + ROOM_ROUND_MS,
      startedAt: now,
      tier,
      budget,
      fee,
      unit,
      priority: shuffleAuction([0, 1, 2, 3], this.random),
      seats,
      warehouse,
      infos:seats.map(() => ({highCount:null,items:items.map(() => ({quality:null,width:null,height:null}))})),
      itemCount: items.length,
      total: items.reduce((s, x) => s + x.value, 0),
      board,
      items,
      bids: [[], [], [], [], []],
      history: [],
      result: null,
    };
    this.revealClues(state, 1);
    for (const npc of npcSeats)
      this.sql.exec(
        "INSERT INTO auction_room_seats(code,user_id,name,role,ready,npc,joined_at) VALUES(?,?,?,?,?,?,?)",
        room.code,
        npc.id,
        npc.name,
        npc.role,
        1,
        1,
        now,
      );
    room.status = "active";
    room.data = state;
    this.save(room);
    return this.view(p, now);
  }

  // --- bidding -----------------------------------------------------------
  bid(p, now = p.now ?? Date.now()) {
    let room = this.forPlayer(p, true);
    if (!Number.isInteger(p.round) || !Number.isSafeInteger(p.bid) ||
        typeof p.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(p.requestId))
      throw Error("报价窗口已变化，请刷新后重试。");
    const previous = this.one("SELECT round,bid FROM auction_room_requests WHERE room_id=? AND user_id=? AND request_id=?",
      this.roomId(room),p.id,p.requestId);
    if (previous) {
      if (previous.round !== p.round || previous.bid !== p.bid) throw Error("重复请求的报价不一致。");
      return this.view(p,now);
    }
    if (room.status !== "active") throw Error("这局还没开始，或者已经结束了。");
    this.advance(room,now);
    if (room.status !== "active") throw Error("这一局已经结束了。");
    const state=room.data,seat=state.seats.find(s => s.id === p.id && !s.npc);
    if (!seat) throw Error("你不在这局里。");
    if (p.round !== state.round) throw Error("这一轮已经开牌，请查看新一轮线索后再报价。");
    if (p.bid < 0 || p.bid > state.budget) throw Error(`报价得是 0 到 ${state.budget} 之间的整数。`);
    const count=this.one("SELECT COUNT(*) n FROM auction_room_requests WHERE room_id=? AND user_id=?",this.roomId(room),p.id).n;
    if(count>=256) throw Error("本局修改次数已达上限，请等待开牌。");
    this.sql.exec("INSERT INTO auction_room_requests VALUES(?,?,?,?,?)",this.roomId(room),p.id,p.requestId,p.round,p.bid);
    state.bids[state.round-1][seat.index]=p.bid;
    this.save(room);
    this.advance(room,now);
    return this.view(p,now);
  }

  // Close the current round once every human has bid or the clock ran out.
  advance(room, now = Date.now()) {
    if (!room || room.status !== "active") return;
    const state = room.data;
    let guard = 0;
    while (room.status === "active" && state.round <= ROOM_ROUNDS && guard++ < 8) {
      const round = state.round,
        human = state.seats.filter((s) => !s.npc),
        row = (state.bids[round - 1] ??= []);
      const allBid = human.every((s) => Number.isInteger(row[s.index]));
      if (!allBid && now < state.roundEndsAt) return;
      // Whoever let the clock run out passed this round.
      for (const s of state.seats)
        if (!Number.isInteger(row[s.index])) row[s.index] = 0;
      for (const s of state.seats)
        if (s.npc) row[s.index] = this.npcBid(state, s, round);
      const decision = decideAuction(round, row, state.priority, state.budget);
      state.history.push({
        round,
        done: decision.done,
        bids: row.map((b) => b),
        winner: decision.winner,
        price: decision.price,
      });
      if (decision.done) {
        this.settle(room, decision, now);
        return;
      }
      state.round = round + 1;
      this.revealClues(state, state.round);
      state.roundEndsAt = now + ROOM_ROUND_MS;
      this.save(room);
    }
  }

  revealClues(state, round) {
    if (!state.infos) return;
    for (const seat of state.seats)
      revealAuction(state.items,state.infos[seat.index],seat.role,round,this.random,state.skillVersion);
  }

  estimate(state, info) {
    return estimateLargeAuction(info,state.unit,state.tier,state.warehouse,state.catalogVersion);
  }

  npcBid(state, seat, round) {
    let info=state.infos?.[seat.index];
    if (!info) {
      info={highCount:null,items:state.items.map(() => ({quality:null,width:null,height:null}))};
      for(let r=1;r<=round;r++) revealAuction(state.items,info,seat.role,r,this.random,2);
    }
    return npcAuctionBid(info,round,Math.abs(hash08(seat.id))%3,this.random,
      state.unit,state.infos ? largeCatalog(state.tier,state.catalogVersion) : state.catalog,state.weights,
      state.budget,state.infos ? x => this.estimate(state,x) : undefined);
  }

  settle(room, decision, now = Date.now()) {
    const state = room.data,
      code = room.code;
    const winnerSeat =
      decision.winner === null ? null : state.seats[decision.winner];
    const winnerHuman = winnerSeat && !winnerSeat.npc ? winnerSeat : null;
    const price = decision.price;

    for (const seat of state.seats) {
      if (seat.npc) continue;
      const refund = seat === winnerHuman ? state.budget - price : state.budget;
      if (refund > 0)
        this.tavern.auctionCurrency.adjust(
          seat.id,
          refund,
          `room:${state.id ?? code}:refund:${seat.id}`,
          "auction_room_refund",
          `房间 ${code} 结算`,
          now,
        );
    }
    if (state.contractVersion >= 2) {
      state.revealOrder = state.items.map((_,i) => i).sort((a,b) =>
        state.board[a].y-state.board[b].y || state.board[a].x-state.board[b].x);
      state.reveal={count:0,complete:false,running:false,baseCount:0,startedAt:null,last:null};
    }
    if (winnerHuman)
      this.tavern.auction.inventory.acquire(
        { token: state.reveal ? state.id : `room:${code}`, user_id: winnerHuman.id },
        { items: state.items, tier: state.tier, revealOrder:state.revealOrder },
        now,
      );

    room.status = "settled";
    state.result = {
      winner: decision.winner,
      winnerName: winnerSeat?.name ?? null,
      price,
      settledAt: now,
      total: state.total,
      itemCount: state.itemCount,
    };
    state.roundEndsAt = null;
    this.save(room);
  }

  unlock(room) {
    const state=room.data, winner=state.seats[state.result?.winner];
    if(winner && !winner.npc && state.revealOrder)
      this.tavern.auction.inventory.unlock(winner.id,state.id,state.revealOrder);
  }

  advanceReveal(room, now) {
    const state=room.data,r=state.reveal;
    if(!r || r.complete || !r.running) return;
    this.setOpened(room,Math.min(state.itemCount,r.baseCount+Math.floor((now-r.startedAt)/ROOM_REVEAL_MS)),now);
  }

  setOpened(room, count, now) {
    const state=room.data,r=state.reveal;
    if(count<=r.count) return;
    r.count=count;r.last=state.revealOrder[count-1];
    if(count===state.itemCount){r.complete=true;r.running=false;r.completedAt=now;this.unlock(room);}
    this.save(room);
  }

  reveal(p, now=p.now??Date.now()) {
    const room=this.forPlayer(p,true),r=room.data.reveal;
    if(room.status!=="settled" || !r) throw Error("这一仓尚未进入共享揭晓。");
    if(!["start","pause","next","all"].includes(p.mode)) throw Error("无效揭晓操作。");
    this.advanceReveal(room,now);
    if(r.complete) return this.view(p,now);
    if(p.mode==="start") {
      if(!r.running){this.setOpened(room,r.count+1,now);if(!r.complete){r.running=true;r.baseCount=r.count;r.startedAt=now;this.save(room);}}
    } else if(p.mode==="pause") {
      r.running=false;this.save(room);
    } else if(!r.running && Number.isInteger(p.step) && p.step===r.count) {
      this.setOpened(room,p.mode==="all"?room.data.itemCount:r.count+1,now);
    } else throw Error("揭晓进度已变化，请刷新后继续。");
    return this.view(p,now);
  }

}

function hash08(text) {
  let h = 7;
  for (const ch of String(text)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}
