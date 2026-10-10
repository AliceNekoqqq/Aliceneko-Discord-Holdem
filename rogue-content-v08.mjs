import { CATALOG_V07, EVENTS as EVENTS_V07 } from './rogue-content-v07.mjs';
import { CATALOG_V06 } from './rogue-content-v06.mjs';
import { CATALOG } from './rogue-catalog.mjs';
import { DIFFICULTIES } from './rogue-difficulty-v08.mjs';

const clone = (value) => structuredClone(value);
const makeCard = (name, cost, effects, tags, rewardAct = 1, options = {}) => ({
  name, cost, selfCost: options.selfCost ?? 0, exhaust: options.exhaust ?? false,
  replayable: options.replayable ?? !effects.some((e) => ['heal','sift','exhaust_other','retain','echo_next','self_echo','summon','forge'].includes(e.kind)),
  effects: clone(effects),
  upgrade: { cost: options.upgradeCost ?? cost, selfCost: options.selfCost ?? 0, effects: clone(options.upgrade ?? effects.map((e) => ['damage','burn','block','heal','counter','pet_attack','weapon_attack'].includes(e.kind) ? { ...e, value: e.value + 2 } : { ...e })) },
  tags, rewardAct, description: options.description ?? `${name}：${effects.map((e) => `${e.value ?? ''}${({damage:'点伤害',block:'点护盾',burn:'层灼烧',heal:'点治疗',prepare:'点备势',mark:'点追猎',draw:'张抽牌',cleanse_player:'层净化'}[e.kind] ?? e.kind)}`).join('；')}。`,
});

