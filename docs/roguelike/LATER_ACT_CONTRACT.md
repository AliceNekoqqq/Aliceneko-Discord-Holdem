# v0.3第二/三幕共享接口

2026-10-10。当前任务只完善三幕设计与独立参考模型，不接入生产/钱包/Discord。第一幕14牌/6遗物/4敌人目录保持数值，不重做其测试。

- 引用已恢复 FIRST_ACT_CATALOG.json、ROGUELIKE_CORE_SPEC.md。HP30、抽4/2能量/至多主动2张、12轮，逐效果停止、灼烧/消耗/回声/护甲/敌盾规则保持。
- 后两幕每幕仍2个分岔+Boss，完成站按实际处理+1，不是选路+1。章节起始赐福不占站；两Boss检查点可退，最终Boss直接CLEAR，无最终奖励升级。进入新章不免费补满。
- 允许新增牌只用damage/block/burn/heal效果（参考模型可准确执行），1/2费，无0费/回能/抽牌/额外回合，无新状态关键词。升同实体一次，治疗本战消耗且不可回声。
- 新敌intent仅attack/charge/guard，attack允许hits正整数1-3。value是每段伤害，护盾逐段消耗、每段后判死，每段被盾吸收可触发反击一次（反击不连锁），如果反击击杀，取消剩余段。charge预告下一轮总伤及段数。guard只保护下一玩家轮到其下次行动前清空。
- 新遗物仅已有trigger：first_attack_burn/first_block_per_turn/first_attack_damage/burn_bonus/reflect/echo。不新增echo类遗物（已有精英echo），无新触发类型/复杂费用；同ID不可重复，首次主动攻击加伤仅第一个伤害包，回声不重复主动触发。
- ACT2新章节候选3件：burn_bonus值1、first_block_per_turn值2、first_attack_damage值4。ACT3候选3件：burn_bonus值2、reflect值3、first_attack_damage值6。已有精英奖励遗物pool沿用3件，排除已拥有ID，若不足3展示实际可得数量；可跳过。
- 每幕新增3张奖励牌，全部可升级，至少一张复合牌/条件穿甲/消耗持续伤或治疗；避免只是比基础更大的伤害且没有费用取舍。新牌可从对应幕/之后幕普通/精英奖励与副本商店获得，不倒灌第一幕。
- 每幕2普通敌/1精英/1Boss。ACT2普通HP28-34，精英HP38-44，BossHP50-58；ACT3普通HP34-40，精英HP44-52，BossHP62-70。每轮总攻击初拟ACT2 6-10、ACT3 8-12，多段清楚显示每段×次数。参数只是初值，主agent会用跨幕HP/种子/策略校准，不保证目标胜率。
- 新幕奖励/路线规则由主agent统一，子agent只设计敌人/牌/遗物与机制说明。每幕可选普通/商店/事件等与篝火/精英，保证不收费锁门与可升级/删弱牌；不把真实酒馆币用于副本商店。

## 子模块JSON

ACT2_CONTENT.json / ACT3_CONTENT.json 顶层：act/name/cards/relics/chapterRelics/enemies/normalEnemies/eliteEnemy/bossEnemy/newCardRewards。字段完全参照FIRST_ACT_CATALOG，enemy intent可额外hits。ID分别以a2_/a3_前缀避免撞名。每幕3新牌、3新遗物、4敌人，不添加version/player/starterDeck。

MD写每个敌人的取舍（多段/甲/架盾/蓄力），不要只列大数值；以JSON为唯一数值源，简短场景氛围及等待主agent验证说明，不宣称已上线或已测。
