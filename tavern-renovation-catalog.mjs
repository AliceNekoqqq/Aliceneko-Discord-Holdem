export const SHOP_STAGES=[
 {level:0,name:'街角小店',threshold:0,description:'一间收拾整齐的街角小店，等着第一盏灯和第一位常客。'},
 {level:1,name:'暖灯酒馆',threshold:300,description:'暖色灯光照亮木桌，熟悉的招呼声让小店有了酒馆的样子。'},
 {level:2,name:'常客客厅',threshold:1000,description:'更宽敞舒适的客厅，留出聊天、阅读与相聚的角落。'},
 {level:3,name:'河畔会客厅',threshold:2500,description:'窗外能望见河岸，灯影与水光交织成安静的会客厅。'},
 {level:4,name:'旧街地标',threshold:6000,description:'修葺一新的旧街地标，保留街巷记忆，也迎接每位新朋友。'}
];
export const RENOVATION_CATEGORIES={furniture:'家具',lighting:'灯光',decor:'装饰',ambience:'氛围',equipment:'设备'};
const object=(id,name,emoji,category,description,price,stage,scene)=>({id,name,emoji,category,description,kind:'object',levels:[{level:1,price,stage,label:'购置',scene}]});
const facility=(id,name,emoji,category,description,prices,stage,scenes)=>({id,name,emoji,category,description,kind:'facility',levels:prices.map((price,i)=>({level:i+1,price,stage:Math.min(4,stage+i),label:`${i+1}级`,scene:scenes[i]}))});
export const RENOVATION_ITEMS=[
 object('oak_table','橡木长桌','🪵','furniture','可供邻桌朋友围坐的结实长桌。',80,0,'橡木长桌擦拭得干净，桌面留着温润木纹。'),
 object('window_seat','临窗软座','🪑','furniture','靠窗的软垫座位。',100,0,'临窗软座正好能看见街上的行人。'),
 object('bookshelf','旧书架','📚','furniture','摆放旧书与客人留下的小册子。',120,0,'旧书架上有几本可以随手翻阅的书。'),
 object('coat_rack','木衣帽架','🧥','furniture','进门处方便挂起外套。',60,0,'木衣帽架安静地立在门边。'),
 object('bar_counter','吧台柜','🍶','furniture','整理杯具与茶点的小吧台。',180,1,'吧台柜后杯盏整齐，留出一方闲聊的位置。'),
 object('copper_lamp','铜罩吊灯','🏮','lighting','打下柔和暖光的铜罩吊灯。',90,0,'铜罩吊灯投下圆润的暖色光圈。'),
 object('paper_lanterns','纸灯串','✨','lighting','沿梁悬挂的一串纸灯。',130,1,'纸灯串在木梁间亮起，光线轻柔。'),
 object('table_lamp','桌边小灯','🪔','lighting','适合夜读与慢慢喝茶的小灯。',50,0,'桌边小灯照亮书页与杯沿。'),
 object('neon_sign','霓虹招牌','🌟','lighting','为旧街巷口添一块醒目的招牌。',260,2,'窗外的招牌映出克制的柔和光色。'),
 object('river_photo','河岸老照片','🖼️','decor','记录附近河岸旧时光的照片。',70,0,'墙上的老照片留下河岸从前的模样。'),
 object('ceramic_vase','手作陶瓶','🏺','decor','本地陶艺人烧制的小花瓶。',45,0,'手作陶瓶里插着一枝新鲜的绿叶。'),
 object('chalk_menu','手写菜单板','✍️','decor','每日更新的手写菜单板。',40,0,'手写菜单板上留着粉笔字迹。'),
 object('wall_clock','复古挂钟','🕰️','decor','滴答作响的复古挂钟。',95,0,'复古挂钟以舒缓的节奏走着。'),
 object('record_player','黑胶唱机','🎶','ambience','播放舒缓背景音乐的唱机。',240,1,'唱针落下，店里流淌着轻柔的旋律。'),
 object('plant_corner','绿植角','🪴','ambience','几盆耐心照料的绿植。',110,0,'绿植角让室内多了一抹清新的颜色。'),
 object('rain_bell','檐下风铃','🎐','ambience','微风经过时轻响的风铃。',80,0,'檐下风铃偶尔传来清脆而轻的声音。'),
 object('tea_station','温茶台','🫖','equipment','备好温水与茶具的茶台。',150,1,'温茶台上杯具齐备，热气袅袅。'),
 object('pastry_case','点心展示柜','🍰','equipment','陈列当日小点心的玻璃柜。',210,2,'点心展示柜里摆着当天新做的小点心。'),
 facility('seating','座位区','🛋️','furniture','逐步扩充舒适座位与相聚空间。',[120,220,380],0,['添置几把稳当的木椅。','座位铺上柔软坐垫，布局更加宽松。','围合出适合小聚的会客座位区。']),
 facility('lighting','照明','💡','lighting','逐级改善店内照明层次。',[100,180,320],0,['补上温暖的壁灯。','增加分区照明，夜晚更明亮。','灯光可随时段呈现舒适层次。']),
 facility('sound','音响','🔊','equipment','逐级升级背景音响设备。',[140,240,400],1,['安装小型背景音箱。','升级为覆盖全屋的立体声音响。','加入独立音区，音乐更加细腻。']),
 facility('climate','通风与空调','🌿','equipment','逐级改善空气流通与温度。',[180,300,480],1,['加装静音换气扇。','升级空气循环与温控。','实现安静均匀的全屋温度调节。']),
 facility('counter','吧台','🧉','equipment','扩展吧台的整理与服务空间。',[160,280,440],1,['增加一段备餐台面。','加入分类收纳与取物空间。','吧台升级为完整的备餐与交流中心。']),
 facility('patio','临河露台','🌊','ambience','逐级整理面向河岸的公共空间。',[260,420,650],2,['整理门前靠河的小平台。','增设户外桌椅与遮阳棚。','打造夜间也舒适的河畔露台。'])
];
export function renovationItem(id){return RENOVATION_ITEMS.find(x=>x.id===id)||null;}
export function shopStage(total=0){return [...SHOP_STAGES].reverse().find(x=>total>=x.threshold)||SHOP_STAGES[0];}
