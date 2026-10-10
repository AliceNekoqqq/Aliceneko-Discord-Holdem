import { CATALOG } from './rogue-catalog.mjs';

const clone = (value) => structuredClone(value);

function effectDescription(effect) {
  const value = effect.value;
  switch (effect.kind) {
    case 'damage': return `${effect.ignoreArmor ? '造成无视护甲、仍受护盾阻挡的' : '造成'}${value}点直接伤害`;
    case 'block': return `获得${value}点临时护盾`;
    case 'burn': return `施加${value}层灼烧`;
    case 'heal': return `恢复${value}点生命（不超过生命上限）`;
    case 'prepare': return `获得${value}点备势；下次主动或回声的首个直接伤害包额外造成${value}点伤害，随后消耗备势`;
    case 'mark': return `给敌人留下${value}点追猎标记；下次主动或回声的首个直接伤害包额外造成${value}点伤害，随后消耗标记`;
    case 'sift': return '选择另一张手牌弃置，并补抽一张牌';
    case 'exhaust_other': return '可选择另一张手牌，将其移入本战消耗堆';
    case 'retain': return '将所选手牌保留到下一轮，下一轮手牌总数仍不超过4张';
    case 'counter': return `本轮首次以护盾吸收敌方攻击后，反击造成${value}点直接伤害`;
    case 'echo_next': return '安排下一张符合条件的牌在下轮重放一次';
    case 'self_echo': return '本牌在下轮重放一次；重放不递归触发回声';
    case 'delay_burn': return `安排${value}层延迟火种：下回合开始时施加灼烧，并于该回合末结算`;
    case 'damage_from_shield': return `消耗至多${effect.maxSpend}点护盾；造成${value}点基础伤害，并按消耗护盾增加伤害`;
    case 'summon': return `召来伙伴并增加${value}点伙伴生命，伙伴生命上限12`;
    case 'pet_attack': return `若伙伴存活，命令其造成${value}点直接伤害`;
    case 'sacrifice': return `牺牲伙伴，造成${value}点直接伤害`;
    case 'forge': return `本战锻值增加${value}，最多12点`;
    case 'weapon_attack': return `造成${value}点基础武器伤害，并加上当前锻值${effect.ignoreArmor ? '（无视护甲，仍受护盾阻挡）' : ''}`;
    default: return '';
  }
}

function card(name, cost, effects, tags, rewardAct, options = {}) {
  const upgrade = options.upgrade ?? effects.map((effect) => {
    if (effect.kind === 'damage' || effect.kind === 'burn' || effect.kind === 'block' || effect.kind === 'heal' || effect.kind === 'counter' || effect.kind === 'pet_attack' || effect.kind === 'weapon_attack' || effect.kind === 'sacrifice') {
      return { ...effect, value: effect.value + 2 };
    }
    if (effect.kind === 'summon' || effect.kind === 'forge' || effect.kind === 'prepare' || effect.kind === 'mark' || effect.kind === 'echo_next' || effect.kind === 'self_echo' || effect.kind === 'delay_burn') {
      return { ...effect, value: effect.value + 1 };
    }
    return { ...effect };
  });
  return {
    name, cost, selfCost: options.selfCost ?? 0,
    exhaust: options.exhaust ?? false,
    replayable: options.replayable ?? !effects.some((effect) => ['heal', 'sift', 'exhaust_other', 'retain', 'echo_next', 'self_echo', 'summon', 'forge'].includes(effect.kind)),
    effects: clone(effects),
    upgrade: { cost: options.upgradeCost ?? cost, selfCost: options.upgradeSelfCost ?? options.selfCost ?? 0, effects: clone(upgrade) },
    tags, rewardAct, description: options.description ?? `${name}：${effects.map(effectDescription).filter(Boolean).join('；')}。`,
  };
}

