export const PETS = [
  { id: 'lamp-cat', name: '踏灯猫', emoji: '🐈', description: '尾尖像暖灯，安静而好奇，常盯着灯影。', coats: [
    {id:'amber',name:'琥珀奶油',description:'奶油底色与琥珀暖纹，尾尖亮着一小团灯光。'},
    {id:'silver',name:'银灰雪足',description:'银灰毛与雪白小爪，尾尖像月下的暖灯。'},
    {id:'calico',name:'莓斑三花',description:'奶白底色交错莓粉与焦糖斑，尾尖微亮。'}]},
  { id: 'moss-dog', name: '苔团犬', emoji: '🐕', description: '耳边有小叶，热情认真，总想和摊主打招呼。', coats: [
    {id:'moss',name:'苔绿奶白',description:'苔绿与奶白相间的绒毛，耳边别着小叶。'},
    {id:'cocoa',name:'可可卷绒',description:'可可棕卷绒和奶油口鼻，保留小叶耳饰。'},
    {id:'cream',name:'杏奶花耳',description:'杏奶色绒毛、焦糖花耳与同样的小叶耳饰。'}]},
  { id: 'paper-sparrow', name: '纸羽雀', emoji: '🐦', description: '像折纸的小鸟，机灵爱观察，喜欢招牌与小物件。', coats: [
    {id:'rice',name:'米白金边',description:'米白纸羽与淡金折边，像轻轻展开的小信。'},
    {id:'ink',name:'墨蓝纸羽',description:'墨蓝翼羽与浅米色胸腹，折线清爽。'},
    {id:'rose',name:'莓粉折翼',description:'莓粉折翼和奶白胸羽，轻巧又明亮。'}]},
  { id: 'dusk-rabbit', name: '暮绒兔', emoji: '🐇', description: '耳尖映着暮光，慢热温柔，喜欢在窗边听雨。', coats: [
    {id:'lavender',name:'暮紫云绒',description:'浅暮紫云朵绒毛，长软耳尖带微光。'},
    {id:'peach',name:'蜜桃垂耳',description:'蜜桃绒与奶油胸腹，柔软耳尖微亮。'},
    {id:'moon',name:'月白银尖',description:'月白绒毛、淡银耳尖与柔和暮光。'}]},
  { id: 'river-otter', name: '河灯獭', emoji: '🦦', description: '肚皮映着河灯，灵巧爱玩，会认真收藏光滑石子。', coats: [
    {id:'chestnut',name:'栗棕灯腹',description:'栗棕毛和暖奶油腹，像藏着一盏河灯。'},
    {id:'slate',name:'河灰银颊',description:'河灰毛与银白脸颊，腹部映着暖光。'},
    {id:'honey',name:'蜂蜜浅金',description:'蜂蜜浅金与奶白腹，灯辉轻轻落在毛尖。'}]},
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
