import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSeatStage} from './web/auction/assets/seat-stage.mjs';
import {buildOpponentReaction} from './web/auction/assets/opponent-stage.mjs';
const stage=(history,extra={})=>buildSeatStage({history,round:history.length+1,status:'active',priority:[0,1,2,3],...extra});
const row=(round,bids)=>({round,bids,done:false});

test('opponent reactions report only published bid movements, including entry, passing and tied priority',()=>{
 const first=row(1,[400,100,200,300]);
 for(const [bid,kind,label,delta]of [[150,'raise','加价跟进',50],[50,'lower','收紧报价',-50],[100,'hold','守住报价',0],[0,'pass','本轮过牌',null],[400,'tied','同价暂后',null]]){
  const history=[first,row(2,[400,bid,200,300])],r=buildOpponentReaction({stage:stage(history),history,index:1});
  assert.equal(r.kind,kind);assert.equal(r.label,label);assert.equal(r.delta,delta);assert.equal(r.round,2);
 }
 const history=[row(1,[400,0,200,300]),row(2,[400,100,200,300])];
 assert.equal(buildOpponentReaction({stage:stage(history),history,index:1}).label,'重新跟进');
 assert.equal(buildOpponentReaction({stage:stage([first]),history:[first],index:1}).label,'首次出价');
});

test('sealed amounts, estimates and unrevealed future rounds cannot affect an opponent reaction',()=>{
 const history=[row(1,[500,100,300,0]),row(2,[500,200,300,0])],s=stage(history),input={stage:s,history,index:1};
 for(const key of ['currentBids','estimate','hiddenItems','privateInfo'])Object.defineProperty(input,key,{get(){throw Error('private field read');}});
 const before=JSON.stringify(history),expected=buildOpponentReaction(input);
 const future={round:3};Object.defineProperty(future,'bids',{get(){throw Error('future bid read');}});
 assert.deepEqual(buildOpponentReaction({...input,history:[...history,future]}),expected);
 assert.equal(JSON.stringify(history),before);
 assert.deepEqual(buildOpponentReaction({stage:stage([]),index:1,currentBids:[1,999999,3,4]}),{kind:'sealed',label:'等待开牌',delta:null});
});

test('hammer reactions use the result without claiming profit or reading unopened goods',()=>{
 const history=[{...row(3,[400,800,100,0]),done:true}],s=stage(history,{status:'settled',result:{winner:1,price:800}});
 assert.equal(buildOpponentReaction({stage:s,history,index:1}).label,'竞拍成功');
 assert.equal(buildOpponentReaction({stage:s,history,index:2}).label,'本仓未拍中');
 const pass=stage([row(5,[0,0,0,0])],{status:'settled',result:{winner:null,price:0}});
 assert.equal(buildOpponentReaction({stage:pass,index:1}).label,'本仓流拍');
 const legacy=stage([],{status:'settled',result:{winner:1,price:800}});
 assert.equal(buildOpponentReaction({stage:legacy,index:1}).label,'竞拍成功');
 assert(!JSON.stringify(buildOpponentReaction({stage:s,history,index:1})).includes('profit'));
});
