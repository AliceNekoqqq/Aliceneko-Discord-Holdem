import { MENU, cleanText } from './tavern-catalog.mjs';

export const UGC_PRICE_MIN=10, UGC_PRICE_MAX=50, UGC_PRICE_POLICY='ugc-price-v1';
export const UGC_TYPES=Object.freeze({drink:'drinks', dessert:'desserts', savory:'savory'});
export const UGC_FIELDS=Object.freeze(['name','type','ingredients','flavor','method','temperature','description','appearance','lore','servingSizeMl','alcoholPercent']);
const EQUIPMENT=new Set(['coffee_machine','baking_oven','blender','ice_cream_maker']);
const bad=/药用|治愈|治疗|毒药|刀片|玻璃粉/i;
const alcoholTerms=/(?:酒精(?:度|饮品)?|白酒|啤酒|葡萄酒|赤霞珠|青梅酒|梅酒|米酒|黄酒|清酒|烧酒|威士忌|琴酒|金酒|金汤力|金汤利|杜松子酒|伏特加|朗姆酒|龙舌兰|苦艾酒|起泡酒|香槟|果酒|鸡尾酒|调酒|烈酒|白兰地|利口酒|马天尼|料酒|\b(?:beer|ale|lager|wine|whisk(?:e?y)|gin|vodka|rum|sake|tequila|champagne|cocktail|liqueur|brandy|cider|spirits?)\b)/i;
export function isAlcoholicUGCDraft(draft){
 if(!draft||typeof draft!=='object')return false;
 if(Number(draft.alcoholPercent)>0)return true;
 const text=[draft.name,draft.type,draft.ingredients?.join?.(' '),draft.flavor,draft.method,draft.description,draft.appearance,draft.lore].filter(value=>typeof value==='string').join(' ');
 return alcoholTerms.test(text);
}
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
 if(d.servingSizeMl!==undefined&&(!Number.isInteger(d.servingSizeMl)||d.servingSizeMl<1||d.servingSizeMl>2000))throw Error('容量必须是1至2000 ml之间的整数。');
 if(d.alcoholPercent!==undefined&&(typeof d.alcoholPercent!=='number'||!Number.isFinite(d.alcoholPercent)||d.alcoholPercent<0.1||d.alcoholPercent>100))throw Error('酒精度必须是0.1至100之间的数字。');
 if(d.temperature!==undefined&&!['warm','cold','room'].includes(d.temperature))throw Error('上桌温度无效。');
 if(d.equipment!==undefined&&(!Array.isArray(d.equipment)||d.equipment.some(x=>!EQUIPMENT.has(x))))throw Error('设备要求无效。');
 if(d.ingredients?.some(x=>bad.test(x))||Object.values(d).some(x=>typeof x==='string'&&bad.test(x)))throw Error('菜品包含不支持的药品或危险内容。');
 delete d.allergens;
 d.equipment=deriveEquipment(d);
 if(price!==null){if(!Number.isInteger(price)||price<UGC_PRICE_MIN||price>UGC_PRICE_MAX)throw Error('售价必须是10至50之间的整数。');d.price=price;}
 if(requireComplete){for(const k of ['name','type','ingredients','flavor','method','temperature','description','appearance'])if(d[k]===undefined)throw Error(`请补全${k}。`);if(isAlcoholicUGCDraft(d)&&(d.servingSizeMl===undefined||d.alcoholPercent===undefined))throw Error('酒类饮品需填写容量和酒精度后才能入库。');if(!Number.isInteger(d.price)||d.price<UGC_PRICE_MIN||d.price>UGC_PRICE_MAX)throw Error('请先填写10至50之间的整数售价。');}
 return d;
}
export function ugcMenuItem(row,revision,art=null){const d=typeof revision==='string'?JSON.parse(revision):revision;return {id:row.id,name:d.name,emoji:d.emoji||'🍽️',price:d.price,category:d.category||UGC_TYPES[d.type],description:d.description,method:d.method,appearance:d.appearance,serve:d.serve||d.method,ingredients:d.ingredients,flavor:d.flavor,equipment:d.equipment||[],servingTemperature:d.temperature,...(d.servingSizeMl?{servingSizeMl:d.servingSizeMl}:{}),...(d.alcoholPercent?{alcoholPercent:d.alcoholPercent}:{}),author:row.author_name,author_name:row.author_name,status:row.status||'active',source:'ugc',imageStatus:art?.status||'pending',assetKey:art?.asset_key||null,recipeRevision:row.current_revision};}
export function normalizedUGCName(name){return String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('zh-CN');}
export function baseMenuNames(){return MENU.map(x=>normalizedUGCName(x.name));}
function plain(v,max,label){if(typeof v!=='string')throw Error(`${label}必须是文本。`);const s=cleanText(v,max+1);if(s.length>max)throw Error(`${label}不能超过${max}字。`);return s;}
function deriveEquipment(d){const text=`${d.method||''} ${d.ingredients?.join(' ')||''}`;const out=[];if(/咖啡机|意式|浓缩咖啡|咖啡豆/.test(text))out.push('coffee_machine');if(/烤|烘焙|烤箱/.test(text))out.push('baking_oven');if(/搅拌机|搅打|冰沙|奶昔/.test(text))out.push('blender');if(/冰淇淋机|软冰淇淋|自制冰淇淋/.test(text))out.push('ice_cream_maker');return [...new Set(out)];}
