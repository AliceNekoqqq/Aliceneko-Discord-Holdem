import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {RED_PACKET_OWNER,RED_PACKET_TTL,parseRedPacket,splitPacket,RedPackets,packetCard,prepareRedPacket} from './red-packet.mjs';
function setup(){const db=new DatabaseSync(':memory:');const store={sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r}}s.run(...a);return {toArray:()=>[]}}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};const tavern=new TavernService(store);return {db,store,tavern,packets:new RedPackets(tavern)}}
const message=(content='<@99> 给大家发一个600元的拼手气红包，名额5个。')=>({id:'123',guild_id:'1',channel_id:'2',author:{id:RED_PACKET_OWNER},mentions:[{id:'99'}],content});
const interaction=(user='10',extra={})=>({type:3,guild_id:'1',channel_id:'2',data:{custom_id:'rp:123'},member:{user:{id:user,username:'客人'}},message:{id:'456'},...extra});
test('only actual owner plus bot mention, no spoofed names, quoted instructions or negation',()=>{assert.deepEqual(parseRedPacket(message(),'99'),{total:600,slots:5,mode:'random'});for(const m of [{...message(),author:{id:'12345',username:'.aliceneko'}},{...message(),mentions:[],content:'发600元红包5份'},message('<@99> 不要发600元红包，名额5个'),message('<@99>\n> 发600元红包，名额5个')])assert.equal(parseRedPacket(m,'99'),null);});
test('amount validation never truncates decimals, negatives, ambiguities or excessive values',()=>{for(const text of ['发1.5元红包，名额1个','发-600元红包，名额5个','发600元红包和700元红包，名额5个','发1000001元红包，名额5个','发4元红包，名额5个','发600元红包'])assert.ok(parseRedPacket(message('<@99> '+text),'99').error);assert.equal(parseRedPacket(message('<@99> 发600酒馆币的均分红包，5个名额'),'99').mode,'equal');});
test('all splits conserve integer total and reserve minimum, random extremes and equal rounding',()=>{for(let total=1;total<=1000;total+=7)for(let slots=1;slots<=Math.min(total,100);slots+=3)for(const random of [()=>0,n=>n-1]){const parts=splitPacket(total,slots,'random',random);assert.equal(parts.length,slots);assert.equal(parts.reduce((a,b)=>a+b,0),total);assert.ok(parts.every(x=>Number.isInteger(x)&&x>=1));}assert.deepEqual(splitPacket(13,5,'equal'),[3,3,3,2,2]);});
test('create replay, restart, claim replay and exhaustion only credit once with no debit or daily cap',()=>{const {packets,tavern,store}=setup();tavern.member(RED_PACKET_OWNER,'姐姐',100);const before=tavern.member(RED_PACKET_OWNER).balance;const p=packets.create(message(),'99',100);assert.deepEqual(packets.create(message('<@99> 发100元红包，名额2个'),'99',200),p);packets.bind('123','456');let sum=0;for(let n=10;n<15;n++){const service=new RedPackets(new TavernService(store));const r=service.claim(interaction(String(n)),200);sum+=r.amount;const balance=tavern.member(String(n)).balance;assert.equal(service.claim(interaction(String(n)),300).repeated,true);assert.equal(tavern.member(String(n)).balance,balance);}assert.equal(sum,600);assert.equal(tavern.member(RED_PACKET_OWNER).balance,before);assert.equal(tavern.one('SELECT COUNT(*) n FROM tavern_daily').n,0);assert.throws(()=>packets.claim(interaction('15'),400),/领完/);assert.equal(packetCard(packets.view('123'),400).components[0].components[0].disabled,true);});
test('channel, guild, message and bot constraints reject before any credit; expired leftovers are not minted',()=>{const {packets,tavern}=setup();packets.create(message(),'99',100);packets.bind('123','456');for(const extra of [{guild_id:'3'},{channel_id:'4'},{message:{id:'789'}},{member:{user:{id:'10',bot:true}}}])assert.throws(()=>packets.claim(interaction('10',extra),200));assert.throws(()=>packets.claim(interaction(),100+RED_PACKET_TTL),/过期/);assert.equal(tavern.one('SELECT COUNT(*) n FROM tavern_members').n,0);});
test('wallet or ledger failure rolls back claim and member creation too',()=>{const {packets,db}=setup();packets.create(message(),'99',100);db.exec("CREATE TRIGGER reject_red BEFORE INSERT ON tavern_ledger WHEN NEW.kind='system_red_packet' BEGIN SELECT RAISE(ABORT,'fault'); END");assert.throws(()=>packets.claim(interaction(),200),/fault/);assert.equal(packets.view('123').claims.length,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM tavern_members').get().n,0);db.exec('DROP TRIGGER reject_red');assert.equal(packets.claim(interaction(),300).repeated,false);});
test('ordinary users never call mint RPC; parser failures never mint',async()=>{let calls=0;const env={TABLES:{get(){calls++;throw Error('no')},idFromName:x=>x}};assert.equal(await prepareRedPacket(env,{...message(),author:{id:'10'}},'99'),null);assert.ok((await prepareRedPacket(env,message('<@99> 发1.5元红包，名额1个'),'99')).error);assert.equal(calls,0);});

test('real screenshot and everyday variants accept omitted currency, changed order, fullwidth and Chinese numbers',()=>{
 const cases=[
  ['给大家发个600的拼手气红包！5个名额！',600,5,'random'],
  ['发个600红包，5个',600,5,'random'],
  ['给五个人发六百元的红包',600,5,'random'],
  ['发一个六百的拼手气红包，五个名额',600,5,'random'],
  ['发红包600，5个人',600,5,'random'],
  ['🧧给大家发个600块的红包，人数：5',600,5,'random'],
  ['发一万二千元的均分红包，名额十个',12000,10,'equal'],
  ['发６００元的平均红包，５个名额',600,5,'equal'],
  ['发红包，总额600，5份',600,5,'random']
 ];for(const [text,total,slots,mode]of cases)assert.deepEqual(parseRedPacket(message('<@99> '+text),'99'),{total,slots,mode},text);
 for(const text of ['发六百点五元红包，五个名额','发600红包，五个名额和六个名额','发−600红包，5个名额'])assert.ok(parseRedPacket(message('<@99> '+text),'99').error,text);
});

test('Gemini extraction is independently gated and must supply actual current-message numeric evidence',async()=>{
 const {validateExtractedPacket,decodePacketReply}=await import('./red-packet.mjs');
 const m=message('<@99> 给大家发一个六百的红包，五个名额');
 const data={total:600,slots:5,mode:'random',totalEvidence:'六百',slotsEvidence:'五'};
 assert.deepEqual(validateExtractedPacket(m,'99',data),{total:600,slots:5,mode:'random'});
 assert.ok(validateExtractedPacket(m,'99',{...data,total:6000}).error);
 assert.ok(validateExtractedPacket(m,'99',{...data,totalEvidence:'600'}).error);
 assert.equal(validateExtractedPacket({...m,author:{id:'55'}},'99',data),null);
 assert.deepEqual(decodePacketReply('```json\n{"reply":"试试手气。","packet":null}\n```'),{reply:'试试手气。',packet:null});
 assert.throws(()=>decodePacketReply('自然回复 {"packet":{}}'));
});

test('linked accounts share each packet allowance in either order, including old claims and restarts',async()=>{
 const {RED_PACKET_LINKED_ACCOUNTS:ids,RED_PACKET_REPEAT_LINES:lines}=await import('./red-packet.mjs');
 for(const order of [ids,[...ids].reverse()]){
  const {packets,tavern,store}=setup();packets.create(message(),'99',100);packets.bind('123','456');
  const first=packets.claim(interaction(order[0]),200),balance=tavern.member(order[0]).balance;
  const retry=new RedPackets(new TavernService(store)).claim(interaction(order[1]),300);
  assert.equal(retry.repeated,true);assert.ok(lines.includes(retry.publicNotice));assert.equal(packets.view('123').claims.length,1);
  assert.equal(tavern.one('SELECT COUNT(*) n FROM tavern_members WHERE id=?',order[1]).n,0);
  assert.equal(tavern.member(order[0]).balance,balance);assert.equal(tavern.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind='system_red_packet'").n,1);
  assert.ok(lines.includes(packets.claim(interaction(order[0]),400).publicNotice));
  assert.equal(packets.claim(interaction('20'),500).repeated,false);
  const second={...message(),id:'124'};packets.create(second,'99',600);
  assert.equal(packets.claim({...interaction(order[1]),data:{custom_id:'rp:124'},message:{id:'457'}},700).repeated,false);
  assert.equal(first.amount,retry.amount);
 }
 const {packets,tavern}=setup();packets.create(message(),'99',100);
 tavern.sql.exec('INSERT INTO tavern_red_claims VALUES(?,?,?,?)','123',ids[1],42,150);
 assert.equal(packets.claim(interaction(ids[0]),200).repeated,true);
});

test('linked duplicate sends a public followup while wallet acknowledgements stay private',async t=>{
 const {finishRedPacket}=await import('./red-packet.mjs');const calls=[];
 const env={DISCORD_APPLICATION_ID:'99',TABLES:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({repeated:true,amount:123,publicNotice:'文小弟领了一次还想领？贪心！'})})}};
 t.mock.method(globalThis,'fetch',async(url,opts)=>{calls.push({url,method:opts.method,body:JSON.parse(opts.body)});return Response.json({});});
 await finishRedPacket(env,{...interaction('1402174864827219978'),token:'token'});
 assert.equal(calls.length,2);assert.equal(calls[0].method,'PATCH');assert.match(calls[0].body.content,/大小号/);assert.doesNotMatch(calls[0].body.content,/123/);
 assert.equal(calls[1].method,'POST');assert.equal(calls[1].body.flags,0);assert.equal(calls[1].body.content,'文小弟领了一次还想领？贪心！');assert.deepEqual(calls[1].body.allowed_mentions,{parse:[]});
});

test('exclusive packet resolves only a real unique recipient, migrates old SQLite rows, and gates claims atomically',()=>{
 const {packets,tavern,db,store}=setup();
 const m={...message('<@99> 给 <@1402174864827219978> 发一个725元专属红包'),mentions:[{id:'99',bot:true},{id:'1402174864827219978'}]};
 assert.deepEqual(parseRedPacket(m,'99'),{total:725,slots:1,mode:'equal',kind:'exclusive',targetUserId:'1402174864827219978'});
 const p=packets.create(m,'99',100);assert.equal(p.target_user_id,'1402174864827219978');
 const card=packetCard(p,200);assert.match(card.embeds[0].title,/专属红包/);assert.match(card.embeds[0].description,/<@1402174864827219978>/);
 assert.throws(()=>packets.claim(interaction('10'),200),/指定收礼人/);assert.equal(tavern.one('SELECT COUNT(*) n FROM tavern_members').n,0);
 const associated=interaction('1360154014146363446');assert.equal(packets.claim(associated,300).amount,725);assert.equal(tavern.member('1360154014146363446').balance,785);
 const before=tavern.member('10').balance;assert.throws(()=>packets.claim(interaction('10'),400),/指定收礼人/);assert.equal(tavern.member('10').balance,before);
});
test('exclusive extraction and fallback reject absent, ambiguous, bot, self, or model-invented recipients without public downgrade',async()=>{
 const {validateExtractedPacket}=await import('./red-packet.mjs');
 const base={...message('<@99> 给 <@22> 发一个600元专属红包'),mentions:[{id:'99',bot:true},{id:'22'}]};
 const data={kind:'exclusive',targetUserId:'22',total:600,slots:1,mode:'equal',totalEvidence:'600'};
 assert.deepEqual(validateExtractedPacket(base,'99',data),{total:600,slots:1,mode:'equal',kind:'exclusive',targetUserId:'22'});
 assert.ok(validateExtractedPacket(base,'99',{...data,targetUserId:'23'}).error);
 assert.deepEqual(parseRedPacket({...base,content:'<@99> 给 <@22> 发600的专属红包'},'99'),{total:600,slots:1,mode:'equal',kind:'exclusive',targetUserId:'22'});
 assert.ok(validateExtractedPacket({...base,content:'<@99> 给 <@22> 发600红包'},'99',{...data,kind:'exclusive'}).error);
 for(const bad of [{...base,mentions:[{id:'99',bot:true}]},{...base,content:'<@99> 给 <@22> 和 <@23> 发一个600元专属红包',mentions:[{id:'99',bot:true},{id:'22'},{id:'23'}]},{...base,mentions:[{id:'99',bot:true},{id:RED_PACKET_OWNER}]}])assert.ok(parseRedPacket(bad,'99').error);
 const env={TABLES:{get(){throw Error('should not create')},idFromName:x=>x}};
 assert.ok((await prepareRedPacket(env,{...base,mentions:[{id:'99',bot:true}]},'99')).error);
});
test('SQLite upgrade adds exclusive target without changing a legacy packet',()=>{
 const {db,store,tavern}=setup();
 db.exec('DROP TABLE tavern_red_packets');
 db.exec('CREATE TABLE tavern_red_packets (id TEXT PRIMARY KEY,guild TEXT NOT NULL,channel TEXT NOT NULL,total INTEGER NOT NULL,slots INTEGER NOT NULL,mode TEXT NOT NULL,parts TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,message_id TEXT)');
 db.prepare('INSERT INTO tavern_red_packets VALUES(?,?,?,?,?,?,?,?,?,?)').run('old','1','2',60,2,'equal','[30,30]',10,1000,'456');
 const migrated=new RedPackets(new TavernService(store));
 assert.equal(migrated.view('old').total,60);assert.equal(migrated.view('old').target_user_id,null);
 assert.ok(db.prepare('PRAGMA table_info(tavern_red_packets)').all().some(c=>c.name==='target_user_id'));
});

test('exclusive amount evidence supports suffix and prefix numbers and rejects invalid or conflicting totals',async()=>{
 const {validateExtractedPacket}=await import('./red-packet.mjs');
 const m=content=>({...message(content),mentions:[{id:'99',bot:true},{id:'22'}]});
 for(const text of ['<@99> 给 <@22> 发一个六百的专属红包','<@99> 给 <@22> 发专属红包，金额600']){
 assert.equal(parseRedPacket(m(text),'99').total,600);
 assert.equal(validateExtractedPacket(m(text),'99',{kind:'exclusive',total:600,slots:1,mode:'equal',totalEvidence:text.includes('六百')?'六百':'600'}).targetUserId,'22');
 }
 for(const value of ['-600','1.5','1000001'])assert.ok(parseRedPacket(m(`<@99> 给 <@22> 发${value}元专属红包`),'99').error);
 assert.ok(parseRedPacket(m('<@99> 给 <@22> 发600元和700元专属红包'),'99').error);
});
