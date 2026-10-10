import {writeFile,mkdir} from 'node:fs/promises';
import {renderPetWalkMap} from '../pet-walk-map-image.mjs';
const dir=new URL('../assets/pet-walk/maps/',import.meta.url);
await mkdir(dir,{recursive:true});
for(const state of [0,1,2,3,4,'done']){
 const bytes=Buffer.from(await (await renderPetWalkMap(state)).arrayBuffer());
 await writeFile(new URL(String(state)+'.png',dir),bytes);
}
console.log({maps:6});
