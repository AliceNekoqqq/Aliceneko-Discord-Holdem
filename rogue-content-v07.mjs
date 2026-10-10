import { CATALOG_V06 } from './rogue-content-v06.mjs';
import { CATALOG } from './rogue-catalog.mjs';
import { DIFFICULTIES } from './rogue-difficulty.mjs';

const clone = (value) => structuredClone(value);
const makeCard = (name, cost, effects, tags, rewardAct = 1, options = {}) => ({
  name, cost, selfCost: 0, exhaust: options.exhaust ?? false,
  replayable: options.replayable ?? !effects.some((e) => ['heal', 'sift', 'exhaust_other', 'retain', 'echo_next', 'self_echo', 'summon', 'forge'].includes(e.kind)),
  effects: clone(effects),
  upgrade: { cost, selfCost: 0, effects: clone(options.upgrade ?? effects.map((e) => ['damage','burn','block','heal','counter','pet_attack','weapon_attack'].includes(e.kind) ? { ...e, value: e.value + 2 } : { ...e })) },
  tags, rewardAct, description: options.description ?? `${name}：${effects.map((e) => `${e.value ?? ''}${({damage:'点伤害',block:'点护盾',burn:'层灼烧',heal:'点治疗',prepare:'点备势',mark:'点追猎',draw:'张抽牌',cleanse_player:'层净化'}[e.kind] ?? e.kind)}`).join('；')}。`,
});

const professionCards = {
  traveler: {
    trail_cut: makeCard('沿街斩',1,[{kind:'damage',value:7}],['追猎','重击']), trail_mark: makeCard('灯痕',1,[{kind:'mark',value:1},{kind:'damage',value:4}],['追猎','预备']), lantern_step: makeCard('灯下稳步',1,[{kind:'block',value:6},{kind:'prepare',value:1}],['守御','预备']), street_medicine: makeCard('街角药包',1,[{kind:'heal',value:3},{kind:'block',value:3}],['治疗','守御'],1,{exhaust:true,replayable:false}),
  },
  warden: {
    gate_smash: makeCard('门槛重击',1,[{kind:'damage',value:6},{kind:'block',value:3}],['重击','守御']), counter_bar: makeCard('横闩迎击',1,[{kind:'block',value:6},{kind:'counter',value:2}],['守御','反击'],1,{replayable:false}), iron_wall: makeCard('铁门闭合',1,[{kind:'block',value:9}],['守御']), patch_plate: makeCard('补甲布',1,[{kind:'heal',value:3},{kind:'block',value:3}],['治疗','守御'],1,{exhaust:true,replayable:false}),
  },
  brewer: {
    flame_pour: makeCard('倾火',1,[{kind:'damage',value:4},{kind:'burn',value:3}],['灼烧','重击']), coal_foam: makeCard('炭泡护杯',1,[{kind:'block',value:5},{kind:'burn',value:2}],['守御','灼烧']), bitter_draught: makeCard('苦酿',1,[{kind:'heal',value:4},{kind:'burn',value:1}],['治疗','灼烧'],1,{exhaust:true,replayable:false}), cask_guard: makeCard('酒桶掩护',1,[{kind:'block',value:7}],['守御']),
  },
  messenger: {
    dispatch_strike: makeCard('急件投掷',1,[{kind:'damage',value:6}],['重击','预备']), paper_screen: makeCard('纸墙',1,[{kind:'block',value:5},{kind:'retain',value:1}],['守御','预备'],1,{replayable:false}), sift_and_cut: makeCard('拆封斜切',1,[{kind:'damage',value:4},{kind:'sift',value:1}],['重击','筛牌'],1,{replayable:false}), message_bandage: makeCard('急递药贴',1,[{kind:'heal',value:3},{kind:'block',value:3}],['治疗','守御'],1,{exhaust:true,replayable:false}),
  },
  smith: {
    bell_edge: makeCard('钟沿刃',1,[{kind:'damage',value:6},{kind:'prepare',value:1}],['重击','预备']), echo_shield: makeCard('回声护盾',1,[{kind:'block',value:5},{kind:'self_echo',value:1}],['守御','回声'],1,{replayable:false}), measured_hour: makeCard('定时一刻',1,[{kind:'block',value:7}],['守御','预备']), smith_patch: makeCard('匠人药布',1,[{kind:'heal',value:3},{kind:'block',value:3}],['治疗','守御'],1,{exhaust:true,replayable:false}),
  },
  medic: {
    triage_slash: makeCard('分诊剪击',1,[{kind:'damage',value:6},{kind:'mark',value:1}],['重击','追猎']), field_wrap: makeCard('野外包扎',1,[{kind:'heal',value:5}],['治疗'],1,{exhaust:true,replayable:false}), warding_vial: makeCard('止血药盾',1,[{kind:'block',value:5},{kind:'heal',value:2}],['治疗','守御'],1,{exhaust:true,replayable:false}), clean_cut: makeCard('清创切口',1,[{kind:'damage',value:4},{kind:'cleanse_player',value:2}],['净化','重击']),
  },
  tamer: {
    fox_bite: makeCard('灯狐咬击',1,[{kind:'pet_attack',value:6}],['召唤','重击'],1,{replayable:false}), call_and_cover: makeCard('唤狐护身',1,[{kind:'summon',value:4},{kind:'block',value:4}],['召唤','守御'],1,{replayable:false}), fox_mend: makeCard('狐伴疗伤',1,[{kind:'heal',value:3},{kind:'block',value:3}],['治疗','守御'],1,{exhaust:true,replayable:false}), pack_howl: makeCard('并肩突击',1,[{kind:'damage',value:4},{kind:'summon',value:2}],['召唤','重击'],1,{replayable:false}),
  },
  forger: {
    hot_iron: makeCard('热铁斩',1,[{kind:'weapon_attack',value:4}],['铸器','重击']), anvil_guard: makeCard('砧面护架',1,[{kind:'block',value:6},{kind:'forge',value:2}],['铸器','守御'],1,{replayable:false}), gear_patch: makeCard('皮围裙',1,[{kind:'heal',value:3},{kind:'block',value:3}],['治疗','守御'],1,{exhaust:true,replayable:false}), rivet_shot: makeCard('铆钉飞击',1,[{kind:'damage',value:5},{kind:'forge',value:1}],['铸器','重击'],1,{replayable:false}),
  },
};

