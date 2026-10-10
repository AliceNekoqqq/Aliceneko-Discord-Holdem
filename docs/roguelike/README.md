# 灯下迷城 · 设计入口
更新：2026-10-10（Asia/Shanghai）

当前完成 **v0.3三幕内容、局内资源流程与独立参考演算**。20种牌、12件遗物、12种敌人，含商店/修灯/两处撤离检查点。正式游戏引擎、Discord页面、真实存档、钱包与排行榜尚未实现，未上线/发币。

| 阅读目的 | 当前文件 |
|---|---|
| 公共规则、逐段结算与持久化边界 | [公共规范v0.3](ROGUELIKE_CORE_SPEC.md) |
| 整局唯一数值目录 | [整局目录](RUN_CATALOG_V03.json) |
| 三幕路线、余烬来源与消费 | [整局流程](FULL_RUN_FLOW.md) |
| 第二幕/第三幕内容 | [镜巷](ACT2_DESIGN.md) / [无灯钟楼](ACT3_DESIGN.md) |
| 整局真实模型样例 | [三幕演算](FULL_RUN_WALKTHROUGH_V03.md) |
| 节奏、资源与验证局限 | [v0.3复核](FULL_RUN_BALANCE_V03.md) |
| 可复现程序与原始结果 | [整局驱动](full_run_sim.py) / [战斗模型](reference_sim.py) / [结果](FULL_RUN_RESULTS_V03.json) |
| 后两幕共享接口 | [v0.3契约](LATER_ACT_CONTRACT.md) |

648条策略样本不是人类胜率，动作代理量不是实际点击或分钟数。经济评分/酒馆币金额待下一阶段；现有150日总限额等未改变。总方向与下一步见[总设计](../../ROGUELIKE_DESIGN.md)。

## 第一幕基线与历史对照

第一幕数值仍来自[FIRST_ACT_CATALOG.json](FIRST_ACT_CATALOG.json)，其14牌/6遗物/4敌人已原样并入v0.3。后两幕来源为[ACT2](ACT2_CONTENT.json)/[ACT3](ACT3_CONTENT.json)，修改后必须同步合并目录。

- [第一幕战斗](FIRST_ACT_BATTLE_CONTENT.md) / [流程UI](FIRST_ACT_FLOW_AND_UI.md) / [演算v0.2](FIRST_ACT_WALKTHROUGH_V02.md)
- [v0.2复核](BALANCE_REVIEW_V02.md) / [原始结果](BALANCE_RESULTS.json) / [规范归档](ROGUELIKE_CORE_V02_ARCHIVE.md) / [原接口](CONTENT_CONTRACT.md)
- [尖塔2参考](STS2_REFERENCE_FINDINGS.md) / [调整提案](STS2_ADAPTATION_PLAN.md)
- [v0.1规范](ROGUELIKE_CORE_V01_ARCHIVE.md) / [流程](ROGUELIKE_FLOW_SPEC.md) / [旧演算](ROGUELIKE_FIRST_ACT_WALKTHROUGH.md) / [旧审查](ROGUELIKE_BALANCE_REVIEW.md)

旧版本只供对照，不混用牌值/抽牌/篝火/奖励。历史参考资料不证明当前生产游戏已实现。
