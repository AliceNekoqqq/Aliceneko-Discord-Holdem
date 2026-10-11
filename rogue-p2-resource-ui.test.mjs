import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { renderRogue, renderRogueUidPage, renderRogueConfirmation } from './rogue-ui.mjs';
import { getCatalog } from './rogue-content-v12.mjs';

const base = (patch = {}) => ({ ruleVersion:'lantern-rules-v0.12', catalogVersion:'0.12', runId:'p2-resource', version:3, phase:'ROOM', act:1, slot:2, hp:18, maxHp:30, embers:12, deck:CATALOG.starterDeck.map((cardId,uid)=>({uid,cardId,upgraded:false})), relics:[], ...patch });
const components = message => message.data.components.flatMap(row=>row.components);

test('shop shows real card effects, fit rationale, ownership, remaining balance and item replacement effects', () => {
  const run=base({inventory:['ember_flare_item','cold_ash_item'],room:{type:'shop',stock:['cinder_cut'],stockRoles:{cinder_cut:'构筑补强'},itemStock:['ember_flare_item'],services:{upgrade:false,remove:false},prices:{cardByEnergy:{1:10,2:14},upgrade:12,remove:8,item:8}}});
  const panel=renderRogue(run),embed=panel.data.embeds[0],item=components(panel).find(c=>c.custom_id.endsWith(':shop-item'));
  assert.match(embed.fields[0].value,/构筑补强/); assert.match(embed.fields[0].value,/伤害5、灼烧2/); assert.match(embed.fields[0].value,/构筑适配：/); assert.match(embed.fields[0].value,/同名持有：0张；付款后2余烬/);
  assert.match(item.options[0].description,/替换余烬信号弹/); assert.match(item.options[0].description,/付款后4余烬/);
  const poor=renderRogue(base({embers:4,inventory:['ember_flare_item','cold_ash_item'],room:{type:'shop',stock:['cinder_cut'],itemStock:['ember_flare_item'],services:{},prices:{cardByEnergy:{1:10,2:14},item:8}}}));
  assert.match(poor.data.embeds[0].fields[0].value,/余额4余烬，不足6余烬/);
  assert.match(components(poor).find(c=>c.custom_id.endsWith(':shop-item')).options[0].description,/余额4余烬，不足4余烬/);
  assert.ok(embed.fields[0].value.length<=1024); assert.ok(panel.data.components.length<=5);
});

test('shop service entities retain UID and show price, balance, used state and minimum-deck restriction',()=>{
  const deck=CATALOG.starterDeck.slice(0,4).map((cardId,uid)=>({uid,cardId,upgraded:false}));
  const run=base({deck,room:{type:'shop',stock:[],services:{upgrade:true,remove:false},prices:{upgrade:12,remove:8}}});
  const shop=renderRogue(run),buttons=components(shop); assert.match(shop.data.embeds[0].description,/升级服务已用/); assert.equal(buttons.find(c=>c.label.startsWith('移除牌')).disabled,true);
  const page=renderRogueUidPage(run,'shop','upgrade',0);
  assert.match(page.data.components[0].components[0].options[0].description,/升级12余烬 · 付款后0余烬/);
  assert.match(page.data.components[0].components[0].options[0].label,/#[0-9]+/);
  const poorPage=renderRogueUidPage({...run,embers:4},'shop','upgrade',0);
  assert.match(poorPage.data.components[0].components[0].options[0].description,/不足8余烬/);
});

test('camp and pact explain the continuing effect and actual post-payment resource',()=>{
  const camp=renderRogue(base({story:{debtBattles:2,campPenalty:2,weakenedBossActs:[],history:[]},room:{type:'camp',healAmount:5}}));
  assert.match(camp.data.embeds[0].description,/基础治疗减少2点/); assert.match(camp.data.embeds[0].description,/未来2场战斗每段敌方攻击伤害\+1/);
  const pact=renderRogue(base({embers:3,room:{type:'event',eventId:'cinder_loan',title:'余烬借据',description:'借取余烬',choices:['pact','leave'],pactLabel:'签约',consequence:{kind:'debt',emberAmount:12,battles:2},consequenceText:'未来两场敌方攻击+1'}}));
  assert.match(pact.data.embeds[0].description,/支付后余烬：15/); assert.doesNotMatch(pact.data.embeds[0].description,/契约会提升后续战斗强度/);
});

test('battle distinguishes current debt effect from remaining future affected fights',()=>{
  const run=base({phase:'BATTLE',story:{debtBattles:1,campPenalty:0,weakenedBossActs:[],history:[]},room:{type:'battle',storyEffect:'借火债：本战每段攻击+1'},battle:{enemy:{name:'测试敌人'},enemyHp:10,hp:18,maxHp:30,turn:1,energy:2,plays:0,hand:[],draw:[],enemyIntent:{kind:'attack',value:2,hits:2}}});
  const description=renderRogue(run).data.embeds[0].description;
  assert.match(description,/本战影响：借火债：本战每段敌方攻击伤害\+1/); assert.match(description,/未来1场战斗每段敌方攻击伤害\+1/);
});

test('v0.12 UI selects its catalog-owned contract wording and accurate confirmation scope',()=>{
  const catalog=getCatalog('0.12'),event=catalog.events.find(e=>e.eventId==='cinder_loan');
  assert.match(event.description,/每段敌方攻击伤害\+1/); assert.match(event.consequenceText,/第二场结束后偿清/);
  const run=base({embers:3,room:{type:'event',...structuredClone(event)}});
  const rendered=renderRogue(run).data.embeds[0].description;
  assert.match(rendered,/第二场结束后偿清/);
  const confirmation=renderRogueConfirmation(run,{type:'event-pact'}).data.embeds[0].description;
  assert.match(confirmation,/支付后余烬15/); assert.match(confirmation,/未来2场战斗/); assert.doesNotMatch(confirmation,/提升后续战斗强度/);
});
