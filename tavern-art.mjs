const ART_VERSION = 'v1';
const ART_ORIGIN = 'https://discord-holdem.aliceneko.workers.dev';

const manifest = {
  room: { id: 'room', filename: 'room-v1.jpg', mime: 'image/jpeg', bytes: 165608, width: 960, height: 640, version: ART_VERSION },
  milk: { id: 'milk', filename: 'milk-v1.jpg', mime: 'image/jpeg', bytes: 60418, width: 512, height: 512, version: ART_VERSION },
  cake: { id: 'cake', filename: 'cake-v1.jpg', mime: 'image/jpeg', bytes: 63275, width: 512, height: 512, version: ART_VERSION },
  'mushroom-noodles': {
    id: 'mushroom-noodles', filename: 'mushroom-noodles-v1.jpg', mime: 'image/jpeg', bytes: 73406, width: 512, height: 512, version: ART_VERSION,
  },
};

export const ART_MANIFEST = Object.freeze(
  Object.fromEntries(Object.entries(manifest).map(([id, asset]) => [id, Object.freeze({ ...asset })])),
);

export function imageAsset(id) {
  if (typeof id !== 'string' || !Object.hasOwn(ART_MANIFEST, id)) return null;
  const asset = ART_MANIFEST[id];
  return { ...asset };
}

export function getArtUrl(id) {
  if (!Object.hasOwn(ART_MANIFEST, id)) return null;
  return `${ART_ORIGIN}/art/${id}/${ART_VERSION}.jpg`;
}

export function artEmbed(id) {
  const url = getArtUrl(id);
  return url ? [{ image: { url } }] : [];
}

export function decodeArt(record) {
  if (!record || record.mime !== 'image/jpeg' || typeof record.base64 !== 'string') return null;
  try {
    const binary = atob(record.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// The compiled image payload is supplied by the build step. Loading is lazy so
// callers without generated assets can still use the metadata and embeds.
export async function loadArt(id) {
  const asset = imageAsset(id);
  if (!asset) return null;
  let records;
  try {
    records = (await import('./tavern-art-data.mjs')).default;
  } catch {
    return null;
  }
  const record = records?.[id];
  const data = decodeArt(record);
  if (!data) return null;
  if (data.byteLength !== asset.bytes) return null;
  return { ...asset, data };
}

export async function serveArt(request) {
  const url = new URL(request.url);
  const match = /^\/art\/([a-z0-9-]+)\/v1\.jpg$/.exec(url.pathname);
  if (!match || !imageAsset(match[1])) return new Response('Not Found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const asset = imageAsset(match[1]);
  const headers = {
    'Content-Type': asset.mime,
    'Content-Length': String(asset.bytes),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (request.method === 'HEAD') return new Response(null, { headers });
  const loaded = await loadArt(asset.id);
  if (!loaded) return new Response('Not Found', { status: 404 });
  return new Response(loaded.data, { headers });
}
