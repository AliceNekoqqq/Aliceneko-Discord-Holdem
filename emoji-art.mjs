import {emojiSprites,emojiSpriteAtlas} from './emoji-sprites.mjs';
import {loadStaticAsset} from './static-art.mjs';

const SPRITE_PATH='/art/renderer/emoji-sprites.bin';
const cache=new Map();
let atlas=null,loading=null;
async function spriteAtlas(env){
 if(atlas)return atlas;
 if(!loading)loading=(async()=>{const asset=await loadStaticAsset(SPRITE_PATH,emojiSpriteAtlas,env,'application/octet-stream');if(!asset)throw Error('Emoji sprite atlas unavailable');return asset.data;})();
 try{atlas=await loading;return atlas;}catch(error){loading=null;throw error;}
}
export async function emojiBitmap(key,env){
 const name=Object.hasOwn(emojiSprites,key)?key:'butterfly';
 if(!cache.has(name)){
  const task=(async()=>{const [offset,length]=emojiSprites[name],packed=(await spriteAtlas(env)).subarray(offset,offset+length);const data=new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());if(data.length!==64*64*4)throw Error('Invalid emoji sprite');return data;})();
  cache.set(name,task);void task.catch(()=>cache.delete(name));
 }
 return cache.get(name);
}
export function paintEmoji(canvas,data,x,y,size=44){
 x=Math.round(x);y=Math.round(y);size=Math.round(size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){const index=(Math.min(63,Math.floor(j*64/size))*64+Math.min(63,Math.floor(i*64/size)))*4;const alpha=data[index+3];if(alpha)canvas.pixel(x+i,y+j,data.subarray(index,index+3),alpha);}
}
