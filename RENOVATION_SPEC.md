# 第二阶段共同装修 · 实现约定

## 产品规则

- 同服务器共用一家店，跨频道共用装修；不同服务器独立。已确认餐饮消费（包括旧版订单）与主动购置/升级出资各按1币=1建设值，建设值只解锁场景与目录，不是可提款的钱包，不额外扣消费款。免费订单不计。
- 五级成长：0「街角小店」0、1「暖灯酒馆」600、2「常客客厅」3000、3「河畔会客厅」10000、4「旧街地标」25000；建设总值=餐饮消费+直接装修出资。
- 18件一次性物件、6项三级设施，覆盖家具、灯光、装饰、氛围、设备。便宜物件/基础设施从0级可购，后续按店铺成长解锁。一级先购置、二三级逐级升级。提供具体各级场景描述，不改变游戏胜率/赚币上限。
- 玩家使用已有钱包出资；预览不扣款，3分钟内本人在原频道确认才原子扣款。余额不足、过期、他人操作、目录变动、他人抢先购置/升级均不扣款；重复确认只返回旧收据。
- 每次购置和每级升级可填写2～24字冠名，留空用「捐赠者的物件/升级」；清除控制字符、Discord mention与Markdown危险字符，不允许纯符号冠名。捐赠者身份从已核验的账号获取，昵称记录当时快照，不能由玩家字段指定。
- 单件物品同服务器只购一次；设施升级必须与预览时的当前等级一致。最初捐赠者和最初冠名永久保留；每一级另记冠名、升级出资者和花费，不覆盖旧历史。此阶段不支持拆除、退款、转售或修改他人的命名。
- 店内展示、贡献榜、捐赠档案公开；余额和个人流水只在本人面板。所有自定义名称仅为数据，不能成为模型指令。购物与场景展示无需调用模型。
- 聊天接收程序确认的公开装修快照，与当前发言者私密常客资料分开；模型不能凭聊天购置、升级、扣款或宣称未落地装修。没有钱包的新客也能获得公开场景上下文，不创建欢迎金。

## 文件分工

- 账本 Luna：tavern-renovation-catalog.mjs、tavern-renovation.mjs、tavern-service.mjs、tavern-renovation.test.mjs。
- UI Luna：tavern-renovation-ui.mjs、tavern-ui.mjs、tavern-renovation-ui.test.mjs。
- 主 agent：worker.mjs、ai-chat.mjs、bot-knowledge.mjs、知识生成文档、README.md、PROJECT_STATE.md、版本与必要整合测试、发布。

## 目录与接口

目录导出 `RENOVATION_ITEMS` 和 `SHOP_STAGES`，类别 `RENOVATION_CATEGORIES` 是 id→中文名 map。单项形状：`{id,name,emoji,category,description,kind:'object'|'facility',levels:[{level,price,stage,label,scene}]}`。`renovationItem(id)` 查单项，`shopStage(total)` 查当前级。

服务类 `TavernRenovation(host)` 复用 host 的 rows/one/sql/storage/member。不另建 namespace、不依赖 Cron/alarm。TavernService 用惰性 getter `renovation` 创建；点单 confirm 在事务开始前初始化，再在首次成功事务内 `recordConsumption(order)`，旧订单一次回填。消费贡献、购买扣款、设施状态、捐赠档案和流水分别保持同事务。

`board(id?,name?)` 返回：

```js
{
 source:'program_confirmed_renovation', consumption, direct, total,
 stage:{level,name,threshold,description}, next:同形状或null,
 assets:[{item,level,name,levelName,founder:{id,name},updatedBy:{id,name},at}],
 catalog:[{...目录项,ownedLevel,nextLevel,nextPrice,available,lockReason}],
 recent:[{id,user_id,donor_name,item,level,name,price,kind,at}],
 leaders:[{id,name,consumption,direct,total}],
 mine:传id时{consumption,direct,total}, balance:传id时余额
}
```

