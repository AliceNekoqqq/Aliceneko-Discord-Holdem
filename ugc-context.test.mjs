import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSystemInstruction,buildOpenAIChatRequest,buildGenerateContentRequest,generateGemini} from './ai-chat.mjs';
import {TavernOperationsLive} from './tavern-operations-live.mjs';

test('UGC uses isolated structured generation without chat memory instructions or clipping',async()=>{
 const instruction=makeSystemInstruction('人格','ugc',[],'允许配方字段', '',{ugc:{target:'name'}});
 assert(instruction.includes('合法JSON'));assert(!instruction.includes('输出边界'));assert(!instruction.includes('sharedLongMemory'));
 assert.equal(buildOpenAIChatRequest([],'','ugc').max_tokens,3072);
 assert.equal(buildGenerateContentRequest([],'','ugc').generationConfig.maxOutputTokens,3072);
 const body=JSON.stringify({reply:'字'.repeat(1800),patch:{},missing:[]});let dbCalls=0;
 const answer=await generateGemini({GEMINI_API_KEY:'fixture',GEMINI_API_BASE_URL:'https://fixture.invalid/v1',CHAT_DB:{prepare(){dbCalls++;throw Error('must not log')}}},[{role:'user',parts:[{text:'私密研发'}]}],'ugc',async()=>Response.json({choices:[{message:{content:body},finish_reason:'stop'}]}));
 assert.equal(answer,body);assert.equal(dbCalls,0);
});

test('UGC expiration shares lobby alarm and survives absence of tracked public boards',async()=>{
 let alarm=null,deleted=0;const due=Date.now()+1000;
 const live=new TavernOperationsLive({ctx:{storage:{setAlarm:async t=>alarm=t,deleteAlarm:async()=>{alarm=null;deleted++;}}},tavern:{ugc:{nextExpiry:()=>due}}});
 await live.arm(null,due-500);assert.equal(alarm,due);assert.equal(deleted,0);
 await live.arm({boards:[{}],due:due+1000},due-500);assert.equal(alarm,due);
});
