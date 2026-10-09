import test from 'node:test';
import assert from 'node:assert/strict';
import { ART_MANIFEST, artEmbed, decodeArt, getArtUrl, imageAsset, loadArt, serveArt } from './tavern-art.mjs';

test('manifest has four stable JPEG asset IDs', () => {
  assert.deepEqual(Object.keys(ART_MANIFEST), ['room', 'milk', 'cake', 'mushroom-noodles']);
  for (const id of Object.keys(ART_MANIFEST)) {
    assert.equal(imageAsset(id).filename, `${id}-v1.jpg`);
    assert.equal(imageAsset(id).mime, 'image/jpeg');
    assert.ok(imageAsset(id).bytes > 0);
    assert.equal(imageAsset(id).version, 'v1');
  }
  assert.equal(imageAsset('constructor'), null);
});

test('art URLs and embeds are generated only for allowlisted IDs', () => {
  assert.equal(getArtUrl('room'), 'https://discord-holdem.aliceneko.workers.dev/art/room/v1.jpg');
  assert.equal(getArtUrl('../room'), null);
  assert.equal(getArtUrl('room/v2'), null);
  assert.deepEqual(artEmbed('cake'), [{ image: { url: getArtUrl('cake') } }]);
  assert.deepEqual(artEmbed('new-dish'), []);
  assert.equal(imageAsset(''), null);
});

test('payload decoder returns JPEG bytes and rejects missing or malformed records', () => {
  assert.deepEqual([...decodeArt({ mime: 'image/jpeg', base64: '/9j/AA==' })], [255, 216, 255, 0]);
  assert.equal(decodeArt(null), null);
  assert.equal(decodeArt({ mime: 'image/png', base64: 'AA==' }), null);
  assert.equal(decodeArt({ mime: 'image/jpeg', base64: '%' }), null);
});

test('generated payload is served with correct JPEG metadata and cached immutably', async () => {
  assert.equal(await loadArt('unknown-id'), null);
  const art = await loadArt('room');
  assert.ok(art.data instanceof Uint8Array);
  assert.equal(art.data.byteLength, imageAsset('room').bytes);
  assert.deepEqual([...art.data.slice(0, 2)], [0xff, 0xd8]);
  const response = await serveArt(new Request('https://unit.test/art/room/v1.jpg'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('Content-Length'), String(art.data.byteLength));
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await response.arrayBuffer()).byteLength, art.data.byteLength);
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
