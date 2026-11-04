import { cp, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicAuctionData } from "../auction-website.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  target = resolve(process.argv[2] || resolve(root, "public/auction"));
await mkdir(target, { recursive: true });
await cp(resolve(root, "web/auction"), target, { recursive: true });
// The page splits its logic into small modules, so every import inside app.js
// carries that module's hash; otherwise a deploy could serve a stale module.
let app = await readFile(resolve(target, "assets/app.js"), "utf8");
for (const name of ["reveal-loop.mjs", "seat-stage.mjs", "opponent-stage.mjs", "sound.mjs"]) {
  const hash = createHash("sha256")
    .update(await readFile(resolve(target, "assets", name)))
    .digest("hex")
    .slice(0, 12);
  app = app.replace(`"./${name}"`, `"./${name}?v=${hash}"`);
}
await writeFile(resolve(target, "assets/app.js"), app);
let html = await readFile(resolve(target, "index.html"), "utf8");
for (const file of ["style.css", "app.js"]) {
  const hash = createHash("sha256")
    .update(await readFile(resolve(target, "assets", file)))
    .digest("hex")
    .slice(0, 12);
  html = html.replace(`./assets/${file}`, `./assets/${file}?v=${hash}`);
}
await writeFile(resolve(target, "index.html"), html);
for (const tier of ["small", "standard", "high", "collection"])
  await writeFile(
    resolve(target, `assets/catalog-${tier}.json`),
    JSON.stringify(publicAuctionData(tier)),
  );
console.log(JSON.stringify({ website: target, items: publicAuctionData("standard").items.length, regions: 4 }));