const cards = {
  // 提灯旅人：通用老街工具，起手覆盖标记与蓄势，不额外拿首幕赐福。
  route_mark: card('照路记号', 1, [{ kind: 'mark', value: 1 }, { kind: 'damage', value: 4 }], ['预备', '追猎'], 1),
  lantern_guard: card('提灯护步', 1, [{ kind: 'block', value: 5 }, { kind: 'prepare', value: 1 }], ['守御', '预备'], 1),
  swift_cut: card('巷口快斩', 1, [{ kind: 'damage', value: 7 }], ['重击'], 1),
  bellwatch: card('守铃听风', 1, [{ kind: 'block', value: 7 }, { kind: 'retain', value: 1 }], ['守御', '预备'], 2, { replayable: false }),

  // 守门人：护盾牌本身产生有限反击出口，亦有主动盾转伤。
  gate_counter: card('门闩迎击', 1, [{ kind: 'block', value: 6 }, { kind: 'counter', value: 2 }], ['守御', '反击'], 1),
  gatebreak: card('破门槌', 1, [{ kind: 'damage_from_shield', value: 2, maxSpend: 5 }], ['守御', '重击'], 1),
  bulwark_riposte: card('垛口回刺', 1, [{ kind: 'block', value: 5 }, { kind: 'damage', value: 4 }], ['守御', '重击'], 2),
  iron_hold: card('铁闩固守', 2, [{ kind: 'block', value: 11 }], ['守御'], 2, { exhaust: true, replayable: false }),

  // 烬火调酒师：直接用火、盾、生命代价调出复合效果，不增设调剂资源。
  ember_tea: card('烬火热饮', 1, [{ kind: 'block', value: 4 }, { kind: 'burn', value: 2 }], ['灼烧', '调制', '守御'], 1),
  bitter_spritz: card('苦口烈饮', 1, [{ kind: 'damage', value: 5 }, { kind: 'burn', value: 2 }], ['灼烧', '调制'], 1),
  foamy_guard: card('泡沫护杯', 1, [{ kind: 'block', value: 6 }, { kind: 'burn', value: 1 }], ['灼烧', '守御'], 2),
  red_recipe: card('赤酿配方', 1, [{ kind: 'block', value: 4 }, { kind: 'burn', value: 4 }], ['灼烧', '调制'], 2, { selfCost: 1, replayable: false }),

  // 镜巷信使：筛牌、择弃与保留均消耗主动牌机会，不免费打出被整理的牌。
  quick_dispatch: card('急递销页', 1, [{ kind: 'damage', value: 4 }, { kind: 'exhaust_other', value: 1 }], ['预备', '消耗', '重击'], 1, { replayable: false }),
  folded_note: card('折页护符', 1, [{ kind: 'block', value: 5 }, { kind: 'retain', value: 1 }], ['预备', '守御'], 1, { replayable: false }),
  needle_route: card('针巷穿行', 1, [{ kind: 'damage', value: 4, ignoreArmor: true }, { kind: 'mark', value: 1 }], ['重击', '追猎'], 2),
  last_message: card('末站回信', 2, [{ kind: 'damage', value: 9 }, { kind: 'self_echo', value: 1 }], ['回声', '重击'], 2, { replayable: false }),
  letter_sift: card('分拣来信', 1, [{ kind: 'block', value: 4 }, { kind: 'sift', value: 1 }], ['预备', '守御'], 2, { replayable: false }),

  // 钟楼匠：以预备和延迟回声安排下一轮节奏，与铸器匠的锻值循环区分。
  bell_timing: card('钟前听风', 1, [{ kind: 'block', value: 5 }, { kind: 'prepare', value: 2 }], ['预备', '守御'], 1, { replayable: false }),
  echo_ward: card('余音护幕', 1, [{ kind: 'block', value: 5 }, { kind: 'self_echo', value: 1 }], ['回声', '守御'], 1, { replayable: false }),
  ringing_cut: card('钟沿斜斩', 1, [{ kind: 'damage', value: 5 }, { kind: 'prepare', value: 1 }], ['预备', '重击'], 2),
  quiet_hour: card('静钟时刻', 1, [{ kind: 'block', value: 7 }, { kind: 'retain', value: 1 }], ['回声', '预备', '守御'], 2, { replayable: false }),

  // 渡鸦医师：有限治疗、护盾与标记，不能形成无限治疗回路。
  field_medic: card('渡鸦包扎', 1, [{ kind: 'heal', value: 4 }, { kind: 'block', value: 3 }], ['治疗', '守御'], 1, { exhaust: true, replayable: false }),
  restorative_wrap: card('止血护带', 1, [{ kind: 'block', value: 6 }, { kind: 'heal', value: 2 }], ['治疗', '守御'], 1, { exhaust: true, replayable: false }),
  triage_strike: card('急救剪击', 1, [{ kind: 'damage', value: 6 }, { kind: 'mark', value: 1 }], ['追猎', '重击'], 2),
  bitter_remedy: card('苦药压火', 1, [{ kind: 'heal', value: 3 }, { kind: 'delay_burn', value: 2 }], ['治疗', '灼烧'], 2, { exhaust: true, replayable: false }),

  // 驯兽师：召唤填充生命，宠物主动攻击消耗一次玩家出牌；可牺牲宠物换爆发。
  call_lanternfox: card('唤来灯狐', 1, [{ kind: 'summon', value: 5 }, { kind: 'block', value: 3 }], ['召唤', '守御'], 1, { replayable: false }),
  fox_pounce: card('灯狐扑击', 1, [{ kind: 'pet_attack', value: 5 }], ['召唤', '重击'], 1, { replayable: false }),
  collar_guard: card('护颈绳结', 1, [{ kind: 'block', value: 6 }, { kind: 'summon', value: 2 }], ['召唤', '守御'], 2, { replayable: false }),
  last_command: card('孤注号令', 1, [{ kind: 'sacrifice', value: 8 }], ['召唤', '搏命'], 2, { replayable: false }),

  // 铸器匠：并非永久强化；forge战后清空，武器攻击可反复打但仍受费用/主动次数限制。
  forge_stance: card('砧前架势', 1, [{ kind: 'forge', value: 3 }, { kind: 'block', value: 4 }], ['铸器', '守御'], 1, { replayable: false }),
  forged_weapon: card('初锻短刃', 1, [{ kind: 'weapon_attack', value: 4 }], ['铸器', '重击'], 1),
  anvil_wall: card('铁砧墙', 1, [{ kind: 'block', value: 8 }, { kind: 'forge', value: 1 }], ['铸器', '守御'], 2, { replayable: false }),
  sacrifice_gear: card('拆件飞刃', 1, [{ kind: 'sacrifice', value: 6 }, { kind: 'forge', value: 1 }], ['铸器', '召唤', '搏命'], 2, { replayable: false }),

  // 通用桥梁：每张都有独立的基础价值，避免把流派做成凑套门槛。
  cinder_bastion: card('炭墙', 1, [{ kind: 'block', value: 5 }, { kind: 'burn', value: 2 }], ['灼烧', '守御'], 1),
  ash_mark: card('灰烬记号', 1, [{ kind: 'mark', value: 1 }, { kind: 'burn', value: 2 }], ['灼烧', '追猎'], 1, { replayable: false }),
  measured_reply: card('量势回挡', 1, [{ kind: 'block', value: 6 }, { kind: 'counter', value: 2 }], ['守御', '反击'], 2),
  echoing_edge: card('回响刃', 1, [{ kind: 'damage', value: 5 }, { kind: 'echo_next', value: 1 }], ['回声', '重击'], 2, { replayable: false }),
  ash_echo: card('余烬回声', 1, [{ kind: 'burn', value: 3 }, { kind: 'echo_next', value: 1 }], ['回声', '灼烧'], 2, { replayable: false }),
  shield_to_spear: card('盾锋转刺', 1, [{ kind: 'block', value: 4 }, { kind: 'damage_from_shield', value: 1, maxSpend: 4 }], ['守御', '重击'], 2, { replayable: false }),
  foxsmith_alliance: card('狐火铆钉', 1, [{ kind: 'summon', value: 2 }, { kind: 'forge', value: 1 }, { kind: 'block', value: 3 }], ['召唤', '铸器', '守御'], 3, { replayable: false }),
  marked_burst: card('追迹爆发', 2, [{ kind: 'damage', value: 8 }, { kind: 'mark', value: 2 }], ['重击', '追猎'], 3),
  paper_ember: card('纸页余烬', 1, [{ kind: 'damage', value: 4 }, { kind: 'burn', value: 2 }], ['消耗', '灼烧'], 3, { exhaust: true, replayable: false }),
};

