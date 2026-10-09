# v0.2第一幕共享内容接口（2026-10-10）

本批设计与独立纸面/简化程序演算，非生产实现。不要修改线上源码或钱包。

- 玩家30最大HP；每轮抽4不同实体，2能量，最多主动打2张实体；逐牌选取结算，结束后才执行敌人意图。不回能/不额外抽牌/不额外回合，无0费初批牌。
- 初始牌组8实体：slash×3、guard×2、pierce×1、rush×1、bandage×1。slash：1费伤6；guard：1费盾5；pierce：1费无视护甲伤4（盾仍挡）；rush：1费先自伤2再伤9；bandage：1费治疗4，本战消耗、下战归回，满血不可打；护盾上限30，灼烧20，12轮失灯。
- 普通伤害按每个包先减敌护甲再盾再HP；自伤是生命代价绕过护盾/护甲。玩家本批护甲0。灼烧回合末先玩家再敌人，扣当前层数后-1；即时胜败停止剩余效果。
- 回声战斗首次真实选牌下轮免费重放，不耗能/主动次数，照付生命代价，不能重放自己排回声，不能复制治疗牌（本批治疗不标记可回声）。三流派本批：灼烧、防守反击、主动攻击/回声。
- 起始遗物候选固定3选1：tinder（首次主动攻击造成直接HP伤害后给敌灼烧2，每战1次）；brooch（每轮首次主动护盾牌额外盾1）；badge（每战首次主动攻击牌直接伤害+3）。这些是原型初值，统一由主agent根据对照演算调整。
- Boss前只有2个路线槽；槽1两条支路皆普通教学战；槽2固定“篝火/精英”二选一，再固定Boss。初始遗物不占地图站。普通战给余烬+卡牌3选1可跳过；精英给余烬+卡牌3选1+遗物3选1，奖励顺序卡→遗物；篝火治疗maxHP30%向下取整或升级一张未升级实体牌，主初值30→9HP，不提供删牌。Boss胜利给余烬、幕完成记录，再CHECKPOINT继续/确认撤离；进入第二幕才有新的章节遗物，不双发。本批内容只到第一幕，第二/三幕不虚构已完成。
- shop/event/cache作为后续节点接口，第一幕固定骨架不用全部塞入；买不起可离开，删牌最少4实体。副本余烬不带出、不兑换酒馆币。本批不定入账金额与评分公式。
- BATTLE存档额外保存能量/本轮已主动牌数/战斗消耗堆/每战与每轮触发标记/已升级实体属性。hand/draw/discard/exhaust互斥；主动打出的牌即移动（普通弃牌、消耗牌入exhaust），余手牌本轮结束再弃牌。抽不足先取余牌再洗此前discard补；不够4允许实际少抽，不复制exhaust或手牌实体。

## battle catalog JSON格式

顶层：version、player（maxHp/energy/draw/playLimit/turnLimit）、starterDeck（id列表）、cards（id→对象）、relics（id→对象）、starterRelics（id列表）、enemies（id→对象）、cardRewards（id列表）、eliteRelics（id列表）。
cards每个含name/cost/selfCost/exhaust/replayable/effects/upgrade。effects为按顺序数组：{kind:"damage",value:N,ignoreArmor?:true}、{kind:"block",value:N}、{kind:"burn",value:N}、{kind:"heal",value:N}。upgrade包含升级后的cost/selfCost/effects完整数组，exhaust/replayable不变。首批只这些效果，不新增未共享效果语法；每实体一次升级。
relics对象含name/trigger/value/description，trigger仅允许first_attack_burn、first_block_per_turn、first_attack_damage、burn_bonus（每次主动灼烧+value）、reflect（敌攻击被盾吸收>0后反击value，每敌攻击最多一次）、echo（首张可重放主动牌下轮重放一次）。遗物不可重复取得；反击不连锁，死亡不反击。初始3个与精英3个均用这些trigger。回声重放不触发first_attack_burn/first_block_per_turn/first_attack_damage/burn_bonus，但遵守其他被动和受击反击规则。
enemies对象含name/role/hp/armor/intents（对象数组，kind为attack/charge/guard，value整数，label），按数组循环，guard护盾保护下一玩家轮后在敌下一行动前清零；charge本轮无动作但显示下轮攻击预告。普通池2、精英1、Boss1即可。不做攻击+灼烧复合意图，避免扩大共享接口。

## 不可混用

v0.1抽3选1/6牌/篝火治疗8/老板20HP/每Boss遗物/包扎可循环等只作旧版对照。此次新内容全部v0.2，未完成内容与未验证指标需显式标记。

## 整合后的目录约定

初始牌5种、8实体，加9种奖励牌共14种，kindle在奖励池可获得。heavy_blow为2费14伤/升级17；ember_burst为2费灼烧6/升级8、本战消耗；measured_thrust为1费无视护甲伤5/升级7。精英28HP/护甲3，使基础pierce伤4对比slash减甲后3有明确条件价值。初次攻击含damage效果，纯burn不算攻击；反击为普通直接伤害，仍减敌方护甲。数值以FIRST_ACT_CATALOG.json为唯一来源。
