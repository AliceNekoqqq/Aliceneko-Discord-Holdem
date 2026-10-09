import { validId, cleanText } from './tavern-catalog.mjs';

const WINDOW = 30 * 60 * 1000;
const TOUCH_INTERVAL = 60 * 1000;
const MAX_VISITORS = 40;
const MAX_TABLES = 8;
const AREAS = new Set(['commons', 'bar', 'window', 'quiet']);
const GAMES = new Set(['poker', 'uno', 'ghost', 'liar']);
const safeName = value => cleanText(value, 32).replace(/[@`*_~>|\[\]\\]/g, '') || '来客';
const safeLabel = (value, max = 24) => typeof value === 'string' ? cleanText(value, max).replace(/[@`*_~>|\[\]\\]/g, '') : '';
const safeBotId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,40}$/.test(value);

export class TavernMapService {
  constructor(host) {
    this.host = host;
    this.storage = host.storage || host;
    this.sql = this.storage.sql;
  }

  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  one(query, ...args) { return this.rows(query, ...args)[0] || null; }

  ensureSchema() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_map_visits (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL, last_visit INTEGER NOT NULL, kind TEXT NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_map_visits_recent ON tavern_map_visits(last_visit DESC)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_map_tables (channel TEXT PRIMARY KEY, epoch TEXT NOT NULL, snapshot TEXT NOT NULL, at INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_map_tables_expiry ON tavern_map_tables(expires DESC)');
    // Separate tables keep upgrades safe for existing SQLite DO databases.
    this.sql.exec("CREATE TABLE IF NOT EXISTS tavern_map_positions (user_id TEXT PRIMARY KEY, area TEXT NOT NULL CHECK(area IN ('commons','bar','window','quiet')), changed_at INTEGER NOT NULL)");
    this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_map_table_slots (channel TEXT PRIMARY KEY, epoch TEXT NOT NULL, slot INTEGER NOT NULL UNIQUE CHECK(slot>=0 AND slot<4))');
  }

  move({ id, area } = {}, now = Date.now(), schemaReady = false) {
    if (!validId(id) || !AREAS.has(area) || !Number.isSafeInteger(now)) return false;
    if (!schemaReady) this.ensureSchema();
    const prior = this.one('SELECT area,changed_at FROM tavern_map_positions WHERE user_id=?', id);
    if (prior && now < prior.changed_at) return false;
    if (prior?.area === area) return true;
    this.sql.exec('INSERT INTO tavern_map_positions(user_id,area,changed_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET area=excluded.area,changed_at=excluded.changed_at WHERE excluded.changed_at>=tavern_map_positions.changed_at', id, area, now);
    return true;
  }

  acquireTableSlot(channel, epoch, now, cleanup = true) {
    if (cleanup) this.sql.exec('DELETE FROM tavern_map_table_slots WHERE channel IN (SELECT channel FROM tavern_map_tables WHERE expires<=? OR json_extract(snapshot,\'$.closed\')=1)', now);
    const current = this.one('SELECT slot FROM tavern_map_table_slots WHERE channel=? AND epoch=?', channel, epoch);
    if (current) return current.slot;
    // Retire a channel's prior epoch before assigning the new incarnation.
    this.sql.exec('DELETE FROM tavern_map_table_slots WHERE channel=?', channel);
    const slot = this.one('SELECT n FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) WHERE n NOT IN (SELECT slot FROM tavern_map_table_slots) ORDER BY n LIMIT 1')?.n;
    if (slot == null) return null;
    this.sql.exec('INSERT INTO tavern_map_table_slots(channel,epoch,slot) VALUES(?,?,?)', channel, epoch, slot);
    return slot;
  }

  touch({ id, name, channel, kind = 'visit' } = {}, now = Date.now(), schemaReady = false) {
    if (!validId(id) || !validId(channel) || !Number.isSafeInteger(now) || !['visit', 'order', 'game'].includes(kind)) return false;
    const display = safeName(name);
    if (!schemaReady) this.ensureSchema();
    const prior = this.one('SELECT name,kind,last_visit FROM tavern_map_visits WHERE user_id=?', id);
    if (prior && now < prior.last_visit) return false;
    if (prior && prior.name === display && prior.kind === kind && now - prior.last_visit < TOUCH_INTERVAL) return false;
    this.sql.exec('INSERT INTO tavern_map_visits(user_id,name,channel,last_visit,kind) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,channel=excluded.channel,last_visit=excluded.last_visit,kind=excluded.kind', id, display, channel, now, kind);
    return true;
  }

  recordTable(input, now = Date.now()) {
    if (!input || !validId(input.guild) || !validId(input.channel) || typeof input.epoch !== 'string' || !input.epoch || input.epoch.length > 100 || !Number.isSafeInteger(now) || !Number.isSafeInteger(input.at) || input.at > now || !Number.isSafeInteger(input.expires) || input.expires <= input.at || typeof input.closed !== 'boolean' || !GAMES.has(input.game)) return false;
    const players = Array.isArray(input.players) ? input.players : null;
    if (!players || players.length > 10 || players.some(p => !p || typeof p.bot !== 'boolean' || (p.bot ? !safeBotId(p.id) : !validId(p.id)) || typeof p.name !== 'string') || new Set(players.map(p => p.id)).size !== players.length) return false;
    const snapshot = {
      guild: input.guild, channel: input.channel, epoch: input.epoch, at: input.at, expires: Math.min(input.expires, input.at + WINDOW),
      game: input.game, phase: safeLabel(input.phase, 24),
      players: players.map(p => ({ id: p.id, name: safeName(p.name), bot: p.bot })), closed: input.closed,
    };
    this.ensureSchema();
    const prior = this.one('SELECT epoch,at,snapshot FROM tavern_map_tables WHERE channel=?', input.channel);
    if (prior) {
      if (prior.epoch !== snapshot.epoch && snapshot.closed) return false;
      if (JSON.parse(prior.snapshot).closed && prior.epoch === snapshot.epoch && !snapshot.closed) return false;
      if (input.at <= prior.at) return false;
    }
    const write = () => {
      const displaySlot = snapshot.closed ? null : this.acquireTableSlot(snapshot.channel, snapshot.epoch, now);
      if (snapshot.closed) {
        if (prior?.epoch !== snapshot.epoch) return;
        this.sql.exec('DELETE FROM tavern_map_table_slots WHERE channel=? AND epoch=?', snapshot.channel, snapshot.epoch);
        this.sql.exec('INSERT INTO tavern_map_tables(channel,epoch,snapshot,at,expires) VALUES(?,?,?,?,?) ON CONFLICT(channel) DO UPDATE SET epoch=excluded.epoch,snapshot=excluded.snapshot,at=excluded.at,expires=excluded.expires', snapshot.channel, snapshot.epoch, JSON.stringify(snapshot), snapshot.at, snapshot.expires);
      } else {
        this.sql.exec('INSERT INTO tavern_map_tables(channel,epoch,snapshot,at,expires) VALUES(?,?,?,?,?) ON CONFLICT(channel) DO UPDATE SET epoch=excluded.epoch,snapshot=excluded.snapshot,at=excluded.at,expires=excluded.expires', snapshot.channel, snapshot.epoch, JSON.stringify(snapshot), snapshot.at, snapshot.expires);
      }
      if (!snapshot.closed) for (const player of snapshot.players) if (!player.bot) this.touch({ id: player.id, name: player.name, channel: snapshot.channel, kind: 'game' }, snapshot.at, true);
    };
    this.storage.transactionSync(write);
    return true;
  }

  board(now = Date.now()) {
    this.ensureSchema();
    this.sql.exec('DELETE FROM tavern_map_table_slots WHERE channel IN (SELECT channel FROM tavern_map_tables WHERE expires<=? OR json_extract(snapshot,\'$.closed\')=1)', now);
    const cutoff = now - WINDOW;
    const visitorCount = this.one('SELECT COUNT(*) AS n FROM tavern_map_visits WHERE last_visit>=? AND last_visit<=?', cutoff, now)?.n || 0;
    const activeTables = this.rows("SELECT tm.snapshot FROM tavern_map_tables tm LEFT JOIN tavern_map_table_slots ts ON ts.channel=tm.channel AND ts.epoch=tm.epoch WHERE tm.expires>? AND tm.at<=? AND json_extract(tm.snapshot,'$.closed')=0 ORDER BY CASE WHEN ts.slot IS NULL THEN 1 ELSE 0 END,ts.slot,tm.at DESC,tm.channel LIMIT ?", now, now, MAX_TABLES).map(row => JSON.parse(row.snapshot));
    for (const t of [...activeTables].sort((a,b) => a.at-b.at || a.channel.localeCompare(b.channel))) this.acquireTableSlot(t.channel, t.epoch, now, false);
    const visitorRows = this.rows('SELECT v.user_id,v.name,v.kind,v.last_visit,p.area,p.changed_at FROM tavern_map_visits v LEFT JOIN tavern_map_positions p ON p.user_id=v.user_id WHERE v.last_visit>=? AND v.last_visit<=? ORDER BY v.last_visit DESC,v.user_id LIMIT ?', cutoff, now, MAX_VISITORS);
    const inGame = new Map();
    if (visitorRows.length) {
      const ids = visitorRows.map(v => v.user_id);
      const marks = ids.map(() => '?').join(',');
      const memberships = this.rows(`WITH membership AS (SELECT json_extract(player.value,'$.id') AS user_id,t.channel,t.at,ROW_NUMBER() OVER(PARTITION BY json_extract(player.value,'$.id') ORDER BY t.at DESC,t.channel) AS rn FROM tavern_map_tables t JOIN json_each(t.snapshot,'$.players') player WHERE t.expires>? AND t.at<=? AND json_extract(t.snapshot,'$.closed')=0 AND json_extract(player.value,'$.bot')=0 AND json_extract(player.value,'$.id') IN (${marks})) SELECT user_id,channel,at FROM membership WHERE rn=1`, now, now, ...ids);
      for (const row of memberships) inGame.set(row.user_id, { area: 'game', changedAt: row.at, tableChannel: row.channel });
    }
    const visitors = visitorRows.map(v => ({ id: v.user_id, name: v.name, kind: v.kind, lastVisit: v.last_visit, location: inGame.get(v.user_id) || { area: v.area || 'commons', changedAt: v.changed_at ?? v.last_visit } }));
    const tables = activeTables.map(t => ({ ...t, displaySlot: this.one('SELECT slot FROM tavern_map_table_slots WHERE channel=? AND epoch=?', t.channel, t.epoch)?.slot ?? null })).sort((a,b) => (a.displaySlot ?? 99)-(b.displaySlot ?? 99) || a.channel.localeCompare(b.channel));
    const tableCount = this.one("SELECT COUNT(*) AS n FROM tavern_map_tables WHERE expires>? AND at<=? AND json_extract(snapshot,'$.closed')=0", now, now)?.n || 0;
    let recentOrders = { orderCount: 0, paidOrders: 0 };
    if (this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='tavern_orders'")) {
      const row = this.one('SELECT COUNT(*) AS orderCount,COALESCE(SUM(CASE WHEN price>0 THEN 1 ELSE 0 END),0) AS paidOrders FROM tavern_orders WHERE at>=? AND at<=?', cutoff, now);
      if (row) recentOrders = { orderCount: row.orderCount || 0, paidOrders: row.paidOrders || 0 };
    }
    return { source: 'program_confirmed_tavern_map', at: now, windowMs: WINDOW, visitors, visitorCount, tables, tableCount, recentOrders };
  }

  nextExpiry(now = Date.now()) {
    this.ensureSchema();
    const visit=this.one('SELECT MIN(last_visit) AS at FROM tavern_map_visits WHERE last_visit>=? AND last_visit<=?',now-WINDOW,now)?.at;
    const table=this.one("SELECT MIN(expires) AS at FROM tavern_map_tables WHERE expires>? AND at<=? AND json_extract(snapshot,'$.closed')=0",now,now)?.at;
    const candidates=[visit==null?null:visit+WINDOW+1,table].filter(x=>x!=null&&x>now);
    return candidates.length?Math.min(...candidates):null;
  }

  dispatch(p = {}, now = Date.now()) {
    if (p.action === 'mapTouch') return this.touch({ id: validId(p.id) ? p.id : null, name: p.name, channel: p.channel, kind: p.kind || 'visit' }, now);
    if (p.action === 'mapMove') {
      if (!validId(p.id) || !validId(p.channel) || !AREAS.has(p.area)) return false;
      this.ensureSchema();
      const prior = this.one('SELECT changed_at FROM tavern_map_positions WHERE user_id=?', p.id);
      if (prior && now < prior.changed_at) return false;
      return this.storage.transactionSync(() => {
        this.touch({ id: p.id, name: p.name, channel: p.channel, kind: 'visit' }, now);
        return this.move({ id: p.id, area: p.area }, now, true);
      });
    }
    if (p.action === 'mapBoard') {
      if (validId(p.id)) this.touch({ id: p.id, name: p.name, channel: p.channel, kind: 'visit' }, now);
      return this.board(now);
    }
    if (p.action === 'mapTable') return this.recordTable(p.table || p, now);
    throw Error('未知地图操作。');
  }
}

