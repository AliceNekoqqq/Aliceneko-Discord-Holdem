import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

function storage() {
  const db = new DatabaseSync(':memory:');
  const values = new Map();
  return {
    sql: { exec(q, ...args) { const statement = db.prepare(q); if (statement.columns().length) return { toArray: () => statement.all(...args), one: () => statement.all(...args)[0] }; statement.run(...args); return { toArray: () => [] }; } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } },
    get: async key => structuredClone(values.get(key)),
    put: async (key, value) => { if (typeof key === 'object') for (const [k, v] of Object.entries(key)) values.set(k, structuredClone(v)); else values.set(key, structuredClone(value)); },
    delete: async key => values.delete(key), setAlarm: async value => values.set('alarm', value), deleteAlarm: async () => values.delete('alarm'),
  };
}

async function loadWorker() {
  const source = (await readFile(new URL('./worker.mjs', import.meta.url), 'utf8'))
    .replace("import { DurableObject } from 'cloudflare:workers';", "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }")
    .replace(/from '(\.\/[^']+)'/g, (_, path) => `from ${JSON.stringify(new URL(path, import.meta.url).href)}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('signed lobby launch opens a private panel; chosen profession starts a v0.19 run in the guild tavern DO', async t => {
  const { default: worker, PokerTable } = await loadWorker();
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const env = { BOT_TOKEN: 'test-only', DISCORD_APPLICATION_ID: '123', DISCORD_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex') };
  const instances = new Map(), lookups = [], webhookEdits = [];
  env.TABLES = { idFromName: id => id, get: id => { lookups.push(id); if (!instances.has(id)) { const ctx = { storage: storage(), blockConcurrencyWhile: fn => fn(), waitUntil: () => {} }; instances.set(id, new PokerTable(ctx, env)); } const instance = instances.get(id); return { fetch: (url, options) => instance.fetch(new Request(url, options)) }; } };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => { if (String(url).includes('/webhooks/')) webhookEdits.push({ method: options.method, body: JSON.parse(options.body ?? '{}') }); return Response.json({ id: '9001' }); };
  t.after(() => { globalThis.fetch = previousFetch; });
  const sign = async (interaction, waits = []) => {
    const body = JSON.stringify(interaction), timestamp = String(Math.floor(Date.now() / 1000));
    const signature = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
    const response = await worker.fetch(new Request('https://test/interactions', { method: 'POST', body, headers: { 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature } }), env, { waitUntil: promise => waits.push(promise) });
    return response.json();
  };
  const base = { application_id: '123', guild_id: '3', channel_id: '701', member: { user: { id: '42', username: 'Alice' }, permissions: '0' }, token: 'private-token' };
  const waits = [];
  const launch = await sign({ ...base, id: '700', type: 3, message: { flags: 0 }, data: { custom_id: 't:3:any:lobbyPlay~rogue' } }, waits);
  assert.deepEqual(launch, { type: 5, data: { flags: 64 } });
  assert.deepEqual(lookups, ['tavern:3']);
  await Promise.all(waits);
  assert.equal(webhookEdits[0].method, 'PATCH');
  assert.ok(webhookEdits[0].body.embeds?.[0]?.title?.includes('灯下迷城'));

  const actionWaits = [];
  const started = await sign({ ...base, id: '701', type: 3, message: { flags: 64 }, data: { custom_id: 'rl:start:normal:warden' } }, actionWaits);
  assert.deepEqual(started, { type: 6 });
  await Promise.all(actionWaits);
  const db = instances.get('tavern:3').ctx.storage.sql;
  const run = JSON.parse(db.exec('SELECT snapshot FROM rogue_runs WHERE owner=?', '42').toArray()[0].snapshot);
  assert.equal(run.ruleVersion, 'lantern-rules-v0.19');
  assert.equal(run.professionId, 'warden');
  assert.equal(run.difficulty,0);assert.equal(run.room.type,'blessing');
  assert.equal(run.phase, 'ROOM');
});
