export const PETS = [
  { id: 'lamp-cat', name: '踏灯猫', emoji: '🐈', description: '尾尖像暖灯，安静而好奇，常盯着灯影。', coats: [
    {id:'amber',name:'琥珀狸花短毛',description:'狸花灵感：紧凑身形、短毛条纹、直耳与圆脸，尾尖亮着一小团灯光。'},
    {id:'silver',name:'银灰布偶长毛',description:'布偶灵感：柔和宽脸、长毛胸鬃与蓬松大尾，银灰毛配雪白小爪。'},
    {id:'calico',name:'焦糖暹罗短毛',description:'暹罗灵感：修长身形、短毛重点色、楔形脸与大耳，浅奶油底色配深焦糖耳、面罩和小爪。'}]},
  { id: 'moss-dog', name: '苔团犬', emoji: '🐕', description: '耳边有小叶，热情认真，总想和摊主打招呼。', coats: [
    {id:'moss',name:'苔色柴犬型',description:'柴犬灵感：紧实身形、短绒毛、挺立三角耳与卷尾，苔绿奶白配色并别着小叶。'},
    {id:'cocoa',name:'可可柯基型',description:'柯基灵感：短腿长背、大耳与短绒毛，可可棕毛配奶油口鼻和小叶耳饰。'},
    {id:'cream',name:'杏奶卷毛贵宾型',description:'贵宾灵感：蓬松卷毛、垂耳与纤细四肢，杏奶色配焦糖花耳和小叶耳饰。'}]},
  { id: 'paper-sparrow', name: '纸羽雀', emoji: '🐦', description: '像折纸的小鸟，机灵爱观察，喜欢招牌与小物件。', coats: [
    {id:'rice',name:'米色圆雀型',description:'圆雀灵感：圆身、短尾与小而笔直的喙，米白纸羽配淡金折边。'},
    {id:'ink',name:'墨蓝玄凤型',description:'玄凤灵感：高冠羽、长尾与微弯喙，墨蓝纸羽配浅米胸腹。'},
    {id:'rose',name:'莓粉小鹦鹉型',description:'小鹦鹉灵感：圆头、厚实弯喙与短宽尾，莓粉折翼配奶白胸羽。'}]},
  { id: 'dusk-rabbit', name: '暮绒兔', emoji: '🐇', description: '耳尖映着暮光，慢热温柔，喜欢在窗边听雨。', coats: [
    {id:'lavender',name:'暮紫垂耳型',description:'垂耳兔灵感：长长下垂的耳朵、柔软中长绒与圆润脸型，浅暮紫毛尖映着微光。'},
    {id:'peach',name:'蜜桃侏儒立耳型',description:'侏儒兔灵感：小巧紧凑身形、短毛、短直立耳与圆脸，蜜桃色配奶油胸腹。'},
    {id:'moon',name:'月白安哥拉长绒型',description:'安哥拉兔灵感：全身蓬松长绒、耳缘长毛与圆润身形，月白毛尖泛淡银光。'}]},
  { id: 'river-otter', name: '河灯獭', emoji: '🦦', description: '肚皮映着河灯，灵巧爱玩，会认真收藏光滑石子。', coats: [
    {id:'chestnut',name:'栗棕圆绒海獭型',description:'海獭灵感：厚实圆身、浓密短绒与短厚尾，栗棕毛配暖奶油腹，像藏着一盏河灯。'},
    {id:'slate',name:'河灰灵巧小爪型',description:'灵巧小爪的幻想外形：小而窄的身形、小手与长细尾，河灰短毛配银白脸颊。'},
    {id:'honey',name:'蜂蜜修长滑毛型',description:'修长顺毛的幻想外形：长身、滑顺短毛、宽鼻与粗扁尾，蜂蜜浅金配奶白腹。'}]},
];
export const petCoat=(species,coat)=>PETS.find(p=>p.id===species)?.coats.find(c=>c.id===coat)||null;
export const MATERIAL_NAMES=Object.freeze({paper:'纸片',thread:'细绳',wood:'木片',cloth:'布料',flower:'小花',metal:'金属片'});
export const MATERIAL_GATHER_CAP=3;
export const MATERIAL_BUY_CAP=6;
export const MATERIAL_BUNDLE=Object.freeze({price:6,quantity:2,version:'materials-v1'});


export const HABITS = [
  { id: 'slow-observer', name: '慢慢观察', description: '灯巷多出一条秘密花圃线索路线；多耗1脚力，能在岔路打开隐藏花圃。', unlockEvent: 'exploration' },
  { id: 'light-traveler', name: '轻装出门', description: '多一次改主意；背包容量减1。', unlockEvent: 'friendship' },
  { id: 'collector', name: '爱收集', description: '排水沟出现可回收金属片路线；多耗1脚力并占1格背包。', unlockEvent: 'collection' },
  { id: 'friendly', name: '愿意打招呼', description: '面包铺可请熟客介绍街坊；多耗1脚力结识邻里，但拿不到细绳。', unlockEvent: 'friendship' },
  { id: 'nostalgic', name: '念旧', description: '有面包铺旧经历时可回访米叔；多耗1脚力重温旧情，不会发现新线索或得到细绳。', unlockEvent: 'exploration' },
  { id: 'paper-lover', name: '纸玩具爱好者', description: '可不靠米叔自己做风车；需纸片和细绳，放弃本次结交朋友的机会。', unlockEvent: 'craft' },
];

export const ITEMS = [
  { id: 'bell-charm', name: '小铃铛挂件', price: 30, materials: { metal: 1 }, slot: 'charm', description: '叮当作响的装饰挂件。' },
  { id: 'paper-pinwheel', name: '纸风车玩具', price: 50, materials: { paper: 2, thread: 1 }, slot: 'toy', description: '窗边的轻巧纸玩具。' },
  { id: 'rain-window-seat', name: '雨窗坐垫', price: 150, materials: { cloth: 2, flower: 1 }, slot: 'furniture', description: '可以听雨的小窝坐垫。' },
  { id: 'flower-corner', name: '花影角落', price: 400, materials: { wood: 3, flower: 3, cloth: 2 }, slot: 'corner', description: '一处完整的主题布置。' },
];

export const STAGES = [
  { id: 'lamp-alley', name: '灯巷', place: '雨后街区', safeCost: 1, intents: ['sniff', 'friend', 'fetch'] },
  { id: 'bakery', name: '面包铺', place: '雨后街区', safeCost: 1, intents: ['sniff', 'friend', 'fetch'] },
  { id: 'drain', name: '排水沟', place: '雨后街区', safeCost: 1, intents: ['sniff', 'friend', 'fetch'] },
  { id: 'fork', name: '岔路口', place: '雨后街区', safeCost: 1, intents: ['sniff', 'friend', 'fetch'] },
  { id: 'tavern-porch', name: '酒馆门廊与返程', place: '雨后街区', safeCost: 2, intents: ['sniff', 'friend', 'fetch'] },
];
