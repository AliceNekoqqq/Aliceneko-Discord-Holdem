import test from 'node:test';
import assert from 'node:assert/strict';
import {DevilState,ITEM_DEFS} from './devil-roulette-engine.mjs';
import * as model from './duel-roulette-model.mjs';
import {board,panel,key,duelCommand,devilCommand} from './duel-roulette-ui.mjs';
import {DuelRouletteController} from './duel-roulette-controller.mjs';
import {DuelRoulettePenalties} from './duel-roulette-penalties.mjs';
const storage=()=>{const map=new Map();return {map,alarm:null,async get(k){return structuredClone(map.get(k));},async put(k,v){if(typeof k==='object')for(const [key,val]of Object.entries(k))map.set(key,structuredClone(val));else map.set(k,structuredClone(v));},async delete(k){for(const x of Array.isArray(k)?k:[k])map.delete(x);},async setAlarm(n){this.alarm=n;},async deleteAlarm(){this.alarm=null;}};};
const started=(type='duel',now=Date.now())=>{const t=model.create(type,'1','2','3','甲',null,now);model.accept(t,'4','乙',now);return t;};
test('independent commands keep the existing challenge/help/table format',()=>{
 assert.deepEqual([duelCommand.name,devilCommand.name],['死斗','恶魔轮盘']);
 for(const c of [duelCommand,devilCommand])assert.deepEqual(c.options.map(x=>x.name),['等待对手','发起挑战','牌桌','帮助']);
});
test('duel hides committed choices, rejects edits, and wins at two points',()=>{
 const t=started();model.choose(t,'1','rock',1);assert(!JSON.stringify(board(t)).includes('✊ 石头'));assert.throws(()=>model.choose(t,'1','paper',1),/不能修改/);
 model.choose(t,'4','scissors',1);assert.equal(t.round,2);assert.equal(t.scores['1'],1);
 assert.throws(()=>model.choose(t,'4','paper',1),/本轮已结束/);
 model.choose(t,'1','paper',2);model.choose(t,'4','rock',2);assert.equal(t.winner,'1');assert.equal(t.phase,'settled');assert.equal(t.penalty.muteMinutes,3);assert.equal(t.penalty.renameMinutes,5);
});
test('duel seven ties cancel and one-sided timeout scores without exposing future choices',()=>{
 const t=started();for(let r=1;r<=7;r++){model.choose(t,'1','rock',r);model.choose(t,'4','rock',r);}assert.equal(t.phase,'closed');assert(!t.penalty);
 const u=started();model.choose(u,'1','paper',1);model.expire(u,u.deadline+5000);assert.equal(u.scores['1'],1);assert.equal(u.round,2);assert.deepEqual(u.choices,{});
 const v=started();model.expire(v,v.deadline);assert.equal(v.phase,'closed');assert(!v.penalty);
});
test('roulette snapshots preserve a blank self-shot, private intel, and cylinder first-turn alternation',()=>{
 const t=started('devil_roulette'),s=DevilState.restore(t.state);s.turnPlayerId='1';s.loadFirstPlayer='1';s.shells=[false,true];s.pointer=0;s.items['1']=['magnifier'];s.items['4']=[];t.state=s.serialize();t.turn='1';
 const info=model.shootOrItem(t,'1','magnifier');assert.match(info.reveal,/空弹/);assert(!JSON.stringify(board(t)).includes(info.reveal));assert.match(JSON.stringify(panel(t,'1')),/当前这一发是空弹/);
 model.shootOrItem(t,'1','shoot_self');assert.equal(t.turn,'1');assert.deepEqual(t.state.knownShells['1'],{});
 model.shootOrItem(t,'1','shoot_opponent');assert.equal(t.state.hp['4'],3);assert.equal(t.turn,'4');assert.equal(t.state.loadFirstPlayer,'4');
});
test('roulette inverter hides counts and late alarms execute exactly one automatic shot',()=>{
 const t=started('devil_roulette'),s=DevilState.restore(t.state);s.turnPlayerId='1';s.shells=[true,false,true];s.pointer=0;s.items['1']=['inverter'];t.state=s.serialize();t.turn='1';
 model.shootOrItem(t,'1','inverter');assert.match(board(t).embeds[0].description,/数量暂时隐藏/);
 const due=t.deadline,token=t.state.turnToken;assert.equal(model.expire(t,due+30000),true);assert.equal(t.state.turnToken,token+1);assert.equal(model.expire(t,due+30000),false);
});
test('roulette stale tokens and invalid stolen items cannot mutate a saved session',()=>{
 const t=started('devil_roulette'),s=DevilState.restore(t.state);s.turnPlayerId='1';s.items['1']=['adrenaline'];s.items['4']=['cigarette'];t.state=s.serialize();t.turn='1';const before=structuredClone(t);
 assert.throws(()=>model.shootOrItem(t,'1','adrenaline','saw'),/请选择/);assert.deepEqual(t,before);
 assert.throws(()=>s.apply('shoot_self','1',{expectedToken:s.turnToken+1}),/过期/);
});
test('roulette death and surrender produce their original penalty durations',()=>{
 const t=started('devil_roulette');t.state.turnPlayerId='1';t.state.shells=[true,false];t.state.pointer=0;t.state.hp['4']=1;model.shootOrItem(t,'1','shoot_opponent');assert.equal(t.winner,'1');assert.equal(t.penalty.renameMinutes,10);
 const u=started('devil_roulette');u.state.hp['1']=2;assert.throws(()=>model.surrender(u,'1'),/必须继续/);u.state.hp['1']=3;model.surrender(u,'1');assert.equal(u.penalty.muteMinutes,3);assert.equal(u.penalty.renameMinutes,7);assert.equal(u.penalty.autoMuteMinutes,5);
});
test('all roulette item menus fit Discord component constraints',()=>{
 const t=started('devil_roulette');t.state.turnPlayerId='1';t.state.items['1']=['adrenaline','phone','medicine','magnifier'];t.state.items['4']=['beer','saw','beer'];
 const p=panel(t,'1');assert(p.components.length<=5);for(const r of p.components){assert(r.components.length<=5);for(const c of r.components){assert(c.custom_id.length<=100);if(c.options)assert.equal(new Set(c.options.map(o=>o.value)).size,c.options.length);}}
 assert.equal(Object.keys(ITEM_DEFS).length,9);
});
const host=()=>{const st=storage();return {ctx:{storage:st},env:{BOT_TOKEN:'test'},boards:{async queue(){},async flush(){}},async armAlarm(){},async syncBoard(){}};};
const interaction=(t,action,user='1',privateMessage=false)=>({id:crypto.randomUUID(),type:3,guild_id:'3',channel_id:'2',member:{user:{id:user},permissions:'0'},message:{id:'100',flags:privateMessage?64:0},data:{custom_id:key(t,action)}});
test('controller refuses another user, public copies of private buttons, and old epochs',async()=>{
 const h=host(),c=new DuelRouletteController(h),t=started('devil_roulette');t.messageId='100';t.state.turnPlayerId='1';await h.ctx.storage.put('table',t);
 for(const i of [interaction(t,'p~1~shoot_opponent','4',true),interaction(t,'p~1~shoot_opponent','1',false),{...interaction(t,'p~1~shoot_opponent','1',true),data:{custom_id:'dr:old:0:p~1~shoot_opponent'}}]){
  const before=await h.ctx.storage.get('table'),r=await c.dispatch({interaction:i},await h.ctx.storage.get('table'));assert.equal((await r.json()).data.flags,64);assert.deepEqual(await h.ctx.storage.get('table'),before);
 }
});
test('duel simultaneous submissions survive a version change, remain private, and are idempotent',async()=>{
 const h=host(),c=new DuelRouletteController(h),t=started();t.messageId='100';await h.ctx.storage.put('table',t);
 const a=interaction(t,'p~1~choose~1~rock','1',true),b=interaction(t,'p~4~choose~1~scissors','4',true);
 assert.equal((await (await c.dispatch({interaction:a},await h.ctx.storage.get('table'))).json()).type,7);
 await c.dispatch({interaction:b},await h.ctx.storage.get('table'));const after=await h.ctx.storage.get('table');assert.equal(after.round,2);assert.equal(after.scores['1'],1);
 await c.dispatch({interaction:b},await h.ctx.storage.get('table'));assert.deepEqual(await h.ctx.storage.get('table'),after);
});
test('new games discard old private panel credentials and reserve the active channel',async()=>{
 const h=host(),c=new DuelRouletteController(h);await h.ctx.storage.put('privatePanels',{encrypted:'old'});
 const i={id:'invite',type:2,guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'甲'}},data:{name:'死斗',options:[{name:'等待对手'}]}};
 const r=await c.dispatch({interaction:i},null);assert.equal((await r.json()).type,4);assert.equal(await h.ctx.storage.get('privatePanels'),undefined);
 const t=await h.ctx.storage.get('table');assert.equal(t.game,'duel');await c.dispatch({interaction:{...i,id:'other'}},t);assert.equal((await h.ctx.storage.get('table')).epoch,t.epoch);
});
test('persistent punishment applies once and records rename recovery before Discord mutation',async(tst)=>{
 const st=storage(),service=new DuelRoulettePenalties({ctx:{storage:st},env:{BOT_TOKEN:'test'}}),t=started('devil_roulette');model.settle(t,'1','胜利');const p=t.penalty;
 await service.dispatch({guild:'3',action:'create',penalty:p});await service.dispatch({guild:'3',action:'rename',id:p.id,user:'1'});await service.dispatch({guild:'3',action:'submit',id:p.id,user:'1',nickname:'临时昵称'});
 const old=globalThis.fetch;tst.after(()=>{globalThis.fetch=old;});let nick='原昵称',patches=0;
 globalThis.fetch=async(url,o={})=>{if(o.method==='PATCH'){const saved=(await st.get('duelRoulettePenalties'))[p.id];assert.equal(saved.original,'原昵称');if(saved.status==='applyingRename')assert(saved.restoreAt>Date.now());nick=JSON.parse(o.body).nick;patches++;return Response.json({nick});}return Response.json({nick});};
 const records=await st.get('duelRoulettePenalties');records[p.id].retryAt=Date.now()-1;await st.put('duelRoulettePenalties',records);await service.alarm('3');assert.equal(nick,'临时昵称');assert.equal(patches,1);await service.alarm('3');assert.equal(patches,1);
 const restore=await st.get('duelRoulettePenalties');restore[p.id].restoreAt=Date.now()-1;await st.put('duelRoulettePenalties',restore);await service.alarm('3');assert.equal(nick,'原昵称');assert.equal(patches,2);
});
test('external nickname edits survive restoration and permission failures are explicit',async(tst)=>{
 const st=storage(),service=new DuelRoulettePenalties({ctx:{storage:st},env:{BOT_TOKEN:'test'}}),t=started();model.settle(t,'1','胜利');const p=t.penalty;
 await service.dispatch({guild:'3',action:'create',penalty:p});const records=await st.get('duelRoulettePenalties');Object.assign(records[p.id],{status:'activeRename',nickname:'临时昵称',original:'原昵称',restoreAt:Date.now()-1});await st.put('duelRoulettePenalties',records);
 const old=globalThis.fetch;tst.after(()=>{globalThis.fetch=old;});let patches=0;globalThis.fetch=async(u,o={})=>{if(o.method==='PATCH')patches++;return Response.json({nick:'另行修改'});};await service.alarm('3');assert.equal(patches,0);assert.equal((await service.dispatch({guild:'3',action:'view',id:p.id})).status,'externallyChanged');
 const u=started();model.settle(u,'1','胜利');await service.dispatch({guild:'3',action:'create',penalty:u.penalty});await service.dispatch({guild:'3',action:'mute',id:u.penalty.id,user:'1'});const r=await st.get('duelRoulettePenalties');r[u.penalty.id].retryAt=Date.now()-1;await st.put('duelRoulettePenalties',r);globalThis.fetch=async()=>new Response('',{status:403});await service.alarm('3');const status=await service.dispatch({guild:'3',action:'view',id:u.penalty.id});assert.equal(status.status,'failed');assert.match(status.notice,/权限/);
});
test('late punishment choices cannot replace a committed result',async()=>{
 const st=storage(),service=new DuelRoulettePenalties({ctx:{storage:st},env:{BOT_TOKEN:'test'}}),t=started();model.settle(t,'1','胜利');await service.dispatch({guild:'3',action:'create',penalty:t.penalty});await service.dispatch({guild:'3',action:'mute',id:t.penalty.id,user:'1'});
 const before=await st.get('duelRoulettePenalties');await assert.rejects(()=>service.dispatch({guild:'3',action:'rename',id:t.penalty.id,user:'1'}),/已提交/);assert.deepEqual(await st.get('duelRoulettePenalties'),before);
});
