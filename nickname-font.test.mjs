import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNicknameFont} from './nickname-font.mjs';
import {glyphs} from './card-glyphs.mjs';
import {textWidth} from './card-image.mjs';
test('dynamically added CJK glyphs keep the 24px atlas unit rather than rendering at half size',async()=>{
 const char='营';delete glyphs[char];
 await prepareNicknameFont([char]);
 const entry=glyphs[char];assert.ok(entry);assert.equal(entry[5],24);assert.equal(entry[4],576);
 assert.equal(textWidth(char,24),entry[2]);
 assert.equal(textWidth(char,18),entry[2]*18/24);
});