const relics = {
  traveler_lantern: { name: '旧街灯扣', trigger: 'prepare_block', value: 2, limit: 'turn', description: '每轮首次获得备势后，获得2点临时护盾。' },
  warden_badge: { name: '守门铜牌', trigger: 'first_block_per_turn', value: 2, description: '每轮首次主动打出含护盾效果的牌时，额外获得2点临时护盾。' },
  brewer_flask: { name: '烬火酒壶', trigger: 'burn_block', value: 1, limit: 'turn', description: '每轮首次主动施加灼烧后，获得1点临时护盾。' },
  messenger_seal: { name: '信使封蜡', trigger: 'other_exhaust_prepare', value: 1, limit: 'battle', description: '每战首次因主动效果消耗另一张手牌时，获得备势1。' },
  smith_rivet: { name: '钟楼回声簧', trigger: 'echo', value: 1, description: '每战首次主动打出的可回声牌，在下轮额外重放一次。' },
  medic_badge: { name: '渡鸦医牌', trigger: 'camp_heal', value: 2, description: '营地治疗额外恢复2点生命。' },
  tamer_whistle: { name: '驯兽哨', trigger: 'start_pet', value: 4, description: '每场战斗开始时召来灯狐，伙伴生命4。' },
  forger_hammer: { name: '铸器小锤', trigger: 'weapon_bonus', value: 2, limit: 'battle', description: '每战首次主动武器攻击额外造成2点伤害。' },
  echo_buckle: { name: '回声扣', trigger: 'echo_block', value: 2, limit: 'battle', description: '每战首次发生回声重放后，获得2点临时护盾。' },
  ember_lens: { name: '熄火镜片', trigger: 'echo_burn', value: 1, limit: 'battle', description: '每战首次回声施火额外施加灼烧1。' },
  clean_slate: { name: '空白纸页', trigger: 'active_exhaust_block', value: 2, limit: 'battle', description: '每战首次主动打出消耗牌后，获得护盾2。' },
  splinter_awl: { name: '碎镜锥', trigger: 'other_exhaust_pierce', value: 1, limit: 'battle', description: '每战首次主动消耗另一张手牌后，下一次主动直接伤害额外增加1点并无视护甲。' },
  shelter_ember: { name: '守灯余火', trigger: 'block_burn', value: 1, limit: 'turn', description: '每轮首次用护盾挡住敌方攻击后，对敌人施加1层灼烧。' },
};

