// Guild-scoped multiplayer rooms for the warehouse auction.
//
// M1 scope: create a room with a short code, join it from the same server,
// pick a role, ready up and start. Starting fills empty seats with the three
// NPC bidders, generates one warehouse and freezes it into the room state.
// Bidding rounds and escrow land in M2 - this module never touches wallets.

import { AUCTION_TIERS, generateAuction } from "./tavern-auction.mjs";
import { AUCTION_RATE } from "./tavern-auction-currency.mjs";
import { drawAuctionWarehouse } from "./tavern-auction-regions.mjs";
import { generateLargeAuction } from "./tavern-auction-large.mjs";
import { layoutAuction } from "./tavern-auction-board.mjs";

export const ROOM_SEATS = 4;
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WAITING_TTL = 30 * 60_000;
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

  dispatch(p) {
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

  mine(guild, id) {
    return this.one(
      `SELECT r.code FROM auction_rooms r
        JOIN auction_room_seats s ON s.code=r.code
        WHERE s.user_id=? AND r.guild_id=? AND r.status IN ('waiting','active')
        LIMIT 1`,
      id,
      guild,
    );
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

  view(p, now = Date.now()) {
    this.sweep(now);
    const mine = this.mine(p.guild, p.id);
    if (!mine) return { room: null };
    const room = this.row(mine.code);
    if (!room) return { room: null };
    const seats = this.seats(mine.code);
    const humans = seats.filter((s) => !s.npc);
    return {
      kind: "room",
      room: {
        code: room.code,
        status: room.status,
        tier: room.tier,
        host: room.host_id === p.id,
        you: p.id,
        seats: seats.map((s) => ({
          id: s.user_id,
          name: s.name,
          role: s.role,
          ready: Boolean(s.ready),
          npc: Boolean(s.npc),
          you: s.user_id === p.id,
        })),
        canStart:
          room.status === "waiting" &&
          room.host_id === p.id &&
          humans.every((s) => s.user_id === room.host_id || s.ready),
        started: room.status === "active" ? room.data : null,
      },
    };
  }

  create(p, now = Date.now()) {
    this.sweep(now);
    if (this.mine(p.guild, p.id))
      throw Error("你已经在一个房间里了，先退出来再开。");
    const tier = p.tier ?? "standard";
    if (!Object.hasOwn(AUCTION_TIERS, tier))
      throw Error("没有这个区域。");
    const code = this.newCode(),
      state = { round: 0, seats: [], startedAt: null };
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

  join(p, now = Date.now()) {
    this.sweep(now);
    const code = String(p.code ?? "").toUpperCase();
    if (!ROOM_CODE.test(code)) throw Error("房号是 6 位，别输错了。");
    const room = this.row(code);
    if (!room) throw Error("没有这个房间，可能已经散了。");
    if (room.guild_id !== p.guild) throw Error("这个房间不在这台服务器上。");
    if (room.status !== "waiting") throw Error("这局已经开始了，进不去了。");
    if (this.mine(p.guild, p.id)?.code === code)
      return this.view(p, now);
    if (this.mine(p.guild, p.id))
      throw Error("你已经在另一个房间里了。");
    const seats = this.seats(code);
    if (seats.length >= ROOM_SEATS) throw Error("人满了，等下一局吧。");
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

  leave(p, now = Date.now()) {
    const mine = this.mine(p.guild, p.id);
    if (!mine) return { room: null };
    const room = this.row(mine.code);
    if (room?.host_id === p.id || room?.status !== "waiting") {
      this.drop(mine.code);
      return { room: null };
    }
    this.sql.exec(
      "DELETE FROM auction_room_seats WHERE code=? AND user_id=?",
      mine.code,
      p.id,
    );
    return this.view(p, now);
  }

  setRole(p) {
    const mine = this.mine(p.guild, p.id);
    if (!mine) throw Error("你还没进房间。");
    const room = this.row(mine.code);
    if (room.status !== "waiting") throw Error("开局了就不能换能力了。");
    if (!ROLES.includes(p.role)) throw Error("没有这种能力。");
    const taken = this.seats(mine.code).find(
      (s) => s.role === p.role && s.user_id !== p.id,
    );
    if (taken) throw Error("这个能力有人选了，挑别的。");
    this.sql.exec(
      "UPDATE auction_room_seats SET role=? WHERE code=? AND user_id=?",
      p.role,
      mine.code,
      p.id,
    );
    return this.view(p);
  }

  setReady(p) {
    const mine = this.mine(p.guild, p.id);
    if (!mine) throw Error("你还没进房间。");
    const room = this.row(mine.code);
    if (room.status !== "waiting") return this.view(p);
    this.sql.exec(
      "UPDATE auction_room_seats SET ready=? WHERE code=? AND user_id=?",
      p.ready ? 1 : 0,
      mine.code,
      p.id,
    );
    return this.view(p);
  }

  start(p, now = Date.now()) {
    const mine = this.mine(p.guild, p.id);
    if (!mine) throw Error("你还没进房间。");
    const room = this.row(mine.code);
    if (room.host_id !== p.id) throw Error("只有房主能开局。");
    if (room.status !== "waiting") throw Error("这局已经开始了。");
    const seats = this.seats(mine.code).filter((s) => !s.npc);
    if (!seats.length) throw Error("房间里没人。");
    if (
      seats.some((s) => s.user_id !== room.host_id && !s.ready)
    )
      throw Error("还有人没准备好。");

    // Empty seats are filled by the three regular NPCs, in order.
    const usedRoles = new Set(seats.map((s) => s.role));
    const freeRoles = ROLES.filter((r) => !usedRoles.has(r));
    const npcSeats = [];
    for (let i = seats.length; i < ROOM_SEATS; i++) {
      const npc = NPC_SEATS[npcSeats.length];
      npcSeats.push({
        id: npc.id,
        name: npc.name,
        role: freeRoles[npcSeats.length] ?? "sophie",
      });
    }

    const tier = room.tier,
      { scale } = AUCTION_TIERS[tier],
      unit = AUCTION_RATE * scale,
      warehouse = drawAuctionWarehouse(tier, this.random),
      items = generateLargeAuction(
        this.random,
        unit,
        tier,
        warehouse,
        generateAuction,
      ),
      board = layoutAuction(items, room.code, warehouse);

    const state = {
      round: 1,
      startedAt: now,
      tier,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        cols: warehouse.cols,
        rows: warehouse.rows,
      },
      itemCount: items.length,
      total: items.reduce((s, x) => s + x.value, 0),
      board,
      items,
      seats: [
        ...seats.map((s) => ({ id: s.user_id, name: s.name, role: s.role })),
        ...npcSeats,
      ],
    };
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
    this.sql.exec(
      "UPDATE auction_rooms SET status='active', state=? WHERE code=?",
      JSON.stringify(state),
      room.code,
    );
    return this.view(p, now);
  }
}
