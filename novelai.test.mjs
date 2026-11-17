import test from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_DEFAULTS,BATCH_INTERVAL,NovelAIService,imageParameters,resolveImageParameters,imageRequest,decodeImageReply,handleImageCommand,inlineImageParameters} from './novelai.mjs';

function fixture(fetcher){
 const map=new Map();let now=100000,lock=Promise.resolve();
 const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
 const host={ctx:{storage,blockConcurrencyWhile(fn){const next=lock.then(fn);lock=next.catch(()=>{});return next;}},env:{NOVELAI_API_KEY:'test-secret',BOT_TOKEN:'bot-secret'}};
 const calls=[];
 const service=new NovelAIService(host,async(url,o)=>{calls.push({url,o});if(fetcher)return fetcher(url,o);if(url.includes('novelai.net'))return Response.json({images:[{image:'iVBORw0KGgo='}]});return Response.json({id:'999'});},()=>now);
 const request=(id='1',user='10',more={})=>service.dispatch({action:'绘制',user,id,channel:'20',prompt:'1girl, pink hair',...more});
 return {map,host,service,calls,request,advance:ms=>now+=ms,enable:()=>service.dispatch({action:'默认',admin:true,params:{enabled:true}})};
}
test('parameters strictly validate bounds, types, dimensions and keys',()=>{
 for(const p of [{width:833},{width:0},{steps:51},{scale:'5'},{n_samples:5},{seed:1.1},{model:'unknown'},{quality:'true'},{prompt_prefix:'x'.repeat(1001)},{url:'https://evil.invalid'},{enabled:true}])assert.throws(()=>imageParameters(p));
 assert.throws(()=>resolveImageParameters({...IMAGE_DEFAULTS,width:1536,height:1536}));
 assert.equal(imageParameters({steps:28}).steps,28);
});
test('one-turn > per-user > global defaults; request supports v4 captions and random seeds',()=>{
 const p=resolveImageParameters({...IMAGE_DEFAULTS,scale:4,prompt_prefix:'watercolor'},{scale:5,steps:20},{scale:6,seed:123});
 const r=imageRequest('a cat',p);assert.equal(r.parameters.scale,6);assert.equal(r.parameters.steps,20);assert.equal(r.parameters.seed,123);assert.equal(r.parameters.v4_prompt.caption.base_caption,r.input);assert.match(r.input,/watercolor, a cat/);assert.equal(r.parameters.v4_negative_prompt.caption.base_caption,p.negative_prompt);
 assert(!imageRequest('a cat',{...p,model:'nai-diffusion-3'}).parameters.v4_prompt);
 assert(imageRequest('a cat',{...p,seed:-1}).parameters.seed>=0);
});
test('tool evidence is restricted to the current request and explicit numeric overrides',()=>{
 const raw=image=>JSON.stringify({reply:'我来整理画面。',image,relationship:null});
 const candidate={prompt:'a cat',evidence:'画只猫',parameters:{steps:28,scale:8},parameterEvidence:{steps:'28步',scale:'画只猫'}};
 const r=decodeImageReply(raw(candidate),'帮我画只猫，28步');assert.equal(r.image.prompt,'a cat');assert.deepEqual(r.image.parameters,{steps:28});assert(!r.reply.includes('image'));
 for(const s of ['不要画只猫','他说画只猫','假如画只猫','你好','朋友说“画只猫”，你怎么看？'])assert.equal(decodeImageReply(raw(candidate),s).image,null);
 assert.equal(decodeImageReply('今天过得怎么样？','你好').image,null);
 assert.deepEqual(decodeImageReply('{"reply":"好的","image":{','画只猫'),{reply:'好的',image:null});
 assert.throws(()=>decodeImageReply('{"image":{','画只猫'));
});
test('inline dimensions and labelled numeric parameters work without model extraction',()=>{
 for(const size of ['1024*1024','1024x1024','1024X1024','1024×1024','１０２４＊１０２４','1024乘1024','1024 乘以 1024'])assert.deepEqual(inlineImageParameters('我要一张猫图，'+size),{width:1024,height:1024});
 assert.deepEqual(inlineImageParameters('画猫，24步，CFG 6，rescale 0.15，seed 123，数量2'),{steps:24,scale:6,cfg_rescale:0.15,seed:123,n_samples:2});
 const raw=JSON.stringify({reply:'正在整理。',image:{prompt:'a cat',evidence:'我要一张猫图',parameters:{},parameterEvidence:{}}});
 assert.deepEqual(decodeImageReply(raw,'我要一张猫图，1024*1024').image.parameters,{width:1024,height:1024});
 const wrong=JSON.stringify({reply:'正在整理。',image:{prompt:'a cat',evidence:'我要一张猫图',parameters:{width:9999},parameterEvidence:{width:'9999只是举例'}}});
 assert.equal(decodeImageReply(wrong,'我要一张猫图，9999只是举例，1024*1024').image.parameters.width,1024);
});
test('inline overrides preserve source order, ignore quoted/negated values and reject invalid sizes',()=>{
 assert.deepEqual(inlineImageParameters('宽832，高1216，改成1024*1024'),{width:1024,height:1024});
 assert.deepEqual(inlineImageParameters('832*1216，宽1024，高1024'),{width:1024,height:1024});
 assert.deepEqual(inlineImageParameters('“1024*1024，steps 40”，不要832*1216，画猫，640x640，steps 24'),{width:640,height:640,steps:24});
 assert.deepEqual(inlineImageParameters('CFG rescale 0.15'),{cfg_rescale:0.15});
 assert.deepEqual(inlineImageParameters('画一个走了24步的人'),{});
 const negative=JSON.stringify({reply:'准备中。',image:{prompt:'cat',evidence:'画猫',parameters:{steps:40},parameterEvidence:{steps:'40步'}}});
 assert.deepEqual(decodeImageReply(negative,'画猫，不用40步').image.parameters,{});
 const invalid=JSON.stringify({reply:'准备中。',image:{prompt:'cat',evidence:'画猫'}});
 assert.match(decodeImageReply(invalid,'画猫，999*1024').reply,/宽高须为64/);
 assert.throws(()=>inlineImageParameters('画猫，999*1024'));
 assert.throws(()=>inlineImageParameters('画猫，4096*4096'));
});
test('new default and persisted defaults migrate to rescale .15 exactly once without changing preferences or frozen jobs',async()=>{
 assert.equal(IMAGE_DEFAULTS.cfg_rescale,0.15);
 const f=fixture();await f.enable();await f.request();
 const before=f.map.get('novelaiState');delete before.defaultsRevision;before.defaults.cfg_rescale=0;before.queue[0].request.parameters.cfg_rescale=0;f.map.set('novelaiState',before);f.map.set('imagePreferences:10',{cfg_rescale:0.3});
 const state=await f.service.state();assert.equal(state.defaults.cfg_rescale,0.15);assert.equal(state.queue[0].request.parameters.cfg_rescale,0);assert.equal(f.map.get('imagePreferences:10').cfg_rescale,0.3);
 await f.service.dispatch({action:'默认',admin:true,params:{cfg_rescale:0.25}});assert.equal((await f.service.state()).defaults.cfg_rescale,0.25);
});
test('feature waits for default tuning; developer trial ignores personal preferences',async()=>{
 const f=fixture();assert.equal((await f.request()).accepted,false);assert.equal(f.calls.length,0);
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
