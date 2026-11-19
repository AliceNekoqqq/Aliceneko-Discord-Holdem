import test from 'node:test';
import assert from 'node:assert/strict';
import {HONGDOUFEN_APPEARANCE,HONGXIAODOU_APPEARANCE,HONGXIAODOU_WARDROBE,HONGXIAODOU_IMAGE_INSTRUCTION} from './novelai-character-profile.mjs';
import {IMAGE_DEFAULTS,IMAGE_INSTRUCTION,imageRequest,resolveImageParameters} from './novelai.mjs';
import {makeSystemInstruction} from './ai-chat.mjs';

test('updated image identity includes user-specified hair and eyes while all clothing stays in the optional wardrobe',()=>{
 for(const tag of ['berry-red hair tips','long low twintails','butterfly-shaped pupils','silver-edged hair ornament'])assert(HONGDOUFEN_APPEARANCE.includes(tag));
 for(const tag of ['pink hair','high twintails','{{{twintails, wavy twintails, curly twintails}}}','single purple-pink butterfly hair ornament','dark maroon eyes','pink gradient eyes','star-shaped pupils'])assert(HONGXIAODOU_APPEARANCE.includes(tag));
 assert.doesNotMatch(HONGDOUFEN_APPEARANCE,/star-shaped pupils|high twintails/);
 assert.doesNotMatch(HONGXIAODOU_APPEARANCE,/butterfly-shaped pupils|low twintails/);
 for(const tag of ['choker','serafuku','sailor shirt','cardigan','ribbons on sleeves'])assert(!HONGXIAODOU_APPEARANCE.includes(tag));
 assert.equal(HONGXIAODOU_WARDROBE.length,1);
 for(const tag of ['dark red choker','tiny heart charm on choker','dark red serafuku','white collar stripes','butterfly brooch on bow','open white cable knit cardigan','oversized white sleeves','red ribbons on sleeves'])assert(HONGXIAODOU_WARDROBE[0].prompt.includes(tag));
});
test('same chat model receives identity and explicit outfit precedence only as image guidance',()=>{
 const system=makeSystemInstruction('旧文字人设：蝴蝶瞳孔','chat',[],'','',{imageGeneration:{source:'current_user_message_only'}});
 assert(system.includes(HONGXIAODOU_APPEARANCE));assert(system.includes(HONGXIAODOU_WARDROBE[0].prompt));
 assert(system.includes('本轮用户明确要求改变'));assert(system.includes('禁止因为画的是红小豆就自动加入这整套'));assert(system.includes('只要求其中一件衣服或配饰时只取对应部分'));
 assert(!makeSystemInstruction('','chat').includes(HONGXIAODOU_APPEARANCE));assert(IMAGE_INSTRUCTION.includes(HONGXIAODOU_IMAGE_INSTRUCTION));
});
test('character identity and wardrobe are never hard-wired into generic subjects, custom outfits or global style templates',()=>{
 const p=resolveImageParameters(IMAGE_DEFAULTS);
 const cat=imageRequest('a white cat sitting by a window',p).input;
 assert(!cat.includes(HONGXIAODOU_APPEARANCE));assert(!cat.includes('dark red serafuku'));
 const dress=imageRequest(HONGXIAODOU_APPEARANCE+', wearing a blue evening dress',p).input;
 assert(dress.includes('wearing a blue evening dress'));assert(!dress.includes('dark red serafuku'));assert(!dress.includes('open white cable knit cardigan'));assert(!dress.includes('dark red choker'));
 const selected=imageRequest(HONGXIAODOU_APPEARANCE+', '+HONGXIAODOU_WARDROBE[0].prompt,p).input;
 assert(selected.includes('dark red serafuku'));assert(selected.includes('open white cable knit cardigan'));
 assert(!IMAGE_DEFAULTS.prompt_prefix.includes(HONGXIAODOU_APPEARANCE));assert(!IMAGE_DEFAULTS.prompt_suffix.includes('dark red serafuku'));
});
