#!/usr/bin/env node

import {existsSync, readdirSync, statSync} from 'node:fs';
import {basename, relative, resolve, sep} from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

const SCOPES = Object.freeze({
  chat: [
    'ai-chat.mjs', 'relationship-memory.mjs', 'relationship-memory.test.mjs', 'chat-enrichment.mjs', 'discord-chat-context.mjs',
    'discord-gateway.mjs', 'migrations', 'ai-chat.test.mjs',
    'chat-enrichment.test.mjs', 'discord-chat-context.test.mjs',
    'gateway-concurrency.test.mjs', 'runtime-context.test.mjs',
    'CHAT_MESSAGE_PROTOCOL.md'
  ],
  lantern: [
    'rogue-*.mjs', 'rogue-*.test.mjs', 'docs/roguelike/CARD_GUIDANCE.md',
    'docs/roguelike/WORLD_STORY.md', 'docs/roguelike/RELEASE_GUIDANCE_BETA57.md'
  ],
  tavern: [
    'tavern-*.mjs', 'tavern-*.test.mjs', 'TAVERN_MENU_SPEC.md',
    'TAVERN_MAP_SPEC.md', 'RENOVATION_SPEC.md'
  ],
  worker: [
    'worker.mjs', 'wrangler.jsonc', '.github/workflows/deploy-cloudflare.yml',
    'lifecycle.mjs', 'worker.test.mjs', 'package.json'
  ],
  assets: [
    'scripts/build-*.py', 'scripts/build-pet-walk-map.mjs', 'assets',
    'static-art.mjs', 'equipment-art.mjs', 'tavern-art.mjs', 'pet-art.mjs',
    'pet-walk-map.mjs', 'card-image.mjs', 'card-glyphs.mjs', 'nickname-font.mjs',
    'nickname-glyphs.mjs', 'emoji-art.mjs', 'emoji-sprites.mjs',
    'equipment-art-manifest.mjs', 'tavern-art-manifest.mjs',
    'pet-art-manifest.mjs', 'pet-walk-art-manifest.mjs', 'test-static-assets.mjs'
  ]
});

const GENERATED = new Set([
  'equipment-art-manifest.mjs', 'tavern-art-manifest.mjs',
  'pet-art-manifest.mjs', 'pet-walk-art-manifest.mjs',
  'nickname-glyphs.mjs', 'card-glyphs.mjs', 'emoji-sprites.mjs',
  'card-glyphs.bin', 'nickname-glyphs.bin', 'emoji-sprites.bin'
]);

const isGenerated = file => GENERATED.has(basename(file))
  || /(?:PLAYTHROUGH|FULL_RUN_RESULTS)_.*\.json$/.test(file);

function allFiles(dir = ROOT) {
  const output = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'public') continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) output.push(...allFiles(path));
    else output.push(relative(ROOT, path).split(sep).join('/'));
  }
  return output;
}

const REPO_FILES = allFiles();

function matches(file, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}(?:$|/)`).test(file);
}

function filesForScope(scope) {
  const patterns = SCOPES[scope];
  if (!patterns) return [];
  const result = new Set();
  for (const pattern of patterns) {
    for (const file of REPO_FILES) if (matches(file, pattern)) result.add(file);
  }
  return [...result].sort();
}

function printFiles(files) {
  for (const file of files) {
    const path = resolve(ROOT, file);
    const bytes = existsSync(path) ? statSync(path).size : 0;
    const mark = isGenerated(file) ? ' [generated: inspect producer instead]' : '';
    console.log(`${String(bytes).padStart(8)} ${file}${mark}`);
  }
}

const requested = process.argv.slice(2).filter(Boolean);
const scopes = requested.length ? requested : Object.keys(SCOPES);
console.log(`root: ${ROOT}`);
console.log(`files indexed: ${REPO_FILES.length}`);
console.log('');

for (const scope of scopes) {
  if (!SCOPES[scope]) {
    console.error(`unknown scope: ${scope}; choose ${Object.keys(SCOPES).join(', ')}`);
    process.exitCode = 2;
    continue;
  }
  console.log(`## ${scope}`);
  printFiles(filesForScope(scope));
  console.log('');
}