const enemies = {
  empty_bottle: { name: '空瓶投手', role: '普通', hp: 25, armor: 0, intents: [{ kind: 'attack', value: 3, hits: 2, label: '瓶雨：3×2' }, { kind: 'attack', value: 7, label: '砸瓶' }, { kind: 'guard', value: 4, label: '缩在棚下' }] },
  patrol_apprentice: { name: '巡灯学徒', role: '普通', hp: 23, armor: 0, intents: [{ kind: 'attack', value: 3, label: '短棍' }, { kind: 'attack', value: 5, label: '加速追打' }, { kind: 'charge', value: 7, label: '举灯蓄力：下轮重击' }, { kind: 'attack', value: 7, label: '举灯重击' }, { kind: 'guard', value: 3, label: '喘息' }] },
  debt_collector: { name: '灰巷收债人', role: '普通', hp: 28, armor: 2, intents: [{ kind: 'attack', value: 4, label: '短斧' }, { kind: 'guard', value: 5, label: '讨债架势' }, { kind: 'attack', value: 6, label: '重斧' }] },
  mirror_spore: { name: '折镜孢子', role: '普通', hp: 31, armor: 0, intents: [{ kind: 'attack', value: 4, label: '镜片弹' }, { kind: 'guard', value: 3, label: '折光' }, { kind: 'conditional', onAttack: { kind: 'guard', value: 4 }, onOther: { kind: 'attack', value: 5 }, label: '读光：首张主动攻击则架盾，否则反击' }] },
  mirror_dancer: { name: '镜粉舞者', role: '普通', hp: 33, armor: 1, intents: [{ kind: 'attack', value: 4, label: '粉刃' }, { kind: 'attack', value: 3, hits: 2, label: '双旋刃：3×2' }, { kind: 'guard', value: 5, label: '镜幕' }] },
  rivet_carrier: { name: '铆钉搬运工', role: '普通', hp: 35, armor: 1, intents: [{ kind: 'guard', value: 6, label: '架起铆板' }, { kind: 'attack', value: 4, hits: 2, label: '铆板冲撞：4×2' }, { kind: 'attack', value: 6, label: '落板' }] },
  ember_feeder: { name: '余烬饲者', role: '普通', hp: 36, armor: 1, intents: [{ kind: 'attack', value: 4, label: '火钩' }, { kind: 'burn', value: 2, label: '扬灰：玩家灼烧2' }, { kind: 'charge', value: 8, label: '吞焰蓄力：下轮喷火重击8' }, { kind: 'attack', value: 8, label: '喷火重击8' }] },
  bell_hound: { name: '钟面猎犬', role: '普通', hp: 39, armor: 1, intents: [{ kind: 'attack', value: 3, hits: 3, label: '三咬：3×3' }, { kind: 'guard', value: 5, label: '缩身' }, { kind: 'attack', value: 9, label: '落钟扑击' }] },
  rusted_scribe: { name: '锈页书记', role: '普通', hp: 37, armor: 0, intents: [{ kind: 'attack', value: 4, label: '铁笔' }, { kind: 'cleanse', value: 2, label: '刮去敌方灼烧2' }, { kind: 'guard', value: 6, label: '翻页遮挡' }] },
  cracked_sergeant: { name: '裂甲巡官', role: '精英', hp: 44, armor: 3, intents: [{ kind: 'guard', value: 5, armor: 2, label: '守势：护盾5、护甲+2' }, { kind: 'charge', value: 10, label: '抬斧蓄力' }, { kind: 'attack', value: 10, label: '裂甲重击' }, { kind: 'attack', value: 5, label: '短击' }] },
  cinder_keeper: { name: '余烬看守', role: '精英', hp: 48, armor: 2, intents: [{ kind: 'attack', value: 5, label: '灯钩' }, { kind: 'burn', value: 3, label: '撒火星：玩家灼烧3' }, { kind: 'charge', value: 9, label: '封门蓄力' }, { kind: 'attack', value: 9, label: '封门锤' }] },
  chain_duelist: { name: '镜链斗士', role: '精英', hp: 52, armor: 2, intents: [{ kind: 'attack', value: 4, hits: 3, label: '镜链三连：4×3' }, { kind: 'guard', value: 7, label: '收链' }, { kind: 'attack', value: 7, label: '抽链' }] },
  misaligned_clock: { name: '失准校钟师', role: '精英', hp: 50, armor: 1, intents: [{ kind: 'charge', value: 6, hits: 2, label: '校准重摆：下轮每段6×2' }, { kind: 'attack', value: 6, hits: 2, label: '错位双摆：6×2' }, { kind: 'guard', value: 6, label: '藏入钟壳' }] },
  ferry_taxman: { name: '渡口税吏', role: '精英', hp: 55, armor: 4, intents: [{ kind: 'guard', value: 9, label: '税盾' }, { kind: 'attack', value: 7, label: '收税杖' }, { kind: 'thorns', value: 2, label: '倒钩护甲：本轮主动直伤反伤2' }] },
  shadow_hunter: { name: '倒影猎手', role: '精英', hp: 49, armor: 2, intents: [{ kind: 'attack', value: 6, label: '倒影刺' }, { kind: 'guard', value: 6, label: '退入影面' }, { kind: 'conditional', onAttack: { kind: 'attack', value: 4 }, onOther: { kind: 'guard', value: 5 }, label: '追迹：首张主动攻击则刺击，否则架盾' }] },
  dark_lady: { name: '熄灯夫人', role: 'Boss', hp: 62, armor: 2, intents: [{ kind: 'attack', value: 5, label: '烛剪' }, { kind: 'charge', value: 12, label: '熄灯蓄力' }, { kind: 'attack', value: 12, label: '黑烛重击' }, { kind: 'guard', value: 7, label: '披上灯罩' }] },
  mirror_magistrate: { name: '镜巷双面官', role: 'Boss', hp: 72, armor: 3, intents: [{ kind: 'attack', value: 4, hits: 3, label: '明面三斩：4×3' }, { kind: 'guard', value: 8, label: '转入背面' }, { kind: 'conditional', onAttack: { kind: 'attack', value: 8 }, onOther: { kind: 'guard', value: 6 }, label: '双面裁断：首张主动攻击则斩击，否则架盾' }, { kind: 'cleanse', value: 3, label: '镜背抹去灼烧3' }] },
  bell_colossus: { name: '钟腹巨像', role: 'Boss', hp: 84, armor: 3, intents: [{ kind: 'charge', value: 7, hits: 2, label: '蓄钟：下轮每段7×2' }, { kind: 'attack', value: 7, hits: 2, label: '钟锤连落：7×2' }, { kind: 'guard', value: 10, label: '钟壳闭合' }, { kind: 'thorns', value: 3, label: '热钟反震：本轮主动直伤反伤3' }] },
};

