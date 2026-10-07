import {emojiSprites} from './emoji-sprites.mjs';
// Build-time rasterized Twemoji; bounded decode cache, no runtime image downloads.
const cache=new Map();
export async function emojiBitmap(key){
 const name=Object.hasOwn(emojiSprites,key)?key:'butterfly';
 if(!cache.has(name))cache.set(name,(async()=>{const compressed=Uint8Array.from(atob(emojiSprites[name]),c=>c.charCodeAt(0));const data=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());if(data.length!==64*64*4)throw Error('Invalid emoji sprite');return data;})());
 return cache.get(name);
}
export function paintEmoji(canvas,data,x,y,size=44){
 x=Math.round(x);y=Math.round(y);size=Math.round(size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){const index=(Math.min(63,Math.floor(j*64/size))*64+Math.min(63,Math.floor(i*64/size)))*4;const alpha=data[index+3];if(alpha)canvas.pixel(x+i,y+j,data.subarray(index,index+3),alpha);}
}