// Four shared cards keep each opening deck familiar; the other four cards express the profession.
const professionCards = {
  traveler: {
    trail_cut: makeCard('沿街斩',1,[{kind:'damage',value:7}],['追猎','重击']),
    trail_mark: makeCard('灯痕',1,[{kind:'mark',value:1},{kind:'damage',value:4}],['追猎','预备']),
    lantern_step: makeCard('灯下稳步',1,[{kind:'block',value:6},{kind:'prepare',value:1}],['守御','预备']),
    street_medicine: makeCard('街角药包',1,[{kind:'heal',value:3},{kind:'mark',value:1}],['治疗','追猎'],1,{exhaust:true,replayable:false,upgrade:[{kind:'heal',value:5},{kind:'mark',value:2}],description:'恢复3点生命并留下1点追猎标记；本牌消耗。'}),
  },
  warden: {
    gate_smash: makeCard('门槛重击',1,[{kind:'damage',value:6},{kind:'block',value:3}],['重击','守御']),
    counter_bar: makeCard('横闩迎击',1,[{kind:'block',value:6},{kind:'counter',value:2}],['守御','反击'],1,{replayable:false}),
    iron_wall: makeCard('铁门闭合',1,[{kind:'block',value:9}],['守御']),
    patch_plate: makeCard('补甲布',1,[{kind:'heal',value:2},{kind:'block',value:3},{kind:'counter',value:2}],['治疗','守御','反击'],1,{exhaust:true,replayable:false,upgrade:[{kind:'heal',value:4},{kind:'block',value:5},{kind:'counter',value:3}]}),
  },
  brewer: {
    flame_pour: makeCard('倾火',1,[{kind:'damage',value:4},{kind:'burn',value:3}],['灼烧','重击']),
    coal_foam: makeCard('炭泡护杯',1,[{kind:'block',value:5},{kind:'burn',value:2}],['守御','灼烧']),
    bitter_draught: makeCard('苦酿',1,[{kind:'heal',value:3},{kind:'cleanse_player',value:2}],['治疗','净化'],1,{exhaust:true,replayable:false}),
    cask_guard: makeCard('酒桶掩护',1,[{kind:'block',value:7},{kind:'burn',value:1}],['守御','灼烧']),
  },
  messenger: {
    dispatch_strike: makeCard('急件投掷',1,[{kind:'damage',value:5},{kind:'draw',value:1}],['重击','整理'],1,{description:'造成5点伤害，并抽1张牌。'}),
    paper_screen: makeCard('纸墙',1,[{kind:'block',value:5},{kind:'retain',value:1}],['守御','整理'],1,{replayable:false,description:'获得5点护盾；选择1张手牌保留到下一轮。'}),
    sift_and_cut: makeCard('分拣来信',1,[{kind:'block',value:4},{kind:'sift',value:1}],['守御','整理'],1,{replayable:false,description:'获得4点护盾；选择另一张手牌弃置并补抽1张。'}),
    message_bandage: makeCard('急递药贴',1,[{kind:'heal',value:2},{kind:'draw',value:1}],['治疗','整理'],1,{exhaust:true,replayable:false}),
  },
  smith: {
    bell_edge: makeCard('钟沿刃',1,[{kind:'damage',value:5},{kind:'prepare',value:2}],['重击','预备']),
    echo_shield: makeCard('回声护盾',1,[{kind:'block',value:5},{kind:'self_echo',value:1}],['守御','回声'],1,{replayable:false}),
    measured_hour: makeCard('定时一刻',1,[{kind:'block',value:7},{kind:'prepare',value:1}],['守御','预备'],1,{replayable:false}),
    smith_patch: makeCard('匠人药布',1,[{kind:'heal',value:3},{kind:'prepare',value:1}],['治疗','预备'],1,{exhaust:true,replayable:false}),
  },
  medic: {
    triage_slash: makeCard('分诊剪击',1,[{kind:'damage',value:6},{kind:'mark',value:1}],['重击','追猎']),
    field_wrap: makeCard('野外包扎',1,[{kind:'heal',value:5}],['治疗'],1,{exhaust:true,replayable:false}),
    warding_vial: makeCard('止血药盾',1,[{kind:'block',value:5},{kind:'heal',value:2}],['治疗','守御'],1,{exhaust:true,replayable:false}),
    clean_cut: makeCard('清创切口',1,[{kind:'damage',value:4},{kind:'cleanse_player',value:2}],['净化','重击']),
  },
  tamer: {
    fox_bite: makeCard('灯狐咬击',1,[{kind:'pet_attack',value:6}],['召唤','重击'],1,{replayable:false}),
    call_and_cover: makeCard('唤狐护身',1,[{kind:'summon',value:4},{kind:'block',value:4}],['召唤','守御'],1,{replayable:false}),
    fox_mend: makeCard('狐伴疗伤',1,[{kind:'heal',value:3},{kind:'summon',value:2}],['治疗','召唤'],1,{exhaust:true,replayable:false}),
    pack_howl: makeCard('并肩突击',1,[{kind:'damage',value:4},{kind:'summon',value:2}],['召唤','重击'],1,{replayable:false}),
  },
  forger: {
    hot_iron: makeCard('热铁斩',1,[{kind:'weapon_attack',value:4}],['铸器','重击']),
    anvil_guard: makeCard('砧面护架',1,[{kind:'block',value:6},{kind:'forge',value:2}],['铸器','守御'],1,{replayable:false}),
    gear_patch: makeCard('皮围裙',1,[{kind:'heal',value:3},{kind:'forge',value:1}],['治疗','铸器'],1,{exhaust:true,replayable:false}),
    rivet_shot: makeCard('铆钉飞击',1,[{kind:'damage',value:5},{kind:'forge',value:1}],['铸器','重击'],1,{replayable:false}),
  },
};

const professionMeta = {
  traveler:['提灯旅人','以追猎标记、备势和抽牌适应街巷战局。','traveler_lantern',['预备','追猎','守御']],
  warden:['守门人','用坚固护盾和反击守住阵线，并以门槛重击还击。','warden_badge',['守御','反击','重击']],
  brewer:['烬火调酒师','将灼烧、护盾与净化调成持续压制的节奏。','brewer_flask',['灼烧','净化','守御']],
  messenger:['镜巷信使','通过保留、择弃和抽牌整理手牌，再挑选合适时机出手。','messenger_seal',['整理','守御','预备']],
  smith:['钟楼匠','用备势和回声安排连续攻防，稳稳控制节奏。','smith_rivet',['预备','回声','守御']],
  medic:['渡鸦医师','以有限治疗、净化与追猎维持战线。','medic_badge',['治疗','净化','追猎']],
  tamer:['驯兽师','召来灯狐共同作战，伙伴也能替你承受攻击。','tamer_whistle',['召唤','守御','重击']],
  forger:['铸器匠','累积锻值并强化武器攻击，在攻防间持续锻造。','forger_hammer',['铸器','重击','守御']],
};

export const PROFESSIONS = Object.fromEntries(Object.entries(professionMeta).map(([id,[name,description,starterRelic,tags]]) => [id, {
  name, description, starterDeck:['slash','pierce','guard','bandage',...Object.keys(professionCards[id])], starterRelic, tags,
}]));

