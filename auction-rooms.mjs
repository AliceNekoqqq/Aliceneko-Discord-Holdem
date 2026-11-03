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
  AUCTION_QUALITY_WEIGHTS,
  generateAuction,
  decideAuction,
  npcAuctionBid,
  revealAuction,
  shuffleAuction,
} from "./tavern-auction.mjs";
import { AUCTION_RATE } from "./tavern-auction-currency.mjs";
import { drawAuctionWarehouse } from "./tavern-auction-regions.mjs";
import { generateLargeAuction, largeCatalog } from "./tavern-auction-large.mjs";
import { layoutAuction } from "./tavern-auction-board.mjs";

export const ROOM_SEATS = 4;
export const ROOM_ROUNDS = 5;
export const ROOM_ROUND_MS = 60_000;
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
      case "roomBid":
        return this.bid(p);
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
        WHERE s.user_id=? AND r.guild_id=? AND r.status IN ('waiting','active')
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

  // --- views -------------------------------------------------------------
  view(p, now = p.now ?? Date.now()) {
    this.sweep(now);
    const mine = this.mineAny(p.guild, p.id);
    if (!mine) return { room: null };
    let room = this.row(mine.code);
    if (!room) return { room: null };
    if (room.status === "active") {
      this.advance(room, now);
      room = this.row(mine.code);
      if (!room) return { room: null };
    }
    const seats = this.seats(mine.code);
    const humans = seats.filter((s) => !s.npc);
    const state = room.data,
      live = room.status === "active",
      currentRow = live ? (state.bids[state.round - 1] ?? []) : [];
    return {
      room: {
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
          humans.every((s) => s.user_id === room.host_id || s.ready),
        started:
          live || room.status === "settled"
            ? {
                round: state.round,
                rounds: ROOM_ROUNDS,
                roundEndsAt: live ? state.roundEndsAt : null,
                budget: state.budget,
                warehouse: state.warehouse,
                itemCount: state.itemCount,
                history: state.history ?? [],
                result: state.result ?? null,
              }
            : null,
        result: state.result ?? null,
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
    const mine = this.mineAny(p.guild, p.id);
    if (!mine) return { room: null };
    const room = this.row(mine.code);
    if (!room) return { room: null };
    if (room.status === "active") throw Error("这局已经开始了，打完才能走。");
    if (room.status === "settled" || room.host_id === p.id) {
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

  // --- start -------------------------------------------------------------
  start(p, now = p.now ?? Date.now()) {
    const mine = this.mine(p.guild, p.id);
    if (!mine) throw Error("你还没进房间。");
    const room = this.row(mine.code);
    if (room.host_id !== p.id) throw Error("只有房主能开局。");
    if (room.status !== "waiting") throw Error("这局已经开始了。");
    const seated = this.seats(mine.code).filter((s) => !s.npc);
    if (!seated.length) throw Error("房间里没人。");
    if (seated.some((s) => s.user_id !== room.host_id && !s.ready))
      throw Error("还有人没准备好。");

    const tier = room.tier,
      { scale, budget, fee } = AUCTION_TIERS[tier],
      unit = AUCTION_RATE * scale,
      catalog = largeCatalog(tier),
      weights = AUCTION_QUALITY_WEIGHTS;

    // Hold fee + budget first: a player who cannot pay stops the start instead
    // of losing a warehouse they never bid on.
    for (const seat of seated)
      this.tavern.auctionCurrency.adjust(
        seat.user_id,
        -(fee + budget),
        `room:${room.code}:escrow:${seat.user_id}`,
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
      round: 1,
      roundEndsAt: now + ROOM_ROUND_MS,
      startedAt: now,
      tier,
      budget,
      fee,
      unit,
      priority: shuffleAuction([0, 1, 2, 3], this.random),
      seats,
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
      bids: [[], [], [], [], []],
      history: [],
      result: null,
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
    room.status = "active";
    room.data = state;
    this.save(room);
    return this.view(p, now);
  }

  // --- bidding -----------------------------------------------------------
  bid(p, now = p.now ?? Date.now()) {
    const mine = this.mineAny(p.guild, p.id);
    if (!mine) throw Error("你还没进房间。");
    let room = this.row(mine.code);
    if (room.status !== "active") throw Error("这局还没开始，或者已经结束了。");
    this.advance(room, now);
    room = this.row(mine.code);
    if (!room || room.status !== "active") throw Error("这一局已经结束了。");
    const state = room.data;
    const seat = state.seats.find((s) => s.id === p.id && !s.npc);
    if (!seat) throw Error("你不在这局里。");
    const bid = p.bid;
    if (!Number.isSafeInteger(bid) || bid < 0 || bid > state.budget)
      throw Error(`报价得是 0 到 ${state.budget} 之间的整数。`);
    state.bids[state.round - 1][seat.index] = bid;
    this.save(room);
    this.advance(this.row(mine.code), now);
    return this.view(p, now);
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
        bids: row.map((b) => b),
        winner: decision.winner,
        price: decision.price,
      });
      if (decision.done) {
        this.settle(room, decision);
        return;
      }
      state.round = round + 1;
      state.roundEndsAt = now + ROOM_ROUND_MS;
      this.save(room);
    }
  }

  npcBid(state, seat, round) {
    const info = {
      highCount: null,
      items: state.items.map(() => ({
        quality: null,
        width: null,
        height: null,
      })),
    };
    for (let r = 1; r <= round; r++)
      revealAuction(state.items, info, seat.role, r, this.random, 2);
    return Math.min(
      state.budget,
      npcAuctionBid(
        info,
        round,
        Math.abs(hash08(seat.id)) % 3,
        this.random,
        state.unit,
        state.catalog,
        state.weights,
        state.budget,
      ),
    );
  }

  settle(room, decision) {
    const state = room.data,
      now = Date.now(),
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
          `room:${code}:refund:${seat.id}`,
          "auction_room_refund",
          `房间 ${code} 结算`,
          now,
        );
    }
    if (winnerHuman)
      this.tavern.auction.inventory.acquire(
        { token: `room:${code}`, user_id: winnerHuman.id },
        { items: state.items, tier: state.tier },
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
}

function hash08(text) {
  let h = 7;
  for (const ch of String(text)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}
