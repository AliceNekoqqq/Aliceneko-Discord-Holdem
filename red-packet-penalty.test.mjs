import test from 'node:test';
import assert from 'node:assert/strict';
import {GhostService} from './ghost-service.mjs';

const GUILD='100', PACKET='200', USER='300';
function harness(t,{nick='豆包',global_name='全局名',username='user'}={}){
 let now=1_000_000;
 const data=new Map(),member={nick,user:{global_name,username}};
 const storage={get:async k=>data.get(k),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k),setAlarm:async v=>data.set('alarm',v),deleteAlarm:async()=>data.delete('alarm')};
 const svc=Object.create(GhostService.prototype);svc.storage=storage;svc.host={ctx:{storage},env:{}};svc.env={};svc.rank={};
 t.mock.method(Date,'now',()=>now);
 const requests=[];let patchFailure=null;
 svc.api=async(path,method='GET',body)=>{
  requests.push({path,method,body});
  if(method==='GET')return structuredClone(member);
  if(patchFailure){const e=patchFailure;patchFailure=null;if(e.remote)member.nick=body.nick;throw e;}
  member.nick=body.nick;return null;
 };
 return {svc,storage,data,member,requests,setNow:v=>{now=v;},failNextPatch:e=>{patchFailure=e;}};
}
const records=h=>h.data.get('ghostPenalties')||{};

test('💩昵称在领取后十分钟恢复原昵称',async t=>{
 const h=harness(t);const at=Date.now();
 assert.deepEqual(await h.svc.poop(GUILD,PACKET,USER,at),{status:'active',error:undefined});
 let p=records(h)[`poop:${PACKET}:${USER}`];assert.equal(p.restoreAt,at+600_000);assert.equal(h.member.nick,'💩豆包');
 h.setNow(at+599_999);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'💩豆包');
 h.setNow(at+600_000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'豆包');assert.equal(records(h)[p.id].status,'restored');
});

test('重复红包回调不重设昵称，也不延长恢复时间',async t=>{
 const h=harness(t),at=Date.now();await h.svc.poop(GUILD,PACKET,USER,at);const before=records(h)[`poop:${PACKET}:${USER}`];
 h.setNow(at+100_000);assert.deepEqual(await h.svc.poop(GUILD,PACKET,USER,at),{status:'active',error:undefined});
 const after=records(h)[before.id];assert.equal(after.restoreAt,before.restoreAt);assert.equal(h.requests.filter(r=>r.method==='PATCH').length,1);
});

test('Discord权限拒绝保留失败状态，不伪称昵称已设置',async t=>{
 const h=harness(t);h.failNextPatch(Object.assign(new Error('forbidden'),{status:403}));
 const result=await h.svc.poop(GUILD,PACKET,USER,Date.now());assert.equal(result.status,'failed');
 assert.equal(records(h)[`poop:${PACKET}:${USER}`].error,'forbidden');assert.equal(h.member.nick,'豆包');
});

test('PATCH已生效但响应未知时，Alarm重试确认昵称并最终恢复',async t=>{
 const h=harness(t),at=Date.now();h.failNextPatch(Object.assign(new Error('timeout'),{remote:true}));
 assert.equal((await h.svc.poop(GUILD,PACKET,USER,at)).status,'applying');assert.equal(h.member.nick,'💩豆包');
 h.setNow(at+3_001);await h.svc.alarm(GUILD);assert.equal(records(h)[`poop:${PACKET}:${USER}`].status,'active');
 h.setNow(at+600_000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'豆包');
});

test('到期前玩家自行改名时，恢复任务保护外部昵称',async t=>{
 const h=harness(t),at=Date.now();await h.svc.poop(GUILD,PACKET,USER,at);h.member.nick='玩家的新昵称';
 h.setNow(at+600_000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'玩家的新昵称');assert.equal(records(h)[`poop:${PACKET}:${USER}`].status,'externally_changed');
});

