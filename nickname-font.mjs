import {glyphs} from './card-glyphs.mjs';
import {nicknameBlocks,nicknameAtlas} from './nickname-glyphs.mjs';
import {loadStaticAsset} from './static-art.mjs';
import {prepareCardGlyphAtlas} from './card-image.mjs';

const ATLAS_PATH='/art/renderer/nickname-glyphs.bin';
const RECORD_BYTES=78;
const blocks=new Map();
let atlas=null,loading=null;
async function loadAtlas(env){
 if(atlas)return atlas;
 if(!loading)loading=(async()=>{const asset=await loadStaticAsset(ATLAS_PATH,nicknameAtlas,env,'application/octet-stream');if(!asset)throw Error('Nickname glyph atlas unavailable');return asset.data;})();
 try{atlas=await loading;return atlas;}catch(error){loading=null;throw error;}
}
async function loadBlock(key,env){
 if(!blocks.has(key)){
  const descriptor=nicknameBlocks[key];if(!descriptor)return [];
  const task=(async()=>{
   const [offset,length]=descriptor,compressed=(await loadAtlas(env)).subarray(offset,offset+length);
   const bytes=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
   if(bytes.length%RECORD_BYTES)throw Error('Invalid nickname glyph block');
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries=[];
   for(let at=0;at<bytes.length;at+=RECORD_BYTES){
    const code=view.getUint32(at),advance=view.getUint16(at+4),packed=bytes.subarray(at+6,at+RECORD_BYTES),pixels=new Uint8Array(576);
    for(let n=0;n<pixels.length;n++)pixels[n]=packed[n>>3]&(128>>(n&7))?255:0;
    entries.push([code,advance,pixels]);
   }
   return entries;
  })();
  blocks.set(key,task);void task.catch(()=>blocks.delete(key));
  if(blocks.size>16)blocks.delete(blocks.keys().next().value);
 }
 return blocks.get(key);
}
export async function prepareNicknameFont(names,env){
 await prepareCardGlyphAtlas(env);
 const missing=[...new Set(names.flatMap(name=>[...String(name).slice(0,48)]))].filter(char=>!glyphs[char]);
 const groups=new Map();
 for(const char of missing){const key=Math.floor(char.codePointAt(0)/256);if(nicknameBlocks[key]){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(char);}}
 await Promise.all([...groups].map(async([key,chars])=>{
  const entries=new Map((await loadBlock(key,env)).map(entry=>[entry[0],entry]));
  for(const char of chars){const entry=entries.get(char.codePointAt(0));if(entry)glyphs[char]=[24,24,entry[1],entry[2],24];}
 }));
}
