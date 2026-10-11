# 第三阶段 · 店长、季节研发与共同活动

本批用户授权第三阶段（一日店长、季节菜单、共同活动），特别要求店长每日随机指定并显眼提示。默认北京时间，各服务器独立、跨频道共用。继续大厅按钮主流程，不新增管理身份组或任意AI交易。

## 服务合同（主模型接入既有service）

Luna账本仅编辑 `tavern-operations.mjs`、`tavern-operations.test.mjs`。导出 `TavernOperations`，构造参数host为TavernService，可用host.rows/one/sql/storage/member。所有schema及一次旧成员回填在constructor，不能在订单/游戏既有transactionSync内部创建表或嵌套事务。

- `visit(id,name,now=Date.now())`：记录真人候选，不创建钱包；当姓名不变且6小时内不重复写活动时间。首次初始化从tavern_members回填候选（joined_at），不扫Discord服务器。主模型只传核验过的真人。近30天候选随机均等，一天持久固定；无候选先空缺，首位来客后补选，不因后来的访问重选。选中者允许连续当选。随机使用crypto，测试可注入第二参数randomIndex(n)；默认需无偏。
- `board(id=null,now=Date.now())`：公开安全快照，`source:'program_confirmed_operations'`，`day`，`nextDayAt`，`manager:{id,name}|null`，`settings:{recommendation,ambience,welcome}`，`choices:{recommendations:[{id,name}],ambiences:[{id,name,scene}],welcomes:[{id,text}]}`，`season:{month,title,points,goal:30,unlocked,selected:null|candidateId,options:[{id,name,description,price,emoji,serve,votes}],contributors:[{id,name}]}`，`activity:{id,title,gameCount,orderGuests,gameGoal,orderGoal,completed,participants}`。仅传id才加`mine:{isManager,vote,participated,claimed,stamps:[{day,title}]}`。公开board不能创建钱包或返回余额/私密偏好。
- `set(p,now)`：`{id,day,field,value}`，字段recommendation/ambience/welcome；值均选固定choices。推荐为基础MENU付费商品，不改价格。验证p.day===当天且当前经理id一致；离任/旧日按钮拒绝。返回board(id)。
- `vote(p,now)`：`{id,name,month,candidate}`；每人每月一票可改，月份过期或解锁后拒绝；投票不加研发分。返回board(id)。
- `claim(p,now)`：`{id,day}`；当天共同活动完成且本人曾参与才能领一次纪念章（非货币），重试幂等；返回board(id)。活动按日期轮换三款（游戏3局/付费点单3位/游戏2局+付费点单2位），无聊天刷条奖励。
- `recordOrder(order,insideTransaction=true)`：新确认的price>0订单仅该人该日首单计1研发分/一位品鉴者；免费或重复不计。`order:{id,user_id,name?,price,at}`。若调用在transaction内不能嵌套，并与原订单回滚。先将用户加入候选。参与者署名使用host成员姓名；不保存忌口/余额。
- `recordGame(key,result,actors,insideTransaction=true)`：仅主模型已校验合格且同组每日前8局的结果进入，包含id/name的actors已排除bot/认输/无动作；每个去重key计1研发分、1活动局，记录演员为参与者。时间用result.at归属事件日/月，不用重试到达日；过去的合格事件可补旧日进度，不能解锁当前月或改变旧选中饮品。无历史订单/比赛追溯研发。
- 当月30分时事务内冻结最高票选中饮品，平票固定目录顺序；0票取首项。各季节有3款预设新品，每个候选最多3个命名选项也可省略为固定候选名（一票共同选最终新品名字）。可跨月更新的季节菜单仅当月已解锁的一款，价格28/32/35，无限库存；候选不设无酒精限制，酒类候选须显示容量和酒精度。
- `menu(now)`：基础MENU + 当前月已解锁商品；季节商品id为 `season_YYYYMM_candidate`，完整商品字段与MENU一致。`item(id,now)`：只返回当前可购买目录里的商品。跨月旧未确认预览在confirm拒绝，无扣款；已购买订单依旧可看。
- `scene(now)`：program_confirmed_operations，只输出公开店长名称（无id）、当日推荐/氛围/欢迎语、研发及活动摘要，不含mine、余额、私人历史、原账号ID。
- `dispatch(p)`：opsBoard先visit(p.id,p.name)再board(p.privateView?p.id:null)，opsSet/opsVote/opsClaim分别上述，opsMenu=>menu，opsScene=>scene。id/guild在主service已校验；仍验证操作id、日期/月份和值。

## UI合同（Luna独立文件）

Luna界面仅编辑 `tavern-operations-ui.mjs`、`tavern-operations-ui.test.mjs`。导出 `operationsInteraction(i)`、`immediateOperationsReply(i)`、`operationsDeferredReply(i)`、`answerOperations(env,i)`、`operationsBanner(board)`。

- 使用 `t:guild:owner:ops...` ids；公共 `opsBoard/opsSeason/opsActivity` 浏览owner any；打开本人管理/投票/领章用opsEnter，TYPE5 flags64；私人更新TYPE6，仅从message flags64和本人owner。表单不需要，三个select推荐/氛围/欢迎语立即保存（action携带当天）；投票select携带当月；领章按钮携带当天。旧日/月份由服务再次校验。
- `opsBoard`公开经营看板；按钮“我的经营面板”私密。`opsSeason`公开研发候选/票数/署名/进度；opsActivity公开共同活动/进度；私人页包含店长管理（仅mine.isManager时）、投票、领章及最近本人纪念章，提供返回大厅。返回大厅保持私人可见性。
- banner显眼首行 `👑 今日一日店长` 及昵称/mention（allowed_mentions parse[]，不用通知），显示日期与0点换任。选项标题可用表情；不出现余额/任何私密信息。
- 三个店长select各占一行，投票占第四行、按钮占第五行（非店长只有投票和按钮）；按钮<=5，content<=2000，custom_id<=100、select options<=25。所有昵称/名字输出去mention注入和Markdown，全部allowed_mentions parse[]。
- answer调用tavernRequest，public opsBoard带核验caller id/name但privateView false；opsEnter使用true。set/vote/claim完成返回私密面板。服务字段按上面固定合同，不编辑主service/lobby/UI。

## 主模型整合

- 既有service：lazy operations getter，view/prepare/confirm用动态menu。订单/游戏成功事务接record方法，旧失败或重复不记录，保持经济规则。第三阶段读取不创建钱包。
- 大厅顶部banner，经营/活动入口；菜单接动态季节商品；聊天第三个独立公开scene字段，保留现有个人/频道来源边界。
- 保存每频道最近一条公共大厅message id（最多5频道），不保存token。每天零点DO单次alarm选店长并刷新记录的大厅；看板/消费变化合并2秒刷大厅。失败限次数退避、403/404解绑，无任务不持续轮询。只用已有namespace，不新增Cron。
- 更新文档/知识/版本后串行全回归，整批GitHub与完整Worker发布，核验实际版本和健康。不会写生产模拟订单。
