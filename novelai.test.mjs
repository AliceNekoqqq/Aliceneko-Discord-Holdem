import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_DEFAULTS,BATCH_INTERVAL,NovelAIService,imageParameters,resolveImageParameters,imageRequest,decodeImageReply,handleImageCommand,imageSettingsReply,imageCommandGroup} from './novelai.mjs';
import {DEFAULT_POSITIVE_PREFIX,DEFAULT_POSITIVE_SUFFIX,DEFAULT_NEGATIVE_PROMPT} from './novelai-default-prompts.mjs';

function fixture(fetcher){
 const map=new Map();let now=100000,lock=Promise.resolve();
 const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
 const host={ctx:{storage,blockConcurrencyWhile(fn){const next=lock.then(fn);lock=next.catch(()=>{});return next;}},env:{NOVELAI_API_KEY:'test-secret',BOT_TOKEN:'bot-secret'}};
 const calls=[];
 const service=new NovelAIService(host,async(url,o)=>{calls.push({url,o});if(fetcher)return fetcher(url,o);if(url.includes('novelai.net'))return Response.json({images:[{image:'iVBORw0KGgo='}]});return Response.json({id:'999'});},()=>now);
 const request=(id='1',user='10',more={})=>service.dispatch({action:'绘制',user,id,channel:'20',prompt:'1girl, pink hair',...more});
 return {map,host,service,calls,request,advance:ms=>now+=ms,enable:()=>service.dispatch({action:'默认',admin:true,params:{enabled:true}})};
}
test('runtime fetch is invoked without rebinding this to the service, for generation and upload',async()=>{
 const f=fixture(),calls=[];
 const fetcher=async function(url,o){assert.equal(this,undefined);calls.push(url);if(url.includes('novelai.net')){assert.equal(o.redirect,'manual');return Response.json({images:[{image:'iVBORw0KGgo='}]});}return Response.json({id:'9'});};
 const service=new NovelAIService(f.host,fetcher,()=>100000);
 await service.dispatch({action:'绘制',user:'10',id:'1',channel:'20',prompt:'a cat'});await service.alarm();
 assert.equal(calls.length,2);assert.equal(f.map.get('novelaiState').recent[0].status,'sent');
});
test('provider and notice failures retain safe stage/status diagnostics without secrets or prompt content',async()=>{
 const f=fixture(async function(url){assert.equal(this,undefined);return url.includes('novelai.net')?Response.json({}, {status:500}):Response.json({}, {status:403});});
 await f.request();await f.service.alarm();const status=await f.service.dispatch({action:'status'}),last=status.recent.at(-1);
 assert.equal(status.transport,'fetch-wrapper-v1');assert.equal(last.stage,'provider_request');assert.equal(last.providerStatus,500);assert.equal(last.errorCode,'http');assert.equal(last.noticeDelivered,false);
 for(const text of ['test-secret','bot-secret','pink hair','"id"','"channel"'])assert(!JSON.stringify(status).includes(text));
});
test('parameters strictly validate bounds, types, dimensions and keys',()=>{
 for(const p of [{width:833},{width:0},{steps:51},{scale:'5'},{n_samples:5},{seed:1.1},{model:'unknown'},{quality:'true'},{prompt_prefix:'x'.repeat(4001)},{url:'https://evil.invalid'},{enabled:true}])assert.throws(()=>imageParameters(p));
 assert.throws(()=>resolveImageParameters({...IMAGE_DEFAULTS,width:1536,height:1536}));
 assert.equal(imageParameters({steps:28}).steps,28);
});
test('one-turn > per-user > global defaults; request supports v4 captions and random seeds',()=>{
 const p=resolveImageParameters({...IMAGE_DEFAULTS,scale:4,prompt_prefix:'watercolor'},{scale:5,steps:20},{scale:6,seed:123});
 const r=imageRequest('a cat',p);assert.equal(r.parameters.scale,6);assert.equal(r.parameters.steps,20);assert.equal(r.parameters.seed,123);assert.equal(r.parameters.v4_prompt.caption.base_caption,r.input);assert.match(r.input,/watercolor, a cat/);assert.equal(r.parameters.v4_negative_prompt.caption.base_caption,p.negative_prompt);
 assert(!imageRequest('a cat',{...p,model:'nai-diffusion-3'}).parameters.v4_prompt);
 assert(imageRequest('a cat',{...p,seed:-1}).parameters.seed>=0);
});
test('default templates bracket the AI body exactly, with a separate negative and no automatic fourth segment',()=>{
 const body='1girl, pink hair, sitting at a cafe, soft window light';
 const request=imageRequest(body,resolveImageParameters(IMAGE_DEFAULTS));
 assert.equal(request.input,DEFAULT_POSITIVE_PREFIX+', '+body+', '+DEFAULT_POSITIVE_SUFFIX);
 assert.equal(request.parameters.v4_prompt.caption.base_caption,request.input);
 assert.equal(request.parameters.negative_prompt,DEFAULT_NEGATIVE_PROMPT);
 assert.equal(request.parameters.v4_negative_prompt.caption.base_caption,DEFAULT_NEGATIVE_PROMPT);
 assert.equal(request.parameters.qualityToggle,false);
 assert.equal(imageRequest(body,resolveImageParameters(IMAGE_DEFAULTS,{prompt_prefix:'',prompt_suffix:'',quality:true})).input,body);
});
test('personal templates replace each selected section while missing fields inherit defaults; one-shot values stay transient',()=>{
 const prefs={prompt_prefix:'  user prefix  ',negative_prompt:'user negative'},once={prompt_suffix:'single-shot suffix'};
 const params=resolveImageParameters(IMAGE_DEFAULTS,prefs,once),request=imageRequest('AI body',params);
 assert.equal(request.input,'  user prefix  , AI body, single-shot suffix');assert.equal(request.parameters.negative_prompt,'user negative');
 assert.equal(resolveImageParameters(IMAGE_DEFAULTS,prefs).prompt_suffix,DEFAULT_POSITIVE_SUFFIX);
 assert.equal(prefs.prompt_suffix,undefined);assert.equal(IMAGE_DEFAULTS.prompt_suffix,DEFAULT_POSITIVE_SUFFIX);
});
test('all three template controls and private full-text viewing preserve supplied negative and long custom prompts',()=>{
 assert(DEFAULT_NEGATIVE_PROMPT.length>800);assert.equal(imageParameters({negative_prompt:DEFAULT_NEGATIVE_PROMPT}).negative_prompt,DEFAULT_NEGATIVE_PROMPT);
 const names=imageCommandGroup.options.find(x=>x.name==='默认').options.map(x=>x.name);
 for(const name of ['前置正面','后置正面','负面提示'])assert(names.includes(name));assert(!names.includes('质量词'));
 const result={defaults:IMAGE_DEFAULTS,preferences:{prompt_prefix:'custom'},queued:0};
 const r=imageSettingsReply(result,{范围:'defaults',提示词:'negative_prompt'});assert.equal(r.data.flags,64);assert.equal(r.data.embeds[0].description,'```\n'+DEFAULT_NEGATIVE_PROMPT+'\n```');assert(r.data.embeds[0].description.length<4096);
 const longNegative=DEFAULT_NEGATIVE_PROMPT+', '+DEFAULT_NEGATIVE_PROMPT;
 const longView=imageSettingsReply({defaults:{...IMAGE_DEFAULTS,negative_prompt:longNegative},preferences:{},queued:0},{范围:'defaults',提示词:'negative_prompt'});
 assert.equal(longView.data.embeds[0].description,'```\n'+longNegative+'\n```');
 const own=imageSettingsReply(result,{范围:'preferences',提示词:'prompt_suffix'});assert.match(own.data.embeds[0].description,/沿用默认/);
});
test('persisted global templates migrate once, preserving personal templates, rescale and frozen jobs',async()=>{
 const f=fixture();await f.enable();await f.request();
 const before=f.map.get('novelaiState');before.defaultsRevision=2;before.defaults.prompt_prefix='old';before.defaults.prompt_suffix='old suffix';before.defaults.negative_prompt='old negative';before.defaults.cfg_rescale=0.25;f.map.set('novelaiState',before);f.map.set('imagePreferences:10',{prompt_prefix:'mine'});
 const frozen=structuredClone(before.queue[0].request),s=await f.service.state();
 assert.equal(s.defaults.prompt_prefix,DEFAULT_POSITIVE_PREFIX);assert.equal(s.defaults.prompt_suffix,DEFAULT_POSITIVE_SUFFIX);assert.equal(s.defaults.negative_prompt,DEFAULT_NEGATIVE_PROMPT);assert.equal(s.defaults.cfg_rescale,0.25);assert.equal(s.defaultsRevision,5);assert.deepEqual(s.queue[0].request,frozen);assert.equal(f.map.get('imagePreferences:10').prompt_prefix,'mine');
 await f.service.dispatch({action:'默认',admin:true,params:{prompt_prefix:'new custom'}});assert.equal((await f.service.state()).defaults.prompt_prefix,'new custom');
});
test('tool evidence is restricted to the current request and explicit numeric overrides',()=>{
 const raw=image=>JSON.stringify({reply:'我来整理画面。',image,relationship:null});
 const candidate={prompt:'a cat',evidence:'画只猫',parameters:{steps:28,scale:8},parameterEvidence:{steps:'28步',scale:'CFG8'}};
 const r=decodeImageReply(raw(candidate),'帮我画只猫，28步');assert.equal(r.image.prompt,'a cat');assert.deepEqual(r.image.parameters,{steps:28});assert(!r.reply.includes('image'));
 for(const s of ['你好','朋友说“画只猫”，你怎么看？'])assert.equal(decodeImageReply(raw(candidate),s).image,null);
 assert.equal(decodeImageReply('今天过得怎么样？','你好').image,null);
 assert.deepEqual(decodeImageReply('{"reply":"好的","image":{','画只猫'),{reply:'好的',image:null});
 assert.throws(()=>decodeImageReply('{"image":{','画只猫'));
});
test('AI supplies per-image parameters and evidence, including colloquial numbers without numeric substrings',()=>{
 const raw=JSON.stringify({reply:'正在整理。',image:{prompt:'a cat',evidence:'我要一张猫图',parameters:{width:1024,height:1024,steps:24,scale:6},parameterEvidence:{width:'一千零二十四见方',height:'一千零二十四见方',steps:'二十四步',scale:'CFG六'}}});
 assert.deepEqual(decodeImageReply(raw,'我要一张猫图，一千零二十四见方，二十四步，CFG六').image.parameters,{width:1024,height:1024,steps:24,scale:6});
 const omitted=JSON.stringify({reply:'正在整理。',image:{prompt:'a cat',evidence:'我要一张猫图',parameters:{},parameterEvidence:{}}});
 assert.deepEqual(decodeImageReply(omitted,'我要一张猫图，1024*1024，24步').image.parameters,{});
});
test('AI decides the image intent without a keyword gate; backend validates only evidence and parameter bounds',()=>{
 const raw=JSON.stringify({reply:'正在整理。',image:{prompt:'a cat',evidence:'请把这个场景变成看得见的样子',parameters:{width:1024,height:1024},parameterEvidence:{width:'正方形边长1024',height:'正方形边长1024'}}});
 assert.deepEqual(decodeImageReply(raw,'请把这个场景变成看得见的样子，正方形边长1024').image.parameters,{width:1024,height:1024});
 const invalid=JSON.stringify({reply:'准备中。',image:{prompt:'cat',evidence:'画猫',parameters:{width:999},parameterEvidence:{width:'999'}}});
 assert.match(decodeImageReply(invalid,'画猫，999*1024').reply,/宽高须为64/);
 assert.equal(decodeImageReply(JSON.stringify({reply:'好的。',image:null}),'不要画猫').image,null);
});
test('new default and persisted defaults migrate to rescale .15 exactly once without changing preferences or frozen jobs',async()=>{
 assert.equal(IMAGE_DEFAULTS.cfg_rescale,0.15);
 const f=fixture();await f.enable();await f.request();
 const before=f.map.get('novelaiState');delete before.defaultsRevision;before.defaults.cfg_rescale=0;before.queue[0].request.parameters.cfg_rescale=0;f.map.set('novelaiState',before);f.map.set('imagePreferences:10',{cfg_rescale:0.3});
 const state=await f.service.state();assert.equal(state.defaults.cfg_rescale,0.15);assert.equal(state.queue[0].request.parameters.cfg_rescale,0);assert.equal(f.map.get('imagePreferences:10').cfg_rescale,0.3);
 await f.service.dispatch({action:'默认',admin:true,params:{cfg_rescale:0.25}});assert.equal((await f.service.state()).defaults.cfg_rescale,0.25);
});
test('approved opening migrates once and later developer closure stays closed',async()=>{
 const f=fixture(),s=await f.service.state();s.defaultsRevision=3;s.defaults.enabled=false;f.map.set('novelaiState',s);
 assert.equal((await f.service.dispatch({action:'status'})).enabled,true);assert.equal(f.map.get('novelaiState').defaultsRevision,5);
 await f.service.dispatch({action:'默认',admin:true,params:{enabled:false}});assert.equal((await f.service.dispatch({action:'status'})).enabled,false);
});
test('revision 5 replaces only persisted default prompt sections, preserving other settings, personal overrides and queued requests',async()=>{
 const f=fixture();await f.enable();await f.request();
 const s=f.map.get('novelaiState');s.defaultsRevision=4;
 Object.assign(s.defaults,{prompt_prefix:'old prefix',prompt_suffix:'old suffix',negative_prompt:'old negative',cfg_rescale:0.28,steps:31,enabled:false});
 const frozen=structuredClone(s.queue[0].request);f.map.set('novelaiState',s);
 f.map.set('imagePreferences:10',{prompt_prefix:'personal override'});
 const migrated=await f.service.state();
 assert.equal(migrated.defaultsRevision,5);
 for(const [key,expected] of Object.entries({prompt_prefix:DEFAULT_POSITIVE_PREFIX,prompt_suffix:DEFAULT_POSITIVE_SUFFIX,negative_prompt:DEFAULT_NEGATIVE_PROMPT}))assert.equal(migrated.defaults[key],expected);
 assert.equal(migrated.defaults.cfg_rescale,0.28);assert.equal(migrated.defaults.steps,31);assert.equal(migrated.defaults.enabled,false);
 assert.deepEqual(migrated.queue[0].request,frozen);assert.deepEqual(f.map.get('imagePreferences:10'),{prompt_prefix:'personal override'});
 await f.service.dispatch({action:'默认',admin:true,params:{prompt_prefix:'subsequent admin choice'}});
 assert.equal((await f.service.state()).defaults.prompt_prefix,'subsequent admin choice');
});
test('developer can close generation and trial ignores personal preferences',async()=>{
 const f=fixture();await f.service.dispatch({action:'默认',admin:true,params:{enabled:false}});assert.equal((await f.request()).accepted,false);assert.equal(f.calls.length,0);
 await f.service.dispatch({action:'偏好',user:'10',params:{steps:20}});
 await assert.rejects(f.request('2','10',{action:'试画'}));
 await f.request('2','10',{action:'试画',admin:true});assert.equal(f.map.get('novelaiState').queue[0].request.parameters.steps,28);
 await assert.rejects(f.service.dispatch({action:'默认',admin:false,params:{enabled:true}}));
});
test('preferences are user-scoped, partial and resettable; unknown keys cannot be saved',async()=>{
 const f=fixture();await f.enable();
 await f.service.dispatch({action:'偏好',user:'10',params:{steps:20,prompt_prefix:'ink'}});
 await f.service.dispatch({action:'偏好',user:'10',params:{scale:6}});
 await f.request('1','10');await f.request('2','11');
 const q=f.map.get('novelaiState').queue;assert.equal(q[0].request.parameters.steps,20);assert.equal(q[0].request.parameters.scale,6);assert.equal(q[1].request.parameters.steps,28);assert(!q[1].request.input.startsWith('ink,'));
 await assert.rejects(f.service.dispatch({action:'偏好',user:'10',params:{enabled:true}}));
 await f.service.dispatch({action:'重置',user:'10'});assert(!f.map.has('imagePreferences:10'));
});
test('global queue enforces completed-batch +35s across users and object restarts',async()=>{
 const f=fixture();await f.enable();await f.request();await f.request('2','11');
 await f.service.alarm();assert.equal(f.calls.filter(c=>c.url.includes('novelai.net')).length,1);
 const {o}=f.calls.find(c=>c.o.body instanceof FormData);assert.equal(o.headers['Content-Type'],undefined);const payload=JSON.parse(o.body.get('payload_json'));assert.equal(payload.nonce,'1');assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.equal(o.body.get('files[0]').type,'image/png');
 await f.service.alarm();assert.equal(f.calls.length,2);f.advance(BATCH_INTERVAL-1);await f.service.alarm();assert.equal(f.calls.length,2);f.advance(1);
 const restarted=new NovelAIService(f.host,async(url,o)=>{f.calls.push({url,o});return url.includes('novelai.net')?Response.json({images:[{image:'iVBORw0KGgo='}]}):Response.json({id:'9'});},()=>100000+BATCH_INTERVAL);
 await restarted.alarm();assert.equal(f.calls.filter(c=>c.url.includes('novelai.net')).length,2);assert(!f.map.has('alarm'));
 assert(!JSON.stringify([...f.map]).includes('test-secret'));
});
test('duplicate message and per-user queued requests do not create extra batches',async()=>{
 const f=fixture();await f.enable();await f.request();assert.equal((await f.request()).accepted,false);await assert.rejects(f.request('2'));
 await f.service.alarm();assert.equal((await f.request()).accepted,false);assert.equal(f.map.get('novelaiState').recent.length,1);
});
test('in-flight requests remain serialized while other users enqueue',async()=>{
 let release;const pending=new Promise(r=>release=r);const f=fixture(async(url)=>url.includes('novelai.net')?pending:Response.json({id:'9'}));await f.enable();await f.request();
 const alarm=f.service.alarm();await new Promise(r=>setImmediate(r));await f.request('2','11');await f.service.alarm();assert.equal(f.calls.length,1);assert.equal(f.map.get('novelaiState').queue.length,1);
 release(Response.json({images:[{image:'iVBORw0KGgo='}]}));await alarm;assert.equal(f.map.get('novelaiState').inflight,null);assert(f.map.get('alarm')>=135000);
});
test('429, auth errors, invalid image data and delivery errors never retry generation',async()=>{
 for(const status of [401,402,429,500]){
  const f=fixture(async(url)=>url.includes('novelai.net')?Response.json({}, {status}):Response.json({id:'9'}));await f.enable();await f.request();await f.service.alarm();f.advance(200000);await f.service.alarm();assert.equal(f.calls.filter(c=>c.url.includes('novelai.net')).length,1);assert(!JSON.stringify(f.calls.filter(c=>c.url.includes('discord')).map(c=>c.o.body)).includes('test-secret'));
 }
 const f=fixture(async(url,o)=>url.includes('novelai.net')?Response.json({images:[{image:'invalid'}]}):Response.json({id:'9'}));await f.enable();await f.request();await f.service.alarm();assert.equal(f.map.get('novelaiState').recent[0].status,'failed');assert(!f.calls.some(c=>c.o.body instanceof FormData));
 const g=fixture(async(url,o)=>url.includes('novelai.net')?Response.json({images:[{image:'iVBORw0KGgo='}]}):o.body instanceof FormData?Response.json({}, {status:403}):Response.json({id:'9'}));await g.enable();await g.request();await g.service.alarm();assert.equal(g.map.get('novelaiState').recent[0].status,'delivery_failed');
 const h=fixture(async(url,o)=>{if(url.includes('novelai.net'))return Response.json({images:[{image:'iVBORw0KGgo='}]});if(o.body instanceof FormData)throw Error('network_failed');return Response.json({id:'9'});});await h.request();await h.service.alarm();const last=h.map.get('novelaiState').recent[0];assert.equal(last.status,'delivery_failed');assert.equal(last.stage,'discord_upload');assert.equal(last.noticeDelivered,true);assert.equal(h.calls.filter(c=>c.url.includes('novelai.net')).length,1);
});
test('persisted unknown in-flight job is not regenerated after eviction',async()=>{
 const f=fixture();await f.enable();await f.request();await f.service.claim();f.advance(150001);await f.service.alarm();assert.equal(f.calls.filter(c=>c.url.includes('novelai.net')).length,0);assert.equal(f.map.get('novelaiState').recent[0].status,'unknown');assert.equal((await f.request()).accepted,false);
});
test('slash preferences are private; developer-only operations verify the actual user',async()=>{
 const env={DEVELOPER_DISCORD_USER_ID:'123'};
 const i={id:'1',channel_id:'2',member:{user:{id:'999'},permissions:'8'}};
 for(const name of ['默认','试画']){const r=await handleImageCommand(env,i,{name});assert.equal(r.data.flags,64);assert.match(r.data.content,/只有开发者/);}
 const r=await handleImageCommand(env,i,{name:'偏好',options:[{name:'参数',value:'oops'}]});assert.match(r.data.content,/JSON格式/);
});