const PROFESSION_META = {
  traveler:['提灯旅人','照路标记、稳步防守与有限恢复。','traveler_lantern',['预备','追猎','守御']],
  warden:['守门人','以护盾与反击稳住每轮攻势。','warden_badge',['守御','反击','重击']],
  brewer:['烬火调酒师','用灼烧和护盾压制对手。','brewer_flask',['灼烧','调制','守御']],
  messenger:['镜巷信使','安排手牌时机并持续施压。','messenger_seal',['预备','筛牌','重击']],
  smith:['钟楼匠','用预备与回声控制战斗节奏。','smith_rivet',['预备','回声','守御']],
  medic:['渡鸦医师','以净化、治疗和追猎维持优势。','medic_badge',['治疗','净化','追猎']],
  tamer:['驯兽师','召来灯狐并用主动牌命令伙伴攻击。','tamer_whistle',['召唤','守御','重击']],
  forger:['铸器匠','积累锻值后以武器兑现伤害。','forger_hammer',['铸器','重击','守御']],
};
export const PROFESSIONS = Object.fromEntries(Object.entries(PROFESSION_META).map(([id,[name,description,starterRelic,tags]]) => [id, {
  name, description, starterDeck:['slash','pierce','guard','bandage',...Object.keys(professionCards[id])], starterRelic, tags,
}]));