const professionSpecs = {
  traveler: { name: '提灯旅人', description: '以照路标记和提灯护步适应战局。', deck: ['route_mark', 'lantern_guard'], relic: 'traveler_lantern', tags: ['预备', '追猎', '守御'] },
  warden: { name: '守门人', description: '以盾吸收攻击，再用迎击和破门转出伤害。', deck: ['gate_counter', 'iron_hold'], relic: 'warden_badge', tags: ['守御', '反击', '重击'] },
  brewer: { name: '烬火调酒师', description: '把灼烧、护盾与生命代价调成一拍复合效果。', deck: ['ember_tea', 'bitter_spritz'], relic: 'brewer_flask', tags: ['灼烧', '调制', '守御'] },
  messenger: { name: '镜巷信使', description: '用筛牌、保留与穿巷攻击安排手牌时机。', deck: ['quick_dispatch', 'folded_note'], relic: 'messenger_seal', tags: ['预备', '筛牌', '重击'] },
  smith: { name: '钟楼匠', description: '用预备与延迟回声安排攻防节拍，不依赖铸器。', deck: ['bell_timing', 'echo_ward'], relic: 'smith_rivet', tags: ['预备', '回声', '守御'] },
  medic: { name: '渡鸦医师', description: '有限治疗配合护盾和标记，不能循环回血。', deck: ['field_medic', 'triage_strike'], relic: 'medic_badge', tags: ['治疗', '守御', '追猎'] },
  tamer: { name: '驯兽师', description: '召来有上限的灯狐，让玩家主动支付牌位命令攻击。', deck: ['call_lanternfox', 'fox_pounce'], relic: 'tamer_whistle', tags: ['召唤', '守御', '重击'] },
  forger: { name: '铸器匠', description: '战斗内积累锻值，以武器攻击将其兑现。', deck: ['forge_stance', 'forged_weapon'], relic: 'forger_hammer', tags: ['铸器', '重击', '守御'] },
};

