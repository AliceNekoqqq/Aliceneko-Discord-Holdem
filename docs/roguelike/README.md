# 灯下迷城 · 设计入口
更新：2026-10-10（Asia/Shanghai）

当前完成 **v0.4可执行JS规则、SQLite存档/结算服务和Discord私密面板**；三幕内容目录保持v0.3。20种牌、12件遗物、12种敌人，含商店/修灯/两处撤离检查点。上述模块已实现并通过50项定向检查，但尚未挂到Worker/大厅/命令/webhook，未上线/实际发币。

| 阅读目的 | 当前文件 |
|---|---|
| 尖塔2参考依据、远期职业与混搭补充（主案v0.5优先） | [参考补充](CONTENT_EXPANSION_PLAN.md) |
| 公共规则、逐段结算与持久化边界 | [公共规范v0.4](ROGUELIKE_CORE_SPEC.md) |
| 程序模块/验证与生产连接断点 | [实现说明v0.4](IMPLEMENTATION_V04.md) |
| 评分、货币与同题资格 | [经济契约v0.4](ECONOMY_AND_RANKING_V04.md) |
| JS规则/存档/界面 | [战斗](../../rogue-battle.mjs) / [整局](../../rogue-run.mjs) / [服务](../../rogue-service.mjs) / [面板](../../rogue-ui.mjs) / [交互](../../rogue-interactions.mjs) |
| 整局唯一数值目录 | [整局目录](RUN_CATALOG_V03.json) |
| 三幕路线、余烬来源与消费 | [整局流程](FULL_RUN_FLOW.md) |
| 第二幕/第三幕内容 | [镜巷](ACT2_DESIGN.md) / [无灯钟楼](ACT3_DESIGN.md) |
| 整局真实模型样例 | [三幕演算](FULL_RUN_WALKTHROUGH_V03.md) |
| 节奏、资源与验证局限 | [v0.3复核](FULL_RUN_BALANCE_V03.md) |
| 可复现程序与原始结果 | [整局驱动](full_run_sim.py) / [战斗模型](reference_sim.py) / [结果](FULL_RUN_RESULTS_V03.json) |
| 后两幕共享接口 | [v0.3契约](LATER_ACT_CONTRACT.md) |

648条策略样本不是人类胜率，动作代理量不是实际点击或分钟数。新经济契约为累计8/18/30、每日2有奖开局、60结算日子cap且含现有150；目前只是可执行服务规则，尚无线上收入。总方向与下一步见[总设计](../../ROGUELIKE_DESIGN.md)。


新增内容规划（未实现/未上线）：[六职业、八流派与28对混搭](CONTENT_EXPANSION_PLAN_V05.md)，[敌人、连接遗物与消耗品候选](EXPANSION_ENEMIES_AND_ITEMS_DRAFT.md)。首批先用3职业/4方向，长期候选逐批验证；不替换v0.4规则或v0.3数值目录。当前生产集成断点保留。

## 历史基线与对照

[v0.3公共规范归档](ROGUELIKE_CORE_V03_ARCHIVE.md)与Python结果保持，不混称当前生产状态。

第一幕数值仍来自[FIRST_ACT_CATALOG.json](FIRST_ACT_CATALOG.json)，其14牌/6遗物/4敌人已原样并入v0.3。后两幕来源为[ACT2](ACT2_CONTENT.json)/[ACT3](ACT3_CONTENT.json)，修改后必须同步合并目录。

- [第一幕战斗](FIRST_ACT_BATTLE_CONTENT.md) / [流程UI](FIRST_ACT_FLOW_AND_UI.md) / [演算v0.2](FIRST_ACT_WALKTHROUGH_V02.md)
- [v0.2复核](BALANCE_REVIEW_V02.md) / [原始结果](BALANCE_RESULTS.json) / [规范归档](ROGUELIKE_CORE_V02_ARCHIVE.md) / [原接口](CONTENT_CONTRACT.md)
- [尖塔2参考](STS2_REFERENCE_FINDINGS.md) / [调整提案](STS2_ADAPTATION_PLAN.md)
- [v0.1规范](ROGUELIKE_CORE_V01_ARCHIVE.md) / [流程](ROGUELIKE_FLOW_SPEC.md) / [旧演算](ROGUELIKE_FIRST_ACT_WALKTHROUGH.md) / [旧审查](ROGUELIKE_BALANCE_REVIEW.md)

旧版本只供对照，不混用牌值/抽牌/篝火/奖励。历史参考资料不证明当前生产游戏已实现。