const newRelics = {
  route_compass:{name:'旧街罗盘',trigger:'camp_heal',value:2,description:'营地治疗额外恢复2点生命。'},
  mirror_thread:{name:'镜缝丝线',trigger:'first_block_per_turn',value:2,description:'每轮首次主动打出护盾牌时额外获得2点护盾。'},
  cinder_scoop:{name:'余烬小铲',trigger:'burn_block',value:2,limit:'turn',description:'每轮首次以护盾挡住攻击后，对敌人施加2层灼烧。'},
  echo_pin:{name:'回声别针',trigger:'echo_block',value:3,limit:'battle',description:'每战首次回声重放后获得3点护盾。'},
  fox_bell:{name:'狐铃',trigger:'start_pet',value:3,description:'每场战斗开始时召来灯狐，伙伴生命3。'},
  forge_token:{name:'锻坊代币',trigger:'weapon_bonus',value:2,limit:'battle',description:'每战首次主动武器攻击额外造成2点伤害。'},
};

export const ITEMS = {
  field_dressing_item:{name:'止血布',description:'恢复4点生命。',effects:[{kind:'heal',value:4}]},
  mirror_shard_item:{name:'碎镜针',description:'造成5点无视护甲的直接伤害，仍受敌盾阻挡。',effects:[{kind:'damage',value:5,ignoreArmor:true}]},
  cold_ash_item:{name:'冷灰包',description:'施加3层灼烧。',effects:[{kind:'burn',value:3}]},
  folding_shield_item:{name:'折叠盾',description:'获得6点临时护盾。',effects:[{kind:'block',value:6}]},
  honing_oil_item:{name:'磨刀油',description:'本轮下一次主动攻击首个直伤包增加3点。',effects:[{kind:'attack_bonus',value:3}]},
  quench_salt_item:{name:'退火盐',description:'移除玩家至多3层灼烧。',effects:[{kind:'cleanse_player',value:3}]},
  bright_tea_item:{name:'明灯茶',description:'立即抽2张牌。',effects:[{kind:'draw',value:2}]},
  ash_linen_item:{name:'灰麻绷带',description:'移除玩家至多4层灼烧，并获得3点护盾。',effects:[{kind:'cleanse_player',value:4},{kind:'block',value:3}]},
  ember_flare_item:{name:'余烬信号弹',description:'施加4层灼烧。',effects:[{kind:'burn',value:4}]},
  iron_candy_item:{name:'铁糖',description:'恢复3点生命并获得4点护盾。',effects:[{kind:'heal',value:3},{kind:'block',value:4}]},
};

export const CATALOG_V07 = clone(CATALOG_V06);
CATALOG_V07.version='0.7';
CATALOG_V07.player={...CATALOG_V06.player,maxHp:30,energy:3,draw:5,playLimit:3,turnLimit:12};
CATALOG_V07.professions=PROFESSIONS;
CATALOG_V07.items=ITEMS;
CATALOG_V07.cards={...CATALOG_V06.cards,...Object.assign({},...Object.values(professionCards))};
CATALOG_V07.cards.v07_wound={name:'旧伤',cost:1,selfCost:0,exhaust:true,replayable:false,effects:[{kind:'block',value:0}],upgrade:{cost:1,selfCost:0,effects:[{kind:'block',value:0}]},tags:['诅咒'],rewardAct:3,description:'旧伤：消耗本牌，不获得护盾。'};
CATALOG_V07.cards.lantern_signal=makeCard('灯号传讯',1,[{kind:'block',value:3},{kind:'draw',value:1}],['守御','筛牌'],2,{description:'获得3点临时护盾，并抽1张牌。'});
CATALOG_V07.relics={...CATALOG_V06.relics,...newRelics};
const starterRelics=new Set(Object.values(PROFESSIONS).map(p=>p.starterRelic));
CATALOG_V07.eliteRelics=[...new Set([...CATALOG_V07.eliteRelics,...Object.keys(CATALOG_V06.relics).filter(id=>!starterRelics.has(id)),...Object.keys(newRelics)])];
CATALOG_V07.acts=CATALOG_V07.acts.map((act)=>({...act,
  chapterRelics:[...new Set([...act.chapterRelics,...Object.keys(newRelics)])],
  normalPool:[...new Set([...act.normalPool,...(act.index===1?['empty_bottle','patrol_apprentice','debt_collector']:act.index===2?['mirror_spore','mirror_dancer','rivet_carrier']:['ember_feeder','bell_hound','rusted_scribe'])])],
  elitePool:[...new Set([...act.elitePool,...(act.index===1?['cracked_sergeant','cinder_keeper']:act.index===2?['chain_duelist','ferry_taxman']:['misaligned_clock','shadow_hunter'])])],
  bossPool:[...new Set([...act.bossPool,...(act.index===1?['dark_lady']:act.index===2?['mirror_magistrate']:['bell_colossus'])])],
  newCardRewards:[...new Set([...act.newCardRewards,...Object.keys(CATALOG_V07.cards).filter(id=>!Object.hasOwn(CATALOG_V06.cards,id)).filter(id=>CATALOG_V07.cards[id].rewardAct<=act.index)])],
}));
// Keep each profession's four unique starters rewardable from the first act.
for(const id of Object.values(PROFESSIONS).flatMap(p=>p.starterDeck.slice(4))) CATALOG_V07.acts[0].newCardRewards.push(id);
CATALOG_V07.acts[1].newCardRewards.push('lantern_signal');
for(const id of [...new Set(CATALOG_V07.acts.flatMap(act=>act.bossPool))]){
  const enemy=CATALOG_V07.enemies[id];
  if(enemy) enemy.phaseIntents=[{kind:'attack',value:8,label:'转入盛相：强攻8'},{kind:'guard',value:7,label:'盛相护幕'},{kind:'attack',value:10,label:'盛相重击'}];
}
for(const id of [...new Set(CATALOG_V07.acts.flatMap(act=>act.elitePool))]){
  const enemy=CATALOG_V07.enemies[id];
  if(enemy) enemy.phaseIntents=[{kind:'attack',value:8,label:'精英狂袭8'},{kind:'guard',value:6,label:'精英架势'}];
}