test('V5 variants use multipart streaming and send only the final PNGs in sample order',async()=>{
 const {encode}=await import('@msgpack/msgpack');
 const png=index=>Uint8Array.of(137,80,78,71,13,10,26,10,index);
 const frame=event=>{
  const data=encode(event),bytes=new Uint8Array(4+data.length);
  new DataView(bytes.buffer).setUint32(0,data.length);bytes.set(data,4);return bytes;
 };
 for(const model of ['nai-diffusion-5-full','nai-diffusion-5-curated']){
  const f=fixture(async(url,options)=>{
   if(url.includes('novelai.net')){
    assert.equal(url,'https://image.novelai.net/ai/generate-image-stream');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers['Content-Type'],undefined);
    const request=JSON.parse(await options.body.get('request').text());
    assert.equal(request.model,model);assert.equal(request.use_new_shared_trial,true);
    assert.equal(request.parameters.params_version,4);assert.equal(request.parameters.stream,'msgpack');
    assert.equal(request.parameters.v4_prompt.caption.base_caption,request.input);
    assert.equal(request.parameters.v4_negative_prompt.caption.base_caption,'my negative');
    assert.equal(request.parameters.qualityPresetId,'none');
    const frames=[frame({event_type:'intermediate',samp_ix:0,image:png(100)}),frame({event_type:'final',samp_ix:1,image:png(1)}),frame({event_type:'final',samp_ix:0,image:png(0)})];
    return new Response(new ReadableStream({start(controller){for(const data of frames){controller.enqueue(data.subarray(0,2));controller.enqueue(data.subarray(2));}controller.close();}}));
   }
   for(const index of [0,1])assert.deepEqual(new Uint8Array(await options.body.get(`files[${index}]`).arrayBuffer()),png(index));
   return Response.json({id:'9'});
  });
  await f.request('1','10',{params:{model,n_samples:2,negative_prompt:'my negative'}});await f.service.alarm();
  assert.equal(f.calls.length,2);assert.equal(f.map.get('novelaiState').recent[0].status,'sent');
 }
});

test('a partial V5 stream never uploads a preview or repeats a paid generation',async()=>{
 const f=fixture(async(url,options)=>{
  if(url.includes('novelai.net'))return new Response(Uint8Array.of(0,0,0,60,129));
  assert(!(options.body instanceof FormData));return Response.json({id:'9'});
 });
 await f.request('1','10',{params:{model:'nai-diffusion-5-full'}});await f.service.alarm();
 f.advance(BATCH_INTERVAL);await f.service.alarm();
 const [last]=f.map.get('novelaiState').recent;
 assert.equal(last.stage,'provider_decode');assert.equal(last.status,'failed');assert.equal(f.calls.filter(c=>c.url.includes('novelai.net')).length,1);
});
