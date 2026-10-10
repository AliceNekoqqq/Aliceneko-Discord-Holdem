# 灯下迷城 · 实现阶段 v0.4

2026-10-10。用户指出不应写完交接就停止，本轮从三幕设计继续进入实际代码。没有把它再包装为一份纸面方案。

| 模块 | 已实现行为 |
|---|---|
| rogue-catalog.mjs | 从v0.3合并目录生成；20牌/12遗物/12敌人，原数值保持 |
| rogue-battle.mjs | 真实逐牌战斗、4堆实体、能量、消耗、回声、烧层、护甲/架盾、多段反击截断、12轮；JSON恢复 |
| rogue-run.mjs | 三幕ROOM/ROUTE/BATTLE/REWARD/CHECKPOINT/RESULT；9站、商店多次消费/售罄/删牌升级、事件确认后原子扣款、检查点撤离、72h过期 |
| rogue-economy.mjs | 完成幕数累计8/18/30币、60子cap、评分与同题种子组 |
| rogue-service.mjs | 使用现有TavernService host/sql的存档、同服一活跃局、版本/请求幂等、钱包同步事务、独立排名outbox、同题最佳/并列名次 |
| rogue-ui.mjs | Discord私密面板/实际手牌UID、付费预览、撤离/放弃二次确认、选择解析、组件约束 |
| rogue-interactions.mjs | 从已验签interaction读取member/guild/requestId，私密源消息才type7更新，公开源新建私密响应；不信客户端now/owner |

公共接口：createRun/runAction/expireRun为纯函数；beginBattle/battleAction/legalCards为纯战斗接口；RogueService(host,boundGuild)使用该guild的酒馆SQLite。服务端生产clock默认Date.now，仅测试可构造注入。dispatcher必须在现有Worker已验签/核application_id之后调用，不单独作为公网端点。

服务不做外部I/O；所有SQL事务回调同步完成。终局先保存并冻结基础币/评分；后续付款失败不会回滚通关，可与新局并存，按需重试旧结果。已读过期的局进入EXPIRED，不给币并释放活跃名额。查看/确认预览不延长有效操作时间；成功出牌、选路、奖励、付款等才更新lastActionAt。失败按钮不扣资源。start/act重复requestId返回当前保存值，同版本不同请求仅首次成功；旧按钮拒绝。

## 本轮验证

运行 `node --test --test-concurrency=1 --test-reporter=tap rogue-*.test.mjs`。最终稳定代码50/50通过：战斗9、状态机5、经济5、SQL服务14、UI10、交互6、跨模块1；均使用实际新模块。SQL服务使用node:sqlite内存数据库及DO同接口适配器，证明相关SQL/事务和重试行为，不能当成Cloudflare线上验证。

跨模块检查用8个稳定JS种子走真实战斗/房间动作，每次动作都与JSON恢复后结果比较；至少存在完整9站通关。没有把敌人提前改到1HP来冒充整局可通关，房间编排的个别单测则明确使用近胜fixture，仅检查编排。

旧Python648样本是内容设计参考，仍保留，不重跑也不挪作JS人类胜率。JS随机序列独立版本，不要求seed7与Python一致。第一幕值未改，现有游戏/设备/伙伴业务与真人数据未改。

## 尚未完成的生产连接

本轮模块已经是可执行代码，**尚未挂到现有Worker/大厅/命令与webhook**；线上beta.52保持。因此真实玩家还不能打开、恢复或领此游戏的币，不能以本地SQLite通过宣称上线。

接续直接做这一个集成批次：把已验签的rl组件/酒馆冒险入口路由到tavern:guild DO，复用其TavernService创建RogueService；私密延迟响应/失败恢复按现有Bot模式处理，图片/读牌手机布局需实机验证。代码整批集成、目标回归与原配置/静态ASSETS保留核验后再统一发布。不上未经集成验证的裸模块，也不回到重做三幕设计或重新生成旧设备图。
