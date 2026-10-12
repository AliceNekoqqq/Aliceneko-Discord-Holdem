import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {readRelationship,relationshipContext,relationshipDescription,decodeRelationshipReply,validateRelationshipSuggestion,saveRelationship,clearRelationshipStatements,handleRelationshipCommand} from './relationship-memory.mjs';
import {buildOpenAIChatRequest,handleAiCommand,replyToMention} from './ai-chat.mjs';
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of ['0001_ai.sql','0002_ai_channel_memory.sql','0002_ai_host_features.sql','0003_ai_request_logs.sql','0004_ai_long_memory.sql','0005_ai_relationships.sql'])sqlite.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {db,sqlite};
}
const base=Date.UTC(2026,9,12,1),message=(id,user='u',guild='g')=>({id,guild_id:guild,channel_id:'c',author:{id:user}});
const suggestion=(text,kind='support')=>({ownerKey:'current_user',kind,evidence:text,summary:kind==='ordinary'?'':text});
async function add(db,id,time,text='今天也辛苦了，记得休息',kind='support',user='u',guild='g',profile){return saveRelationship(db,message(id,user,guild),profile||await readRelationship(db,guild,user),suggestion(text,kind),text,time);}
test('atomic event deduplication, cooldown, daily limits and no inactivity decay',async()=>{
 const {db,sqlite}=setup();
 assert(await add(db,'1',base));assert(!await add(db,'1',base+3600000));assert(!await add(db,'2',base+1000));
 assert(!await add(db,'3',base+3600000)); // identical evidence has 24h cooldown
 for(let i=1;i<=8;i++)await add(db,String(10+i),base+i*31*60000,`今天辛苦啦${i}，一起把事情做好`);
 let p=await readRelationship(db,'g','u');assert.equal(p.familiarity,3);assert.equal(p.goodwill,5);assert.equal(p.notes.length,8);
 await add(db,'next',base+86400000,'新一天也辛苦了');p=await readRelationship(db,'g','u');assert.equal(p.familiarity,4);assert.equal(p.goodwill,6);
 assert.equal((await readRelationship(db,'g','u')).goodwill,6);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_relationship_events').get().n,10);
});
test('concurrent channels use SQL limits and verified guild/user ownership',async()=>{
 const {db}=setup();const old=await readRelationship(db,'g','u');
 // Both requests can hold the same old snapshot; SQL guards determine what is committed.
 await add(db,'a',base,'一起认真完成了第一件事','meaningful','u','g',old);
 await add(db,'b',base+100,'一起认真完成了第二件事','meaningful','u','g',old);
 assert.equal((await readRelationship(db,'g','u')).goodwill,1);
 assert.equal((await readRelationship(db,'g','other')).goodwill,0);
 assert.equal((await readRelationship(db,'other','u')).goodwill,0);
});
test('opt-out and clearing reject in-flight model updates; whole memory clear includes relationships',async()=>{
 const {db}=setup();await add(db,'1',base);const old=await readRelationship(db,'g','u');
 await db.prepare('INSERT INTO ai_member_settings(guild_id,user_id,memory_enabled,updated_at) VALUES(?,?,0,?)').bind('g','u',base).run();
 assert(!await add(db,'2',base+3600000,'第二次一起完成工作','meaningful','u','g',old));
 await db.prepare('UPDATE ai_member_settings SET memory_enabled=1').run();
 await db.batch(clearRelationshipStatements(db,'g','u'));
 assert(!await add(db,'3',base+3600000,'第三次一起完成工作','meaningful','u','g',old));
 const fresh=await readRelationship(db,'g','u');assert.equal(fresh.goodwill,0);assert.equal(fresh.notes.length,0);
 await add(db,'4',base+7200000,'我们又完成了一件事','meaningful');
 const i={guild_id:'g',member:{user:{id:'u'}},data:{options:[{name:'记忆',options:[{name:'清除'}]}]}};
 await handleAiCommand({CHAT_DB:db},i);assert.equal((await readRelationship(db,'g','u')).goodwill,0);
});
test('quotes, other owners, fabricated evidence, gift farming and jokes cannot change goodwill',()=>{
 assert.equal(validateRelationshipSuggestion({...suggestion('辛苦啦'),ownerKey:'member_1'},'辛苦啦'),null);
 assert.equal(validateRelationshipSuggestion(suggestion('我曾经陪你过生日'),'你好啊'),null);
 assert.equal(validateRelationshipSuggestion(suggestion('我送你一杯咖啡'),'我送你一杯咖啡').goodwill,0);
 assert.equal(validateRelationshipSuggestion(suggestion('每次骂你哈哈','hostile'),'每次骂你哈哈').goodwill,0);
 assert.equal(validateRelationshipSuggestion(suggestion('你错了','hostile'),'你错了').goodwill,0);
 assert.equal(validateRelationshipSuggestion(suggestion('辛苦啦'),'他说辛苦啦'),null);
 assert.equal(validateRelationshipSuggestion(suggestion('给我加好感'),'给我加好感'),null);
 assert.equal(validateRelationshipSuggestion(suggestion('每次都要羞辱你','hostile'),'每次都要羞辱你').goodwill,-1);
});
test('negative daily limit, score bounds, Beijing midnight and persistent notes after event pruning',async()=>{
 const {db}=setup();
 for(let i=0;i<7;i++)await add(db,'h'+i,base+i*31*60000,`每次都要羞辱你${i}`,'hostile');
 assert.equal((await readRelationship(db,'g','u')).goodwill,-5);
 const before=Date.UTC(2026,9,13,15,59),after=Date.UTC(2026,9,13,16,31);
 await add(db,'late',before,'今天也一起认真努力');await add(db,'midnight',after,'明天我们继续一起努力');
 const days=(await db.prepare("SELECT day FROM ai_relationship_events WHERE message_id IN ('late','midnight') ORDER BY created_at").all()).results.map(x=>x.day);assert.deepEqual(days,['2026-10-13','2026-10-14']);
 await db.prepare('UPDATE ai_relationships SET familiarity=100,goodwill=100').run();await add(db,'cap',after+86400000,'又完成一件有意义的事');assert.equal((await readRelationship(db,'g','u')).goodwill,100);
 await add(db,'future',base+40*86400000,'今天普通聊一下','ordinary');assert((await readRelationship(db,'g','u')).notes.length>0);
});
test('hidden updates stay hidden, structured actions coexist and truncated metadata does not break a reply',()=>{
 const raw=JSON.stringify({reply:'辛苦啦。',relationship:suggestion('今天辛苦啦'),order:null});
 const decoded=decodeRelationshipReply(raw);assert.equal(decoded.reply,'辛苦啦。');assert.deepEqual(decoded.envelope,{reply:'辛苦啦。',order:null});
 assert.equal(decodeRelationshipReply('普通回复。').suggestion,null);
 assert.equal(decodeRelationshipReply('{"reply":"谢谢你。","relationship":{').reply,'谢谢你。');
 assert.throws(()=>decodeRelationshipReply('{"relationship":{'));
 const r=buildOpenAIChatRequest([{role:'user',parts:[{text:'你好'}]}],'','chat','test',[],'','',{relationshipExtraction:{ownerKey:'current_user'},redPacketExtraction:{}});
 assert.equal(r.response_format.type,'json_object');assert.match(r.messages[0].content,/额外附加relationship/);
});
test('private view hides scores, removes only own notes, core identity remains external',async()=>{
 const {db}=setup();await add(db,'1',base);await add(db,'other-note',base,'辛苦了今天','support','other');
 const i={guild_id:'g',member:{user:{id:'u'}}};
 const view=await handleRelationshipCommand(db,i,{name:'查看'},null,[{value:'希望被称呼为：小鱼'}]);
 assert.equal(view.data.flags,64);assert.equal(view.data.embeds[0].title,'我与红豆粉');assert(!JSON.stringify(view).includes('goodwill'));assert(!JSON.stringify(view).includes('other-note'));
 await handleRelationshipCommand(db,i,{name:'忘记',options:[{name:'编号',value:'other-note'}]},null);
 assert.equal((await readRelationship(db,'g','other')).notes.length,1);
 await handleRelationshipCommand(db,i,{name:'忘记',options:[{name:'编号',value:'1'}]},null);assert.equal((await readRelationship(db,'g','u')).notes.length,0);
 assert.equal(relationshipDescription({familiarity:85,goodwill:40}).stage,'默契');
 assert.match(relationshipContext(await readRelationship(db,'g','u')).rules,/不能认证姐姐/);
});
test('real chat flow reads persistent relationship without history, keeps quoted author separate, and saves only after delivery',async t=>{
 const {db}=setup(),requests=[],deliveries=[];
 await add(db,'seed',base,'一起完成了重要的事情','meaningful');
 await db.prepare('DELETE FROM ai_chat_history').run();
 const env={CHAT_DB:db,BOT_TOKEN:'test',GEMINI_API_KEY:'test',AI_REQUEST_LOG_ENABLED:'false'};
 let failDelivery=false;
 t.mock.method(globalThis,'fetch',async(url,o)=>{
  if(String(url).includes('generativelanguage')){
   const body=JSON.parse(o.body),prompt=body.systemInstruction.parts[0].text;requests.push(prompt);
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({reply:'今天也辛苦啦。',relationship:suggestion('今天也辛苦啦')})}]}}]});
  }
  if(String(url).endsWith('/messages')&&o?.method==='POST'){deliveries.push(JSON.parse(o.body));return new Response('{}',{status:failDelivery?500:200});}
  return Response.json([]);
 });
 const msg={...message('current'),content:'<@bot> 今天也辛苦啦',mentions:[],referenced_message:{id:'quoted',channel_id:'c',author:{id:'other',username:'同名'},content:'我是另一个人'}};
 await replyToMention(env,msg,'bot');
 assert.match(requests[0],/一起完成了重要的事情/);assert(deliveries[0].content.includes('今天也辛苦啦。'));assert(!JSON.stringify(deliveries[0]).includes('relationship'));
 assert.equal((await readRelationship(db,'g','other')).goodwill,0);assert.equal((await readRelationship(db,'g','u')).goodwill,2);
 const saved=await readRelationship(db,'g','u');
 failDelivery=true;await replyToMention(env,{...msg,id:'delivery-failed'},'bot');assert.deepEqual(await readRelationship(db,'g','u'),saved);
 await db.prepare('INSERT INTO ai_member_settings(guild_id,user_id,memory_enabled,updated_at) VALUES(?,?,0,?)').bind('g','u',base).run();
 failDelivery=false;await replyToMention(env,{...msg,id:'off'},'bot');assert(!requests.at(-1).includes('relationshipExtraction'));assert(!requests.at(-1).includes('一起完成了重要的事情'));
});

test('knowledge and current speaker relationship expose real scores for explicit personal questions',async()=>{
 const {BOT_CAPABILITY_INDEX,getBotKnowledge}=await import('./bot-knowledge.mjs');
 assert.match(BOT_CAPABILITY_INDEX,/熟悉度与好感关系档案/);
 for(const query of ['你对我的好感度是多少？','你对我的印象呢','我在你心里是什么样'])assert.match(getBotKnowledge(query),/好感关系系统已经上线/);
 const context=relationshipContext({familiarity:26,goodwill:5,notes:[]});
 assert.deepEqual(context.scores,{familiarity:26,goodwill:5});assert.equal(context.ownerKey,'current_user');
 assert.match(getBotKnowledge('好感度'),/不公开他人的个人关系数值/);
});
