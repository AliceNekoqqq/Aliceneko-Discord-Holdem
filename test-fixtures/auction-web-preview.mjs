// Isolated, in-memory browser QA only. Never imported or deployed by the Worker.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AuctionWebAuth } from "../auction-web-auth.mjs";
import { handleAuctionWebsite } from "../auction-website.mjs";
import { TavernService } from "../tavern-service.mjs";
import { TavernAuction } from "../tavern-auction.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
function storage() {
  const db = new DatabaseSync(":memory:"),
    map = new Map();
  return {
    get: async (k) => map.get(k),
    put: async (k, v) => map.set(k, v),
    sql: {
      exec(q, ...a) {
        const s = db.prepare(q);
        if (s.columns().length) return { toArray: () => s.all(...a) };
        s.run(...a);
        return { toArray: () => [] };
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const auth = new AuctionWebAuth(storage()),
  tavern = new TavernService(storage());
globalThis.__TAVERN_NO_WELCOME_GRANT__=true;
let seed=7;
tavern._auction=new TavernAuction(tavern,n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;});
const sessions=new Map();
for(const [id,name] of [["101","隔离测试甲"],["102","隔离测试乙"]]){
  sessions.set(id,await auth.dispatch({kind:"sessionCreate",user:{id,name,avatar:null},
    guilds:[{id:"3",name:"网页隔离测试服",icon:null}],expires:Date.now()+3600000}));
  tavern.auctionCurrency.adjust(id,50_000_000,`qa:fund:${id}`,"test","isolated QA",Date.now());
}
const env = {
  DISCORD_CLIENT_SECRET: "test-only",
  DISCORD_APPLICATION_ID: "123456789012345678",
  BOT_TOKEN: "test-only",
  TABLES: {
    idFromName: (n) => n,
    get: (n) => ({
      fetch: async (u, o) => {
        const p = JSON.parse(o.body);
        try {
          return Response.json(
            n === "auction-web-auth-v1"
              ? await auth.dispatch(p)
              : await tavern.dispatch(p),
          );
        } catch (e) {
          return Response.json({ error: e.message }, { status: 400 });
        }
      },
    }),
  },
  ASSETS: {
    fetch: async (r) => {
      const path = new URL(r.url).pathname;
      try {
        let data = await readFile(resolve(root, "public", "." + path));
        if (path.endsWith("/app.js"))
          data = Buffer.from(
            `const qaUser=new URLSearchParams(location.search).get("qa_user")||"101";
const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(url,options={})=>nativeFetch(url,{...options,headers:{...Object.fromEntries(new Headers(options.headers)),"X-QA-User":qaUser}});
`+data
              .toString()
              .replace(
                'const PRIMARY = "https://auction.alicenekoqqq.cc.cd"',
                "const PRIMARY = location.origin",
              ),
          );
        return new Response(r.method === "HEAD" ? null : data, {
          headers: {
            "Content-Type": path.endsWith(".html")
              ? "text/html"
              : /\.m?js$/.test(path)
                ? "text/javascript"
                : path.endsWith(".css")
                  ? "text/css"
                  : path.endsWith(".svg")
                    ? "image/svg+xml"
                    : path.endsWith(".png")
                      ? "image/png"
                      : "image/webp",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};
const fetcher = async url => Response.json({user:{id:new URL(url).pathname.split("/").at(-1)},pending:false});
createServer(async (req, res) => {
  try {
    const url = "http://" + req.headers.host + req.url,
      headers = new Headers(req.headers);
    const identity=new URL(url).searchParams.get("qa_user")||req.headers["x-qa-user"]||"101";
    const selected=sessions.get(identity);
    if(!selected){res.writeHead(400);res.end("Unknown QA identity");return;}
    headers.set("Cookie", "__Host-auction_session=" + selected.token);
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 65536) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: Buffer.concat(chunks) }),
    });
    let response = await handleAuctionWebsite(request, env, {}, fetcher);
    if (!response) response = await env.ASSETS.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("QA server error");
  }
}).listen(Number(process.env.PORT) || 4173, "0.0.0.0", () =>
  console.log(
    "Isolated auction browser QA on port " + (process.env.PORT || 4173),
  ),
);
