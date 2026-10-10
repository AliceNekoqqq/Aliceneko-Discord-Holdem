import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {endpoint,checkDraft,generate,reviewTask} from './gemini-writer.mjs';
test('endpoint requires clean HTTPS configuration',()=>{
  assert.equal(endpoint('https://gcli.ggchan.dev/v1/'),'https://gcli.ggchan.dev/v1/chat/completions');
  for(const base of ['http://example.com','https://key@example.com','https://example.com?key=x']) assert.throws(()=>endpoint(base));
});
test('hard checks reject truncation and missing required wording',()=>{
  assert.deepEqual(checkDraft('红豆粉',{max_chars:3,required_literals:['酒馆']},'length'),['incomplete_or_unknown_finish','missing_required_literal:酒馆']);
});
test('failed drafts cannot be approved; concrete feedback is required',()=>{
  const task={status:'review',attempts:[{draft:'草稿',errors:['above_max_chars']}]};
  assert.throws(()=>reviewTask(task,{verdict:'pass',rationale:'可以'}));
  assert.throws(()=>reviewTask(task,{verdict:'revise',rationale:'修改'}));
  reviewTask(task,{verdict:'revise',rationale:'太长',issues:['删减至字数限制']});
  assert.equal(task.status,'revise');
});
test('persists call before sending; uncertainty blocks duplicate generation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'writer-'));const file=join(dir,'task.json');
  try{
    await writeFile(file,JSON.stringify({status:'brief',brief:{},attempts:[]}));
    await assert.rejects(generate(file,{GEMINI_WRITER_API_KEY:'test-secret'},async()=>{
      assert.equal(JSON.parse(await readFile(file)).status,'requesting');throw Error('timeout');
    }),/unknown/);
    assert.equal(JSON.parse(await readFile(file)).status,'blocked');
    await assert.rejects(generate(file,{GEMINI_WRITER_API_KEY:'test-secret'}),/not_ready/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('returned credential is never saved',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'writer-'));const file=join(dir,'task.json');
  try{
    await writeFile(file,JSON.stringify({status:'brief',brief:{},attempts:[]}));
    await assert.rejects(generate(file,{GEMINI_WRITER_API_KEY:'test-secret'},async()=>new Response(JSON.stringify({choices:[{message:{content:'test-secret'},finish_reason:'stop'}]}))),/credential_echo/);
    assert.equal((await readFile(file,'utf8')).includes('test-secret'),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
