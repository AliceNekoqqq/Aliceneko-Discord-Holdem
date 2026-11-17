import test from 'node:test';
import assert from 'node:assert/strict';
import {openImagePreferences,handleImagePreferences,imagePreferencesInteraction} from './novelai-preferences-ui.mjs';
import {IMAGE_DEFAULTS,NovelAIService,handleImageCommand} from './novelai.mjs';
function fixture(){
 const map=new Map(),calls=[];const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async n=>map.set('alarm',n),deleteAlarm:async()=>map.delete('alarm')};
 const service=new NovelAIService({ctx:{storage},env:{NOVELAI_API_KEY:'not-used'}},()=>{throw Error('settings must not generate or send images');});
 const rpc=async p=>{calls.push(p);return service.dispatch(p);};
 const i={type:2,id:'11',guild_id:'3',channel_id:'2',member:{user:{id:'1'}}};
 const click=(action,extra={})=>({...i,type:3,message:{flags:64},data:{custom_id:'nip:3:1:'+action},...extra});
 const submit=(action,values,legacy=false)=>({...click(action),type:5,data:{custom_id:'nip:3:1:'+action,components:Object.entries(values).map(([custom_id,value])=>legacy?{type:1,components:[{type:4,custom_id,value}]}:{type:18,component:{type:4,custom_id,value}})}});
 return {map,calls,service,rpc,i,click,submit};
}
test('standalone entry opens an owner-bound ephemeral settings panel without asking for parameters',async()=>{
 const f=fixture(),r=await openImagePreferences(f.i,f.rpc);assert.equal(r.type,4);assert.equal(r.data.flags,64);assert.match(r.data.embeds[0].title,/我的生图/);assert.equal(r.data.components.length,4);assert.equal(r.data.components[0].components.length,5);
 for(const row of r.data.components)for(const c of row.components)assert(c.custom_id.startsWith('nip:3:1:'));
 const env={TABLES:{idFromName:n=>n,get:n=>({async fetch(url,o){const p=JSON.parse(o.body);return Response.json(await f.rpc(p));}})}};
 const actual=await handleImageCommand(env,f.i,{name:'偏好'});assert.equal(actual.data.flags,64);assert.equal(actual.data.components.length,4);
 assert(f.calls.every(c=>c.action==='查看'));assert(!f.map.has('novelaiState'));
});
test('basic and advanced modals use native labels, preserve own overrides and show defaults for blank fields',async()=>{
 const f=fixture();await f.rpc({action:'偏好',user:'1',params:{scale:6}});
 const r=await handleImagePreferences(f.click('basic'),f.rpc);assert.equal(r.type,9);assert.equal(r.data.components.length,5);
 assert(r.data.components.every(c=>c.type===18&&c.component.type===4));assert.equal(r.data.components.find(c=>c.component.custom_id==='scale').component.value,'6');assert.equal(r.data.components.find(c=>c.component.custom_id==='width').component.value,undefined);
 assert.match(r.data.components[0].component.placeholder,/832/);
 const a=await handleImagePreferences(f.click('advanced'),f.rpc);assert.equal(a.data.components.length,2);
});
test('numeric submit saves only edited group; blank values inherit; invalid saves are atomic',async()=>{
 const f=fixture();await f.rpc({action:'偏好',user:'1',params:{steps:40,seed:123,prompt_prefix:'mine'}});
 const r=await handleImagePreferences(f.submit('save_basic',{width:'1024',height:'1024',steps:'',scale:'6',n_samples:'1'}),f.rpc);
 assert.equal(r.type,7);assert.equal(r.data.flags,undefined);assert.match(r.data.content,/已保存/);
 assert.deepEqual(f.map.get('imagePreferences:1'),{seed:123,prompt_prefix:'mine',width:1024,height:1024,scale:6,n_samples:1});
 const before=structuredClone(f.map.get('imagePreferences:1'));
 const bad=await handleImagePreferences(f.submit('save_basic',{width:'999',height:'1024',steps:'28',scale:'5',n_samples:'1'}),f.rpc);assert.equal(bad.data.flags,64);assert.match(bad.data.content,/64/);assert.deepEqual(f.map.get('imagePreferences:1'),before);
 const incomplete=await handleImagePreferences(f.submit('save_basic',{width:'1024'}),f.rpc);assert.match(incomplete.data.content,/不完整/);assert.deepEqual(f.map.get('imagePreferences:1'),before);
 const other=await f.rpc({action:'查看',user:'2'});assert.deepEqual(other.preferences,{});
});
test('three template editors preserve full text, support explicit empty and per-section inheritance',async()=>{
 const f=fixture();
 const panel=await handleImagePreferences(f.click('templates'),f.rpc);assert.equal(panel.type,7);assert.equal(panel.data.components.length,4);
 const modal=await handleImagePreferences(f.click('edit_negative_prompt'),f.rpc);assert.equal(modal.type,9);assert.equal(modal.data.components[0].component.value,IMAGE_DEFAULTS.negative_prompt);assert(IMAGE_DEFAULTS.negative_prompt.length>1000);
 await handleImagePreferences(f.submit('save_prompt_prefix',{prompt_prefix:'  custom weights::  '}),f.rpc);assert.equal(f.map.get('imagePreferences:1').prompt_prefix,'  custom weights::  ');
 await handleImagePreferences(f.submit('save_prompt_suffix',{prompt_suffix:''},true),f.rpc);assert.equal(f.map.get('imagePreferences:1').prompt_suffix,'');
 await handleImagePreferences(f.click('inherit_prompt_prefix'),f.rpc);assert.equal(f.map.get('imagePreferences:1').prompt_prefix,undefined);assert.equal(f.map.get('imagePreferences:1').prompt_suffix,'');
});
test('dropdown options save private choices or restore just that field',async()=>{
 const f=fixture();
 await handleImagePreferences(f.click('select_sampler',{data:{custom_id:'nip:3:1:select_sampler',values:['k_euler']}}),f.rpc);assert.equal(f.map.get('imagePreferences:1').sampler,'k_euler');
 const r=await handleImagePreferences(f.click('select_sampler',{data:{custom_id:'nip:3:1:select_sampler',values:['inherit']}}),f.rpc);assert.equal(r.type,7);assert(!Object.hasOwn(f.map.get('imagePreferences:1'),'sampler'));
 const bad=await handleImagePreferences(f.click('select_model',{data:{custom_id:'nip:3:1:select_model',values:['bad']}}),f.rpc);assert.equal(bad.data.flags,64);assert.match(bad.data.content,/无效/);
});
test('reset requires confirmation and cancel keeps settings',async()=>{
 const f=fixture();await f.rpc({action:'偏好',user:'1',params:{scale:6}});
 const r=await handleImagePreferences(f.click('reset'),f.rpc);assert.match(r.data.content,/确定/);assert.equal(f.map.get('imagePreferences:1').scale,6);
 await handleImagePreferences(f.click('home'),f.rpc);assert.equal(f.map.get('imagePreferences:1').scale,6);
 await handleImagePreferences(f.click('reset_confirm'),f.rpc);assert(!f.map.has('imagePreferences:1'));
});
test('foreign owners, mismatched guilds, public buttons and invalid form/button types cannot mutate preferences',async()=>{
 const f=fixture();
 for(const i of [f.click('reset_confirm',{member:{user:{id:'2'}}}),f.click('reset_confirm',{guild_id:'4'}),f.click('reset_confirm',{message:{flags:0}}),f.click('save_basic')]){
  const before=f.calls.length,r=await handleImagePreferences(i,f.rpc);assert.equal(r.data.flags,64);assert.equal(f.calls.length,before);
 }
 const raw=f.submit('save_advanced',{seed:'123',cfg_rescale:'0.2'});delete raw.message;const r=await handleImagePreferences(raw,f.rpc);assert.equal(r.type,4);assert.equal(r.data.flags,64);
 await assert.rejects(f.rpc({action:'偏好编辑',user:'1',params:{},unset:['enabled']}));
 assert(imagePreferencesInteraction(f.click('home')));assert(!imagePreferencesInteraction({...f.i,data:{custom_id:'nip:3:1:home'}}));
});
