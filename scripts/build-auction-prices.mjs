import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {AUCTION_ITEMS_V3} from '../tavern-auction-data.mjs';
const anchors=[155,402,1260,3380,15087.5,158550];
const materials={'日用':.94,'餐饮':1,'文艺':1.08,'收藏':1.12,'数码':1.04,'机械':1.06,'矿物':1.15,'玩具':.93,'乐器':1.09};
const memorial={'tavern-5-0':2.1,'tavern-5-3':3.8,'tavern-5-9':2.6,'tavern-5-10':3.3,'tavern-5-11':2.4,'tavern-5-12':9.8,'tavern-5-14':1.8,'tavern-5-34':4.6,'tavern-5-42':2.2};
const items=AUCTION_ITEMS_V3.map(x=>{
 const hash=createHash('sha256').update('tavern-appraisal-v1:'+x.id+':'+x.name).digest();
 const craft=.78+hash.readUInt16BE(0)/65535*.44,significance=memorial[x.id]||1;
 return {id:x.id,value:Math.round(anchors[x.quality]*28*(x.width*x.height)**.8*(materials[x.category]||1)*craft*significance)};
});
const header={version:1,currency:'auction',reference:'https://bidking.site/data/items',referenceKind:'community-not-official',dataVersion:'2026.10.29',oneCellMedian:anchors,scale:28,areaExponent:.8,materials,memorial};
writeFileSync(new URL('../assets/auction-art/prices-v1.json',import.meta.url),JSON.stringify(header,null,2).slice(0,-2)+',\n  "items": [\n'+items.map(x=>'    '+JSON.stringify(x)).join(',\n')+'\n  ]\n}\n');
console.log(JSON.stringify({items:items.length,min:Math.min(...items.map(x=>x.value)),max:Math.max(...items.map(x=>x.value))}));
