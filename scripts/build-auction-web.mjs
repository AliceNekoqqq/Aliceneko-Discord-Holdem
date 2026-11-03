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
console.log(JSON.stringify({ website: target, items: 204, regions: 4 }));