export const PROFESSIONS = Object.fromEntries(Object.entries(professionSpecs).map(([id, spec]) => [id, {
  name: spec.name,
  description: spec.description,
  starterDeck: ['slash', 'slash', 'pierce', 'guard', 'guard', 'bandage', ...spec.deck],
  starterRelic: spec.relic,
  tags: [...spec.tags],
}]));

export const ITEMS = {
  field_dressing_item: { name: '止血布', description: '恢复4点生命。', effects: [{ kind: 'heal', value: 4 }] },
  mirror_shard_item: { name: '碎镜针', description: '造成5点无视护甲的直接伤害，仍受敌盾阻挡。', effects: [{ kind: 'damage', value: 5, ignoreArmor: true }] },
  cold_ash_item: { name: '冷灰包', description: '施加3层灼烧。', effects: [{ kind: 'burn', value: 3 }] },
  folding_shield_item: { name: '折叠盾', description: '获得6点临时护盾。', effects: [{ kind: 'block', value: 6 }] },
  honing_oil_item: { name: '磨刀油', description: '本轮下一次主动攻击首个直伤包增加3点。', effects: [{ kind: 'attack_bonus', value: 3 }] },
  quench_salt_item: { name: '退火盐', description: '移除玩家至多3层灼烧。', effects: [{ kind: 'cleanse_player', value: 3 }] },
};