export { DIFFICULTIES };

export const EVENTS=[
 {eventId:'repair',title:'修灯铺',description:'花余烬修补生命或添一张牌。',choices:['heal','card','leave'],healCost:12,healAmount:6,cardCost:10},
 {eventId:'borrow_fire',title:'借火人',description:'付出2点生命，换一张牌。',choices:['trade','leave'],lifeCost:2},
 {eventId:'lost_property',title:'失物摊',description:'免费领回一张牌，或花余烬取一件道具。',choices:['card','item','leave'],cardCost:0,itemCost:6},
 {eventId:'apothecary',title:'夜行药铺',description:'便宜治疗，或准备一件战斗道具。',choices:['heal','item','leave'],healCost:6,healAmount:5,itemCost:5},
 {eventId:'street_scribe',title:'街头抄手',description:'花余烬升级一张牌，或离开。',choices:['upgrade','leave'],upgradeCost:8},
 {eventId:'paper_mill',title:'旧纸回收处',description:'付费移除一张牌。',choices:['remove','leave'],removeCost:9},
 {eventId:'coal_donation',title:'煤炉余款',description:'领取一小袋余烬。',choices:['gain','leave'],emberAmount:7},
 {eventId:'night_clinic',title:'夜诊棚',description:'花余烬恢复生命。',choices:['heal','leave'],healCost:8,healAmount:8},
 {eventId:'parcel_exchange',title:'邮包错投',description:'从几件道具中选一件。',choices:['item','leave'],itemCost:4},
 {eventId:'bell_maker',title:'修钟摊',description:'花余烬升级一张牌。',choices:['upgrade','leave'],upgradeCost:10},
 {eventId:'ash_market',title:'灰烬集',description:'花余烬获得一张牌。',choices:['card','leave'],cardCost:8},
 {eventId:'quiet_shelter',title:'静灯小屋',description:'免费恢复少量生命，或离开。',choices:['heal','leave'],healCost:0,healAmount:4},
];

export function getCatalog(version){
  return typeof version==='string'&&/(?:^|[^0-9])0\.7(?:$|[^0-9])/.test(version)?CATALOG_V07:
    typeof version==='string'&&/(?:^|[^0-9])0\.6(?:$|[^0-9])/.test(version)?CATALOG_V06:CATALOG;
}