export const ITEMS = {
  ...clone(CATALOG_V07.items),
  ember_flare_item:{name:'余烬信号弹',description:'施加2层灼烧，并留下1点追猎标记。',effects:[{kind:'burn',value:2},{kind:'mark',value:1}]},
};

export const CATALOG_V08 = clone(CATALOG_V07);
CATALOG_V08.version='0.8';
CATALOG_V08.professions=PROFESSIONS;
CATALOG_V08.items=ITEMS;
CATALOG_V08.cards={...CATALOG_V07.cards,...Object.assign({},...Object.values(professionCards))};
CATALOG_V08.relics={...CATALOG_V07.relics,cinder_scoop:{...CATALOG_V07.relics.cinder_scoop,trigger:'block_burn',description:'每轮首次用护盾挡住敌方攻击后，对敌人施加2层灼烧。'}};
// Wounds are only injected by difficulty rules into advanced-run starting decks.
CATALOG_V08.acts=CATALOG_V08.acts.map(act=>({...act,newCardRewards:act.newCardRewards.filter(id=>id!=='v07_wound')}));
for(const act of CATALOG_V08.acts) for(const id of Object.values(PROFESSIONS).flatMap(p=>p.starterDeck.slice(4))) if(!act.newCardRewards.includes(id)) act.newCardRewards.push(id);

const attack=(value,hits=1,label='攻击')=>({kind:'attack',value,...(hits>1?{hits}:{}),label:`${label}${hits>1?`：${value}×${hits}`:`${value}`}`});
const guard=(value,label='架盾')=>({kind:'guard',value,label:`${label}：护盾${value}`});
const burn=(value,label='扬灰')=>({kind:'burn',value,label:`${label}：玩家灼烧${value}`});
const cleanse=(value,label='净火')=>({kind:'cleanse',value,label:`${label}：移除敌方灼烧${value}`});
const heal=(value,label='调息')=>({kind:'heal',value,label:`${label}：恢复生命${value}`});
const thorns=(value,label='反震')=>({kind:'thorns',value,label:`${label}：本轮主动直伤反伤${value}`});
const charge=(value,hits=1,label='蓄力')=>({kind:'charge',value,hits,...(hits>1?{next:{kind:'attack',value,hits}}:{next:{kind:'attack',value}}),label:`${label}：下轮${value}${hits>1?`×${hits}`:''}`});
const conditional=(onAttack,onOther,label)=>({kind:'conditional',onAttack,onOther,label});
const phaseSets={
  cinder_knight:{phaseName:'余烬盛燃',phaseIntents:[guard(6,'火骑立盾'),charge(8,1,'抬刃蓄火'),attack(8,1,'余烬重击'),burn(2,'火星飞溅')]},
  dark_lantern:{phaseName:'黑灯仪式',phaseIntents:[charge(9,1,'黑灯蓄焰'),attack(9,1,'熄灯重击'),guard(8,'灯罩合拢'),burn(3,'黑焰飘散')]},
  a2_prism_warden:{phaseName:'棱镜折射',phaseIntents:[charge(5,2,'多面聚光'),attack(5,2,'棱光连斩'),guard(8,'镜面偏折'),conditional(attack(6,1,'正面刺击'),guard(6,'折面护盾'),'折光裁定：首张攻击則刺击，否则架盾')]},
  a2_mirror_regent:{phaseName:'双镜映身',phaseIntents:[charge(6,2,'双影蓄势'),attack(6,2,'双影裁击'),cleanse(3,'镜背涤火'),conditional(attack(8,1,'明面重斩'),guard(8,'暗面镜墙'),'镜面裁断：首张攻击则斩击，否则架盾')]},
  a3_iron_verger:{phaseName:'钟炉过载',phaseIntents:[guard(9,'钟炉护架'),charge(7,2,'双锤蓄势'),attack(7,2,'落钟双锤'),thorns(3,'铸钟倒钩')]},
  a3_unlit_bellmaster:{phaseName:'终班钟鸣',phaseIntents:[charge(6,3,'空钟蓄响'),attack(6,3,'终班三鸣'),guard(10,'钟壳闭合'),attack(12,1,'落锤终响')]},
  cracked_sergeant:{phaseName:'裂甲猛攻',phaseIntents:[guard(7,'巡官架盾'),charge(11,1,'裂斧蓄势'),attack(11,1,'破阵劈斩'),thorns(2,'甲片反刺')]},
  cinder_keeper:{phaseName:'余烬封锁',phaseIntents:[burn(3,'火钩扬灰'),charge(10,1,'门锤蓄热'),attack(10,1,'封门重锤'),guard(7,'余烬屏障')]},
  chain_duelist:{phaseName:'镜链连舞',phaseIntents:[attack(5,3,'镜链三旋'),guard(8,'回链护身'),conditional(attack(7,1,'锁链追刺'),attack(5,2,'双链横扫'),'读步：首张攻击则追刺，否则横扫'),thorns(2,'链刃倒钩')]},
  misaligned_clock:{phaseName:'错拍疾摆',phaseIntents:[charge(7,2,'错拍蓄势'),attack(7,2,'失准双摆'),heal(4,'校钟回正'),guard(8,'钟壳遮身')]},
  ferry_taxman:{phaseName:'加税反制',phaseIntents:[guard(10,'税盾加固'),attack(8,1,'催缴重杖'),thorns(3,'税钩反刺'),conditional(attack(7,2,'双杖催收'),guard(8,'税盾回缩'),'查账：首张攻击则双杖，否则架盾')]},
  shadow_hunter:{phaseName:'倒影追猎',phaseIntents:[conditional(attack(6,2,'双影追刺'),guard(8,'影幕护身'),'追迹：首张攻击则追刺，否则架盾'),attack(8,1,'影刃突袭'),burn(2,'暗影灼痕'),thorns(2,'影面反棘')]},
  dark_lady:{phaseName:'黑烛盛典',phaseIntents:[burn(3,'烛灰落下'),thorns(2,'烛剪倒刺'),charge(12,1,'黑烛蓄燃'),attack(12,1,'黑烛焚击'),guard(9,'灯罩盛幕')]},
  mirror_magistrate:{phaseName:'背镜宣判',phaseIntents:[attack(5,3,'背镜三斩'),guard(10,'镜墙封庭'),conditional(attack(10,1,'明镜重判'),attack(6,2,'背镜连裁'),'双面判词：首张攻击则重判，否则连裁'),cleanse(4,'镜背净火')]},
  bell_colossus:{phaseName:'巨钟震荡',phaseIntents:[charge(8,2,'钟腹蓄震'),attack(8,2,'巨锤连落'),thorns(4,'热钟反震'),attack(13,1,'钟锤终击'),guard(11,'钟壳闭合')]},
};
for(const [id,phase] of Object.entries(phaseSets)) if(CATALOG_V08.enemies[id]) Object.assign(CATALOG_V08.enemies[id],phase);

