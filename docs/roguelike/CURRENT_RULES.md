# 灯下迷城当前规则索引

基线：beta.68起采用v0.9。本文是程序规则的查阅入口，候选设计见UPGRADE_ROADMAP.md，不把规划视为已上线。

| 范围 | 权威来源 | 当前约束 |
| --- | --- | --- |
| 规则分发与旧局 | rogue-run.mjs、rogue-battle.mjs、rogue-content-v09.mjs | 新局v0.9；旧局v0.4/v0.6/v0.7/v0.8按原版本恢复 |
| 内容 | rogue-content-v09.mjs及其继承目录 | 8职业、96牌、31遗物、30敌人、10道具、15事件 |
| 单局流程 | rogue-run-v09.mjs | 开局祝福→选路→战斗/地点→奖励→首领→幕间→结算；3幕15站 |
| 路线 | makeMapPlan、makeRoute、routeAction | 每幕4个选择站+首领；当前各行独立选择；每幕仅1处营地，首领前至少1场战斗 |
| 回合 | rogue-battle-v09.mjs | 基础手牌5、能量3、出牌上限3、战斗上限12轮；0费仍占出牌次数 |
| 信使 | messenger_seal及对应战斗触发 | 每轮首次主动成功抽牌/择弃/保留获1备势；自动抽牌、道具、回声不触发 |
| 医师 | medic_badge及对应战斗触发 | 每轮首次主动实际治疗获2盾；满血、道具、回声不触发 |
| 奖励 | rewardCards、recommendedCard、startRewards | 已有标签相关/本幕新牌/衔接候选分层抽样，推荐按效果和标签评分；可自由跳过；不保证成套组件 |
| 服务 | actionCamp、actionShop、actionEvent | 升级针对实体UID；商店升级/删牌各一次，删牌最低张数和价格由目录约束 |
| 本局资源 | rogue-run-v09.mjs | 余烬用于本局购买/服务；道具2槽，满槽须明确替换 |
| 进阶与经济 | rogue-difficulty-v08.mjs、rogue-economy.mjs、rogue-service.mjs | 进阶0—10；金币按现有次数/每日总上限结算；练习不发币但可推进职业进度 |
| 存档与到账 | rogue-service.mjs | 服务器/用户隔离，成功动作与快照事务保存，请求幂等，结算收据防重复到账 |
| 文字与图像 | rogue-ui.mjs、rogue-card-guide.mjs、rogue-image.mjs | 依据局版本显示真实效果；图片失败仍有文字和按钮 |

P0/P1第一批只增加本局观察与事实型构筑提示，不改变牌、敌人、掉落、回合或奖励数值，故不新增规则版本。观察只覆盖接入后成功动作，不能用缺失记录推断玩家没有操作；构筑提示不等于成熟流派或最优解。

改规则前先核对以上入口，再更新对应版本、索引、验收记录与PROJECT_NOW.md。真人体验尚须验证选择理由、卡手、理解、耗时及重玩意愿。