test('再次中奖先剥掉已有💩前缀，沿用最初原名且不会叠前缀',async t=>{
 const h=harness(t,{nick:'💩💩豆包'}),at=Date.now();
 await h.storage.put('ghostPenalties',{'poop:199:300':{id:'poop:199:300',loser:USER,original:'豆包',nickname:'💩💩豆包',status:'active',restoreAt:at+100_000}});
 await h.svc.poop(GUILD,PACKET,USER,at);assert.equal(h.member.nick,'💩豆包');
 h.setNow(at+20_000);await h.svc.poop(GUILD,'201',USER,at+20_000);
 const ps=records(h),p=ps[`poop:201:${USER}`];assert.equal(h.member.nick,'💩豆包');assert.equal(p.original,'豆包');assert.equal(ps[`poop:${PACKET}:${USER}`].status,'superseded');
 h.setNow(at+620_000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'豆包');
});

test('昵称缺失时采用global_name作为基础昵称',async t=>{
 const h=harness(t,{nick:null,global_name:'显示名称'});await h.svc.poop(GUILD,PACKET,USER,Date.now());assert.equal(h.member.nick,'💩显示名称');assert.equal(records(h)[`poop:${PACKET}:${USER}`].original,null);
});

test('💩昵称截断到32个UTF-16单元并避免拆开代理对',async t=>{
 const h=harness(t,{nick:'😀'.repeat(20)});await h.svc.poop(GUILD,PACKET,USER,Date.now());
 const nick=h.member.nick;assert.equal(nick.length,32);assert.equal(nick,'💩'+'😀'.repeat(15));assert.equal(records(h)[`poop:${PACKET}:${USER}`].original,'😀'.repeat(20));
});

test('抽鬼牌临时昵称重叠时保留原始昵称，红包结束后不遗失恢复机会',async t=>{
 const h=harness(t,{nick:'鬼牌昵称'}),at=Date.now();
 const old={id:'round:1',loser:USER,original:'原始昵称',nickname:'鬼牌昵称',status:'active',restoreAt:at+300_000};
 await h.storage.put('ghostPenalties',{[old.id]:old});await h.svc.poop(GUILD,PACKET,USER,at);
 const p=records(h)[`poop:${PACKET}:${USER}`];assert.equal(p.original,'原始昵称');assert.equal(records(h)[old.id].status,'superseded');
 h.setNow(at+600_000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'原始昵称');
});


test('GET暂时失败会持久重试，随后设置昵称及到期恢复',async t=>{
 const h=harness(t),at=Date.now(),api=h.svc.api;let fail=true;h.svc.api=async(...a)=>{if(fail&&a[1]===undefined){fail=false;throw Error('temporary');}return api(...a);};
 assert.equal((await h.svc.poop(GUILD,PACKET,USER,at)).status,'preparing');assert.equal(h.member.nick,'豆包');
 h.setNow(at+60001);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'💩豆包');h.setNow(at+600000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'豆包');
});
test('新红包改名被拒绝时仍保留旧惩罚的恢复任务',async t=>{
 const h=harness(t,{nick:'鬼牌昵称'}),at=Date.now();const old={id:'round:1',loser:USER,original:'原始昵称',nickname:'鬼牌昵称',status:'active',until:at+300000,restoreAt:at+300000};await h.storage.put('ghostPenalties',{[old.id]:old});h.failNextPatch(Object.assign(Error('forbidden'),{status:403}));
 assert.equal((await h.svc.poop(GUILD,PACKET,USER,at)).status,'failed');assert.equal(records(h)[old.id].status,'active');h.setNow(at+300000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'原始昵称');
});

test('旧昵称惩罚重叠且新PATCH网络失败时仍能重试及恢复最初原名',async t=>{
 const h=harness(t,{nick:'鬼牌昵称'}),at=Date.now();const old={id:'round:1',loser:USER,original:'原始昵称',nickname:'鬼牌昵称',status:'active',until:at+300000,restoreAt:at+300000};await h.storage.put('ghostPenalties',{[old.id]:old});h.failNextPatch(Error('network'));
 assert.equal((await h.svc.poop(GUILD,PACKET,USER,at)).status,'applying');h.setNow(at+3001);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'💩鬼牌昵称');h.setNow(at+600000);await h.svc.alarm(GUILD);assert.equal(h.member.nick,'原始昵称');
});