export const EVENTS=[...clone(EVENTS_V07),
  {eventId:'cinder_loan',title:'余烬借据',description:'领下12点余烬；借来的火会让接下来两场战斗中敌人攻击提高1点。',choices:['pact','leave'],pactLabel:'签下借据：获得12余烬',consequence:{kind:'debt',emberAmount:12,attackBonus:1,battles:2},consequenceText:'未来2场战斗中，敌人攻击+1。'},
  {eventId:'sealed_relic',title:'封印遗物',description:'以4点生命换取一件尚未拥有的遗物；封印会令之后营地基础治疗减少2点。',choices:['pact','leave'],pactLabel:'以4点生命换遗物',consequence:{kind:'sacrifice',hpCost:4,campPenalty:2},consequenceText:'之后营地基础治疗-2。'},
  {eventId:'boss_bargain',title:'Boss交易',description:'支付12点余烬，让本幕Boss生命降低15%。',choices:['pact','leave'],pactLabel:'支付12余烬削弱Boss',consequence:{kind:'boss_weaken',emberCost:12,bossHpMultiplier:0.85},consequenceText:'本幕Boss生命-15%。'},
];

export { DIFFICULTIES };
export function getCatalog(version){
  if(typeof version==='string'&&/(?:^|[^0-9])0\.8(?:$|[^0-9])/.test(version)) return CATALOG_V08;
  if(typeof version==='string'&&/(?:^|[^0-9])0\.7(?:$|[^0-9])/.test(version)) return CATALOG_V07;
  if(typeof version==='string'&&/(?:^|[^0-9])0\.6(?:$|[^0-9])/.test(version)) return CATALOG_V06;
  if(typeof version==='string'&&/(?:^|[^0-9])0\.4(?:$|[^0-9])/.test(version)) return CATALOG;
  return CATALOG;
}