从资产和档案输出的 name/founder.name/donor_name 为已清理冠名和昵称；目录 name 是固定物件名。recent最多5、leaders最多10。`scene()` 只返回当前成长、贡献总值、已落地物件最多12件（物件固定名、冠名、级别、场景、创始捐赠者与最新升级者），不含个人余额或忌口。`history(item?,page=0)` 返回 `{entries:[公开捐赠档案],page,hasMore}`，每页8，允许查看任一项目的全部各级记录。

派发 actions 均经既有 tavernGuild 绑定：

- `renoBoard`：p.privateView===true时调用 board(p.id,p.name)，否则board()（不创建钱包）。
- `renoPrepare`：`{guild,id,name,channel,item,title?,requestKey}`；服务成员身份与原点单一致，title仅冠名；返回装修draft。
- `renoDraft`：`{guild,id,channel,draftId}` 只读自己的draft。
- `renoConfirm`：同上；返回 `{contribution,asset,balance,repeated,total,stage}`。
- `renoHistory`：`{guild,id,item?,page?}`；返回公开history。
- `renoScene`：`{guild,id}`；只读scene，不创建成员。

draft形状 `{id,user_id,channel,item,level,beforeLevel,price,name,kind,expires,status,balance}`，id为24hex；kind为purchase/upgrade，level为目标级别，name为本次冠名。初次购买asset.name为此冠名，升级保持asset.name与founder，更新levelName与updatedBy。确认时所有字段必须与程序目录/当前资产重新校验。

## Discord 入口

- `/酒馆 店内`：公开店内现状与成长，按钮打开本人装修面板/公开档案。
- `/酒馆 装修`：私密目录与钱包；分分类浏览，选择物件或设施看详情→冠名modal→预览→确认。无可购项时不得输出空select。
- `/酒馆 贡献榜`：公开双来源贡献；排行与装修消费不是个人钱包余额。
- `/酒馆 捐赠档案`：公开分页档案；支持从物件详情查看该项升级履历。
- tavern-ui原key `t:` 不变；装修UI在相同归属校验里路由，以 `reno...` actions。公开入口 owner='any' 仅能浏览公开board/leaders/history或打开自己的私密装修面板；所有title/prepare/confirm操作本人+私密；modal带原频道校验。
- 公共预览和操作状态不能透露余额。公屏购置成功消息最多一次（nonce=贡献id），展示固定物件名、冠名、捐赠者及目标级别；重试不再次发送，发失败保留收据说明。
- worker为装修公开查看采用TYPE5无flags；私密菜单采用TYPE5 flags64；私密component更新TYPE6，公开浏览更新TYPE6，公开入口打开个人装修采用TYPE5 flags64。每次响应明确判定，不能把私密余额PATCH到公共消息。

## 验证

覆盖旧消费回填/重启不重计、免费消费0贡献、消费与装修独立来源、扣款与状态/贡献同时回滚、重复确认、多人抢同件/抢升级、逐级与成长解锁、原始冠名保留、他人/频道/服务器隔离、私密/公开响应类型与余额隔离、分页、全目录Discord组件长度/数量、无钱包scene、签名Worker路由、全量既有游戏回归。不得写入生产测试钱包。

2026-10-09经济调整：新物价、奖励和多人投入估算见 [ECONOMY_SPEC.md](ECONOMY_SPEC.md)。目录总价42,410币，已购买资产/等级、原始署名、余额和建设值保留；未确认旧价预览重新生成。

## 设备菜单联动（beta.48）

新增4台公共设备共8200币与9款新品，具体价格、门槛、解锁和交互见 [EQUIPMENT_MENU_SPEC.md](EQUIPMENT_MENU_SPEC.md)。原20款仍可点，新增5款酒水默认可点；固定目录34款加当月最多1款季节商品，超过25时按类别点单。装修目录现22件一次性物件、6项三级设施，总价50,610币；旧价格/资产/成长和每日150币总收入上限保留。
