import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MENU } from './tavern-catalog.mjs';
import { ART_MANIFEST, artEmbed, getArtUrl, imageAsset, loadArt, serveArt } from './tavern-art.mjs';

test('every permanent menu dish has a stable JPEG asset and the room is preserved', () => {
  assert.deepEqual(Object.keys(ART_MANIFEST), ['room', ...MENU.filter(item => !item.requiresEquipment).map(item => item.id)]);
  for (const id of Object.keys(ART_MANIFEST)) {
    assert.equal(imageAsset(id).filename, `${id}-v1.jpg`);
    assert.equal(imageAsset(id).mime, 'image/jpeg');
    assert.ok(imageAsset(id).bytes > 0);
    assert.equal(imageAsset(id).version, 'v1');
  }
  assert.equal(imageAsset('constructor'), null);
  const originalHashes = {
    room: 'c1d4967962810b9d5aed4488550b9993449688043f09259eaf7c7094e57c696f',
    milk: '3e699eed7a0a46030c7ccdfc6dc639c13850192d3749933f59b8f20502ec13a9',
    cake: 'f81325647a3d87790154b170ee5b33b2ac7a516548cbb5c780eaa5e72f65ade9',
    'mushroom-noodles': 'ee502b9bbe414dd9b1952927c46d9e8bed670591c05c6d230c8a97b6a1f4c368',
  };
  for (const [id, sha] of Object.entries(originalHashes)) assert.equal(imageAsset(id).sha256, sha, id);
});

test('art URLs and embeds are generated only for allowlisted IDs', () => {
  assert.equal(getArtUrl('room'), 'https://discord-holdem.aliceneko.workers.dev/art/room/v1.jpg');
  assert.equal(getArtUrl('../room'), null);
  assert.equal(getArtUrl('room/v2'), null);
  assert.deepEqual(artEmbed('cake'), [{ image: { url: getArtUrl('cake') } }]);
  assert.deepEqual(artEmbed('new-dish'), []);
  assert.equal(imageAsset(''), null);
});

test('all published static images match disk bytes and SHA and serve immutable GET and HEAD', async () => {
  assert.equal(await loadArt('unknown-id'), null);
  for (const id of Object.keys(ART_MANIFEST)) {
  const art = await loadArt(id);
  assert.ok(art.data instanceof Uint8Array);
  assert.equal(art.data.byteLength, imageAsset(id).bytes);
  assert.ok(art.data.byteLength <= 180 * 1024);
  const disk = readFileSync(new URL(`./assets/art/${id}-v1.jpg`, import.meta.url));
  assert.deepEqual(Buffer.from(art.data), disk);
  assert.equal(createHash('sha256').update(art.data).digest('hex'), imageAsset(id).sha256);
  assert.deepEqual([...art.data.slice(0, 2)], [0xff, 0xd8]);
  const response = await serveArt(new Request(`https://unit.test/art/${id}/v1.jpg`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('Content-Length'), String(art.data.byteLength));
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await response.arrayBuffer()).byteLength, art.data.byteLength);
  const head = await serveArt(new Request(`https://unit.test/art/${id}/v1.jpg`, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get('Content-Length'), String(art.data.byteLength));
  }
});

test('HEAD avoids response bytes; invalid paths and methods are rejected', async () => {
  const head = await serveArt(new Request('https://unit.test/art/milk/v1.jpg', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get('Content-Length'), String(imageAsset('milk').bytes));
  assert.equal((await serveArt(new Request('https://unit.test/art/constructor/v1.jpg'))).status, 404);
  assert.equal((await serveArt(new Request('https://unit.test/art/room/v2.jpg'))).status, 404);
  const post = await serveArt(new Request('https://unit.test/art/room/v1.jpg', { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
});

