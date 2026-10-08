import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivatePanels} from './private-panels.mjs';
import {handPanel} from './liar-ui.mjs';
import * as game from './liar-engine.mjs';
import {imageMessage} from './liar-image.mjs';

function fixture(ctx){
 const map=new Map(),db={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)};
 const t=game.create('1','2','3','Alice');game.join(t,'4','Bob');game.start(t,'1');t.players[0].cards=[0,1];t.players[1].cards=[6,7,8];
 const p=new PrivatePanels(db,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'7'}),requests=[],messages=new Map();
 ctx.mock.method(globalThis,'fetch',async(url,opts={})=>{
  const body=opts.body?JSON.parse(opts.body instanceof FormData?opts.body.get('payload_json'):opts.body):null;
  const token=url.split('/webhooks/7/')[1].split('/')[0],message=messages.get(token);
  requests.push({token,url,method:opts.method,body});
  if(!message)return new Response(null,{status:503});
  if(opts.method==='PATCH'){Object.assign(message,body);return Response.json(message);}
  return Response.json(message);
 });
 const message=(id,mid)=>({id:mid,flags:64,interaction_metadata:{user:{id}},...handPanel(t,id)});
 const record=(id,token,mid)=>({epoch:t.epoch,send:{token,expires:Date.now()+60000,private:true,owner:id},panel:{token,expires:Date.now()+60000,private:true,owner:id,ref:'@original',id:mid,hand:t.handNo,version:-1},retire:[]});
 return {p,t,requests,messages,message,record};
}

test('a certified local owner cannot upload their hand into another recipient private message',async ctx=>{
 const f=fixture(ctx);f.messages.set('wrong',f.message('4','444'));await f.p.write({'1':f.record('1','wrong')});await f.p.sync(f.t);
 const writes=f.requests.filter(r=>r.method==='PATCH');assert(writes.every(r=>!r.body.embeds?.length&&!r.body.attachments?.length));
 assert.equal((await f.p.read())['1'],undefined);
});

test('concurrent hand refreshes verify both recipients and use concrete message IDs',async ctx=>{
 const f=fixture(ctx);f.messages.set('alice',f.message('1','111'));f.messages.set('bob',f.message('4','444'));
 await f.p.write({'1':f.record('1','alice'),'4':f.record('4','bob')});await f.p.sync(f.t);
 for(const [token,id,mid] of [['alice','1','111'],['bob','4','444']]){
  const writes=f.requests.filter(r=>r.token===token&&r.method==='PATCH');assert.equal(writes.length,1);assert(writes[0].url.endsWith('/'+mid));
  assert(writes[0].body.components.flatMap(r=>r.components).some(c=>c.custom_id?.includes(`p~${id}~`)));
 }
 const records=await f.p.read();assert.equal(records['1'].panel.ref,'111');assert.equal(records['4'].panel.ref,'444');
});

test('missing recipient, wrong bound controls, moved ID and failed verification never send a hand',async ctx=>{
 for(const mode of ['missing','controls','id','offline']){
  const f=fixture(ctx),m=f.message('1','111');if(mode==='missing')delete m.interaction_metadata;
  if(mode==='controls')m.components=handPanel(f.t,'4').components;
  if(mode!=='offline')f.messages.set('bad',m);
  await f.p.write({'1':f.record('1','bad',mode==='id'?'222':undefined)});await f.p.sync(f.t);
  assert(f.requests.filter(r=>r.method==='PATCH').every(r=>!r.body.embeds?.length&&!r.body.attachments?.length),mode);
 }
});

test('hand attachments have different owner signatures and filenames even for identical cards',async ctx=>{
 const f=fixture(ctx);f.t.players[1].cards=[...f.t.players[0].cards];
 const a=await imageMessage(f.t,'1',handPanel(f.t,'1')),b=await imageMessage(f.t,'4',handPanel(f.t,'4'));
 assert.notEqual(a.signature,b.signature);
 const payload=x=>JSON.parse(x.body.get('payload_json'));
 assert.notEqual(payload(a).attachments[0].filename,payload(b).attachments[0].filename);
 assert(payload(a).attachments[0].description.startsWith('Alice'));assert(payload(b).attachments[0].description.startsWith('Bob'));
});