const normalPools = [
  ['empty_bottle', 'patrol_apprentice', 'debt_collector'],
  ['mirror_spore', 'mirror_dancer', 'rivet_carrier'],
  ['ember_feeder', 'bell_hound', 'rusted_scribe'],
];
const elitePools = [['cinder_knight', 'cracked_sergeant', 'cinder_keeper'], ['a2_prism_warden', 'chain_duelist', 'ferry_taxman'], ['a3_iron_verger', 'misaligned_clock', 'shadow_hunter']];
const bossPools = [['dark_lantern', 'dark_lady'], ['a2_mirror_regent', 'mirror_magistrate'], ['a3_unlit_bellmaster', 'bell_colossus']];
const starterRelicIds = Object.values(PROFESSIONS).map((profession) => profession.starterRelic);
const newRelicIds = Object.keys(relics);
const nonStarterRelicIds = newRelicIds.filter((id) => !starterRelicIds.includes(id));

export const CATALOG_V06 = clone(CATALOG);
CATALOG_V06.version = '0.6';
CATALOG_V06.professions = PROFESSIONS;
CATALOG_V06.items = ITEMS;
// v0.6 awards exactly the profession's starter relic; do not also roll the legacy opener gift.
CATALOG_V06.starterRelics = [];
CATALOG_V06.cards = { ...CATALOG_V06.cards, ...cards };
CATALOG_V06.relics = { ...CATALOG_V06.relics, ...relics };
CATALOG_V06.enemies = { ...CATALOG_V06.enemies, ...enemies };
for (const enemyId of ['cinder_knight', 'dark_lantern']) {
  CATALOG_V06.enemies[enemyId].intents = CATALOG_V06.enemies[enemyId].intents.map((intent) => intent.kind === 'charge'
    ? { ...intent, value: 8, label: '蓄力：下轮重击8' }
    : intent);
}
CATALOG_V06.eliteRelics = [...new Set([...CATALOG_V06.eliteRelics, ...newRelicIds])];
CATALOG_V06.acts = CATALOG_V06.acts.map((act, index) => {
  const rewardIds = Object.keys(cards).filter((id) => cards[id].rewardAct <= act.index);
  return {
    ...act,
    chapterRelics: index === 0 ? [] : [...new Set([...act.chapterRelics, ...nonStarterRelicIds])],
    normalPool: [...new Set([...act.normalEnemies, ...normalPools[index]])],
    elitePool: [...new Set([act.eliteEnemy, ...elitePools[index]])],
    bossPool: [...new Set([act.bossEnemy, ...bossPools[index]])],
    newCardRewards: [...new Set([...act.newCardRewards, ...rewardIds])],
  };
});

export function getCatalog(version) {
  return typeof version === 'string' && /(?:^|[^0-9])0\.6(?:$|[^0-9])/.test(version) ? CATALOG_V06 : CATALOG;
}
