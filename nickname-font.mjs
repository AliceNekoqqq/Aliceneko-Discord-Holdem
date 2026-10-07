import {nicknameBlocks} from './nickname-glyphs.mjs';
import {glyphs} from './card-glyphs.mjs';
const blocks=new Map();
async function loadBlock(key){
 if(!blocks.has(key)){const encoded=nicknameBlocks[key];if(!encoded)return [];const task=(async()=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const data=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();return JSON.parse(data);})();blocks.set(key,task);if(blocks.size>16)blocks.delete(blocks.keys().next().value);}
 return blocks.get(key);
}
export async function prepareNicknameFont(names){
 const missing=[...new Set(names.flatMap(name=>[...String(name).slice(0,48)])).values()].filter(c=>!glyphs[c]);
 const groups=new Map();for(const c of missing){const key=Math.floor(c.codePointAt(0)/256);if(nicknameBlocks[key]){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}}
 await Promise.all([...groups].map(async([key,chars])=>{const entries=new Map((await loadBlock(key)).map(e=>[e[0],e]));for(const char of chars){const entry=entries.get(char.codePointAt(0));if(!entry)continue;const packed=Uint8Array.from(atob(entry[2]),c=>c.charCodeAt(0));let pixels='';for(let n=0;n<576;n++)pixels+=String.fromCharCode(packed[n>>3]&(128>>(n&7))?255:0);glyphs[char]=[24,24,entry[1],btoa(pixels),24];}}));
}
