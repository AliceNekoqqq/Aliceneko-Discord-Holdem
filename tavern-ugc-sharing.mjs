import {validId} from './tavern-catalog.mjs';

// Public, published recipes only. Drafts, wallets and daily limits stay in the source tavern.
export class UGCSharedCatalog{
 constructor(storage){
  this.storage=storage;this.sql=storage.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS ugc_catalog_sources(guild TEXT PRIMARY KEY,revision INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS ugc_catalog_entries(id TEXT PRIMARY KEY,guild TEXT NOT NULL,data TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS ugc_catalog_meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL)');
  this.sql.exec("INSERT OR IGNORE INTO ugc_catalog_meta VALUES('version',0)");
 }
 rows(q,...a){return this.sql.exec(q,...a).toArray();}
 sync(p){
  if(!validId(p.guild))throw Error('共享菜单服务器无效。');
  if(p.entries!==undefined){
   if(!Number.isSafeInteger(p.sourceRevision)||p.sourceRevision<0||!Array.isArray(p.entries))throw Error('共享菜单版本无效。');
   for(const d of p.entries)if(d.guild!==p.guild||!/^ugc_[\w-]{10,60}$/.test(d.id)||!validId(d.user_id)||!['active','withdrawn'].includes(d.status)||!d.recipe)throw Error('共享菜品来源无效。');
   this.storage.transactionSync(()=>{
    const prior=this.rows('SELECT revision FROM ugc_catalog_sources WHERE guild=?',p.guild)[0];
    if(prior&&prior.revision>=p.sourceRevision)return;
    for(const d of p.entries){const old=this.rows('SELECT guild FROM ugc_catalog_entries WHERE id=?',d.id)[0];if(old&&old.guild!==p.guild)throw Error('共享菜品ID冲突。');}
    this.sql.exec('DELETE FROM ugc_catalog_entries WHERE guild=?',p.guild);
    for(const d of p.entries)this.sql.exec('INSERT INTO ugc_catalog_entries VALUES(?,?,?)',d.id,p.guild,JSON.stringify(d));
    this.sql.exec('INSERT INTO ugc_catalog_sources VALUES(?,?) ON CONFLICT(guild) DO UPDATE SET revision=excluded.revision',p.guild,p.sourceRevision);
    this.sql.exec("UPDATE ugc_catalog_meta SET value=value+1 WHERE key='version'");
   });
  }
  const version=this.rows("SELECT value FROM ugc_catalog_meta WHERE key='version'")[0].value;
  return {version,entries:Number(p.version)===version?null:this.rows('SELECT data FROM ugc_catalog_entries ORDER BY id').map(x=>JSON.parse(x.data))};
 }
 status(){return {version:this.rows("SELECT value FROM ugc_catalog_meta WHERE key='version'")[0].value,sources:this.rows('SELECT COUNT(*) AS n FROM ugc_catalog_sources')[0].n,dishes:this.rows("SELECT COUNT(*) AS n FROM ugc_catalog_entries WHERE json_extract(data,'$.status')='active'")[0].n,bootstrapComplete:!!this.rows("SELECT value FROM ugc_catalog_meta WHERE key='bootstrap'")[0]?.value};}
 async bootstrap(env){
  if(this.rows("SELECT value FROM ugc_catalog_meta WHERE key='bootstrap'")[0]?.value){
   for(const source of this.rows('SELECT guild,revision FROM ugc_catalog_sources')){
    const r=await env.TABLES.get(env.TABLES.idFromName(`tavern:${source.guild}`)).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'ugcShareExport',guild:source.guild,knownRevision:source.revision})});
    if(!r.ok)throw Error('ugc_catalog_refresh_failed');const d=await r.json();if(d.error)throw Error('ugc_catalog_refresh_failed');this.sync({...d,guild:source.guild,version:-1});
   }
   return {complete:true};
  }
  let after='';
  do{
   const r=await fetch(`https://discord.com/api/v10/users/@me/guilds?limit=200${after?`&after=${after}`:''}`,{headers:{Authorization:`Bot ${env.BOT_TOKEN}`},signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('ugc_catalog_guild_discovery_failed');
   const guilds=await r.json();if(!Array.isArray(guilds))throw Error('ugc_catalog_guild_discovery_invalid');
   for(const g of guilds){
    const response=await env.TABLES.get(env.TABLES.idFromName(`tavern:${g.id}`)).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'ugcShareExport',guild:g.id})});
    if(!response.ok)throw Error('ugc_catalog_backfill_failed');
    const data=await response.json();if(data.error)throw Error('ugc_catalog_backfill_failed');
    this.sync({...data,guild:g.id,version:-1});
   }
   after=guilds.length===200?guilds.at(-1).id:'';
  }while(after);
  this.sql.exec("INSERT OR REPLACE INTO ugc_catalog_meta VALUES('bootstrap',1)");return {complete:true};
 }
}

export async function syncSharedUgc(env,host,guild){
 if(!env.TABLES||!validId(guild))return;
 const ugc=host.ugc,local=ugc.shareState(guild);
 const r=await env.TABLES.get(env.TABLES.idFromName('ugc-global-catalog-v1')).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'ugcCatalog',guild,version:local.version,...(local.sourceRevision!==local.uploadedRevision?ugc.shareExport(guild):{})})});
 if(!r.ok)throw Error('共享菜品目录暂时繁忙，请稍后重试。');
 const data=await r.json();if(data.error||!Number.isSafeInteger(data.version))throw Error('共享菜品目录暂时繁忙，请稍后重试。');
 ugc.shareApply(data,local.sourceRevision);
}
