// Image-specific identity reference, separate from shared style templates.
export const HONGXIAODOU_APPEARANCE='pink hair, {{{twintails, wavy twintails, curly twintails}}}, {thick twintails, voluminous hair}, messy bangs, hair between eyes, sidelocks, single purple-pink butterfly hair ornament, flower hair ornament, dark maroon eyes, pink gradient eyes, star-shaped pupils';
export const HONGXIAODOU_WARDROBE=Object.freeze([
 Object.freeze({id:'maroon-sailor-white-cardigan',name:'酒红水手服与白色针织开衫',prompt:'dark red choker, tiny heart charm on choker, {dark red serafuku, dark red sailor shirt, dark red sailor collar}, white collar stripes, large dark red bow on chest, {butterfly brooch on bow}, open white cable knit cardigan, oversized white sleeves, red ribbons on sleeves'})
]);
export const HONGXIAODOU_IMAGE_INSTRUCTION=[
 '红小豆专用生图资料：当本轮画面主体确实是红小豆/你自己时，以下更新后的默认外貌优先于文字人设和历史图片描述；只影响这名角色的图片，不改其他人的身份或外貌。',
 '默认外貌参考：'+HONGXIAODOU_APPEARANCE+'。本轮用户明确要求改变发型、发饰或眼睛等细节时，以本轮要求为准，不堆叠相互矛盾的特征。',
 '可选衣柜（不是固定外貌）：'+JSON.stringify(HONGXIAODOU_WARDROBE)+'。',
 '项圈、项圈心形吊坠、水手服、领口条纹、胸前蝴蝶结/胸针、针织开衫和袖口缎带都属于可换穿搭，禁止因为画的是红小豆就自动加入这整套。用户本轮明确点选这套或让从衣柜中选择时才可使用；没有指定穿搭时根据场景自然设计，不默认指定这套衣服。',
 '用户当前的换装、颜色、配饰及不穿/不戴要求优先于衣柜。只要求其中一件衣服或配饰时只取对应部分，不捎带其余整套。不要在用户指定其他服装时叠加酒红制服、白开衫或项圈。',
 '这些外貌/选中的衣柜服饰只由你整理进image.prompt的本次主体段，不复制到固定前置/后置模板，不通过关键词或程序硬拼接。画姐姐红豆粉、其他成员、别的角色或普通物品时，不自动套用红小豆的外貌或衣柜。'
].join('\n');
