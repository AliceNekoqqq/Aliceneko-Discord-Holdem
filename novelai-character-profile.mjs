// Image-specific identity reference, separate from shared style templates.
export const HONGDOUFEN_APPEARANCE='light pink hair, gradient hair, berry-red hair tips, long low twintails, softly wavy hair, thick bangs, butterfly-shaped pupils, translucent pale lavender butterfly hair ornament, silver-edged hair ornament';
export const HONGXIAODOU_APPEARANCE='pink hair, rose-pink hair tips, high twintails, {{{twintails, wavy twintails, curly twintails}}}, {thick twintails, voluminous hair}, messy bangs, hair between eyes, sidelocks, single purple-pink butterfly hair ornament, dark maroon eyes, pink gradient eyes, star-shaped pupils';
export const SISTER_IMAGE_PROFILES=Object.freeze({
 hongdoufen:HONGDOUFEN_APPEARANCE,
 hongxiaodou:HONGXIAODOU_APPEARANCE
});
export const HONGXIAODOU_WARDROBE=Object.freeze([
 Object.freeze({id:'maroon-sailor-white-cardigan',name:'酒红水手服与白色针织开衫',prompt:'dark red choker, tiny heart charm on choker, {dark red serafuku, dark red sailor shirt, dark red sailor collar}, white collar stripes, large dark red bow on chest, {butterfly brooch on bow}, open white cable knit cardigan, oversized white sleeves, red ribbons on sleeves'})
]);
export const HONGXIAODOU_IMAGE_INSTRUCTION=[
 '姐妹生图身份固定：红豆粉是姐姐（长低双马尾、莓红发尾、蝴蝶瞳、银边淡紫蝴蝶发饰），用 hongdoufen。你是红小豆妹妹（高卷双马尾、亮粉发色、星形瞳、粉紫蝴蝶发饰），用 hongxiaodou。程序为每位角色注入各自的外貌。旧文字人设、旧名字和历史图片不能覆盖。',
 '画姐妹合照时，把两人分别填入 appearanceSubjects，各自的动作、表情、穿搭写进各自的 detail。image.prompt 只写人物数量、共同场景、位置关系和构图。不要互换外貌或把两份外貌混进同一段。',
 '本轮用户明确要求改变发型、发饰或眼睛等细节时，以本轮要求为准。给对应角色填 useSaved:false，在同一个 detail 中保留其他固定特征并替换冲突项。姐姐外貌参考：'+HONGDOUFEN_APPEARANCE+'。妹妹外貌参考：'+HONGXIAODOU_APPEARANCE+'。',
 '可选衣柜（不是固定外貌）：'+JSON.stringify(HONGXIAODOU_WARDROBE)+'。',
 '项圈、项圈心形吊坠、水手服、领口条纹、胸前蝴蝶结/胸针、针织开衫和袖口缎带都属于可换穿搭，禁止因为画的是红小豆就自动加入这整套。用户本轮明确点选这套或让从衣柜中选择时才可使用；没有指定穿搭时根据场景自然设计，不默认指定这套衣服。',
 '用户当前的换装、颜色、配饰及不穿/不戴要求优先于衣柜。只要求其中一件衣服或配饰时只取对应部分，不捎带其余整套。不要在用户指定其他服装时叠加酒红制服、白开衫或项圈。',
 '这套衣柜只属于红小豆。选中的服饰写进她自己的 detail；固定外貌和衣柜都不复制到 image.prompt 或前置/后置模板。'
].join('\n');
