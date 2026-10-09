# 灯下迷城 · 设计入口
更新：2026-10-10（Asia/Shanghai）

当前完成 **v0.2第一幕设计与独立程序演算**，参考尖塔2后采用能量制。第二/第三幕内容、正式游戏服务和实机界面仍未完成，尚未上线/发币。

| 阅读目的 | 当前文件 |
|---|---|
| 公共规则、阶段与结算边界 | [公共规范v0.2](ROGUELIKE_CORE_SPEC.md) |
| 牌/升级/遗物/敌人精确数值 | [唯一内容目录](FIRST_ACT_CATALOG.json) |
| 构筑与敌人机制 | [第一幕战斗内容](FIRST_ACT_BATTLE_CONTENT.md) |
| 路线、奖励与手机页面 | [第一幕流程/UI](FIRST_ACT_FLOW_AND_UI.md) |
| 完整第一幕样例 | [新版演算](FIRST_ACT_WALKTHROUGH_V02.md) |
| 数值检查、局限与费用对照 | [复核报告](BALANCE_REVIEW_V02.md) |
| 可复现参考程序/原始样本 | [Python模型](reference_sim.py) / [结果](BALANCE_RESULTS.json) |
| 子模块共享接口 | [内容契约](CONTENT_CONTRACT.md) |

模型只计算有限战斗/第一幕，不包含Discord、钱包、真实存档或后两幕；6336情境试验不等于真人实测。酒馆币奖励金额与评分公式待经济阶段。

## 参考资料与旧版对照

- [尖塔2机制资料](STS2_REFERENCE_FINDINGS.md)
- [v0.1数值独立审查](ROGUELIKE_BALANCE_REVIEW.md)
- [v0.2调整提案与验证计划](STS2_ADAPTATION_PLAN.md)（现已按第一幕完成本轮；实际当前值以目录为准）
- [v0.1公共规则归档](ROGUELIKE_CORE_V01_ARCHIVE.md)
- [v0.1流程](ROGUELIKE_FLOW_SPEC.md) / [旧27→30→23算例](ROGUELIKE_FIRST_ACT_WALKTHROUGH.md)

旧版仅供对照，不得混用抽牌/奖励/篝火/牌值。整体模块与后续顺序见[总设计](../../ROGUELIKE_DESIGN.md)。
