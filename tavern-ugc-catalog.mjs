import { MENU, cleanText } from './tavern-catalog.mjs';

export const UGC_PRICE_MIN=10, UGC_PRICE_MAX=50, UGC_PRICE_POLICY='ugc-price-v1';
export const UGC_TYPES=Object.freeze({drink:'drinks', dessert:'desserts', savory:'savory'});
export const UGC_FIELDS=Object.freeze(['name','type','ingredients','flavor','method','temperature','description','appearance','lore']);
const EQUIPMENT=new Set(['coffee_machine','baking_oven','blender','ice_cream_maker']);
const ALLERGENS=[['乳制品',['牛奶','奶油','黄油','芝士','奶酪','酸奶','奶泡']],['蛋类',['鸡蛋','蛋黄','蛋白']],['麸质',['面粉','小麦','吐司','面包','燕麦','馄饨皮']],['花生',['花生']],['坚果',['杏仁','核桃','腰果','榛子']],['大豆',['豆浆','黄豆','豆腐','酱油']]];
const bad=/药用|治愈|治疗|毒药|刀片|玻璃粉/i;
export function validateUGCDraft(input,{requireComplete=false,price=null}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('菜品资料格式无效。');
 const allowed=new Set([...UGC_FIELDS,'category','allergens','equipment','pairing','serve','emoji','price']);
 for(const k of Object.keys(input))if(!allowed.has(k))throw Error(`菜品资料包含不允许的字段：${k}`);
 const d={...input};
 if(d.type!==undefined&&!Object.hasOwn(UGC_TYPES,d.type))throw Error('请选择饮品、甜点或小食/主食。');
 d.category=UGC_TYPES[d.type]||d.category;
 if(d.name!==undefined){d.name=plain(d.name,24,'品名');if(d.name.length<2)throw Error('品名需为2至24字。');}
 if(d.ingredients!==undefined){if(!Array.isArray(d.ingredients)||d.ingredients.length<1||d.ingredients.length>8)throw Error('食材需为1至8项。');d.ingredients=[...new Set(d.ingredients.map(x=>plain(x,32,'食材')).filter(Boolean))];if(!d.ingredients.length)throw Error('请填写明确食材。');}
 for(const [key,max,label] of [['flavor',100,'风味/口感'],['method',300,'制作概述'],['description',180,'介绍'],['appearance',200,'摆盘/外观'],['lore',120,'创作缘由']])if(d[key]!==undefined){d[key]=plain(d[key],max,label);if(!d[key]&&key!=='lore')throw Error(`${label}不能为空。`);}
 if(d.temperature!==undefined&&!['warm','cold','room'].includes(d.temperature))throw Error('上桌温度无效。');
 if(d.equipment!==undefined&&(!Array.isArray(d.equipment)||d.equipment.some(x=>!EQUIPMENT.has(x))))throw Error('设备要求无效。');
 if(d.ingredients?.some(x=>bad.test(x))||Object.values(d).some(x=>typeof x==='string'&&bad.test(x)))throw Error('菜品包含不支持的药品或危险内容。');
 const allergens=new Set(d.allergens||[]);for(const [name,terms] of ALLERGENS)if(d.ingredients?.some(i=>terms.some(t=>i.includes(t))))allergens.add(name);d.allergens=[...allergens];if(d.ingredients?.some(x=>!ALLERGENS.some(([,ts])=>ts.some(t=>x.includes(t)))&&!/水|糖|盐|冰块|香草|咖啡豆|茶叶|米饭|番茄|土豆|红薯|草莓|蓝莓|芒果|苹果|梨|柠檬|面粉/.test(x)))d.allergens.push('含待确认成分');
 d.equipment=deriveEquipment(d);
 if(price!==null){if(!Number.isInteger(price)||price<UGC_PRICE_MIN||price>UGC_PRICE_MAX)throw Error('售价必须是10至50之间的整数。');d.price=price;}
 if(requireComplete){for(const k of ['name','type','ingredients','flavor','method','temperature','description','appearance'])if(d[k]===undefined)throw Error(`请补全${k}。`);if(!Number.isInteger(d.price)||d.price<UGC_PRICE_MIN||d.price>UGC_PRICE_MAX)throw Error('请先填写10至50之间的整数售价。');}
 return d;
}
export function ugcMenuItem(row,revision,art=null){const d=typeof revision==='string'?JSON.parse(revision):revision;return {id:row.id,name:d.name,emoji:d.emoji||'🍽️',price:d.price,category:d.category||UGC_TYPES[d.type],description:d.description,method:d.method,appearance:d.appearance,serve:d.serve||d.method,ingredients:d.ingredients,flavor:d.flavor,allergens:d.allergens||[],equipment:d.equipment||[],servingTemperature:d.temperature,author:row.author_name,author_name:row.author_name,status:row.status||'active',source:'ugc',imageStatus:art?.status||'pending',assetKey:art?.asset_key||null,recipeRevision:row.current_revision};}
export function normalizedUGCName(name){return String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('zh-CN');}
export function baseMenuNames(){return MENU.map(x=>normalizedUGCName(x.name));}
function plain(v,max,label){if(typeof v!=='string')throw Error(`${label}必须是文本。`);const s=cleanText(v,max+1);if(s.length>max)throw Error(`${label}不能超过${max}字。`);return s;}
function deriveEquipment(d){const text=`${d.method||''} ${d.ingredients?.join(' ')||''}`;const out=[];if(/咖啡机|意式|浓缩咖啡|咖啡豆/.test(text))out.push('coffee_machine');if(/烤|烘焙|烤箱/.test(text))out.push('baking_oven');if(/搅拌机|搅打|冰沙|奶昔/.test(text))out.push('blender');if(/冰淇淋机|软冰淇淋|自制冰淇淋/.test(text))out.push('ice_cream_maker');return [...new Set(out)];}
