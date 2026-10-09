export const PETS = [
  { id: 'lamp-cat', name: '踏灯猫', emoji: '🐈', description: '尾尖像暖灯，安静而好奇，常盯着灯影。' },
  { id: 'moss-dog', name: '苔团犬', emoji: '🐕', description: '耳边有小叶，热情认真，总想和摊主打招呼。' },
  { id: 'paper-sparrow', name: '纸羽雀', emoji: '🐦', description: '像折纸的小鸟，机灵爱观察，喜欢招牌与小物件。' },
];

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
