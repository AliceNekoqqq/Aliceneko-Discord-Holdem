// A browser-only teaching fixture. No account, wallet, request or live game reference.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x??0).toLocaleString('zh-CN');
const names=['你','阿吉','老猫','掌柜'];
const factors=[[.54,.51,.50],[.60,.58,.57],[.64,.62,.60],[.68,.66,.64],[.70,.68,.65]];
export function tutorialOutcome(round,bids,budget) {
  if(!Number.isInteger(round)||round<1||round>5||bids.length!==4||bids.some(x=>!Number.isSafeInteger(x)||x<0||x>budget))throw Error('无效教学报价');
  const order=[0,1,2,3].sort((a,b)=>bids[b]-bids[a]||a-b);
  const done=round===5||bids[order[0]]>0&&bids[order[0]]*10>bids[order[1]]*[20,16,13,11][round-1];
  return {done,winner:done&&bids[order[0]]>0?order[0]:null,price:done?bids[order[0]]:0};
}
export function createAuctionTutorial(meta) {
  const used=new Set(),items=[0,1,2,3,4,1].map(q=>{
    const x=meta.items.find(x=>x.quality===q&&x.width<=2&&x.height<=2&&!used.has(x.id));
    if(!x)throw Error('教学藏品暂未备齐，请稍后重试。');used.add(x.id);
    return {id:x.id,name:x.name,quality:x.quality,category:x.category,width:x.width,height:x.height,
      value:Math.max(1,Math.floor(x.value*(meta.tiers.small.scale??.25)/(meta.tiers.standard.scale??1)))};
  });
  const total=items.reduce((n,x)=>n+x.value,0),budget=meta.tiers.small.budget,fee=meta.tiers.small.fee,opening=Math.max(20_000_000,budget+fee);
  let s;
  const reset=()=>s={phase:'intro',round:1,area:false,role:false,cash:opening,held:0,history:[],result:null,count:0,sold:[],selection:null,displayed:null,feedback:''};
  reset();
  function view() {
    const afterEntry=!['intro','setup'].includes(s.phase),privateKnown=afterEntry&&s.phase!=='public',fullyOpen=s.count===items.length;
    const clues=[{round:1,text:'全仓最高品质：金'}];
    if(s.round>=2)clues.push({round:2,text:`第1件品质：${meta.qualities[items[0].quality]}`});
    if(s.round>=3)clues.push({round:3,text:`第1件轮廓：${items[0].width}×${items[0].height}，占${items[0].width*items[0].height}格`});
    if(s.round>=4)clues.push({round:4,text:`第6件类别：${items[5].category}`});
    if(s.round>=5)clues.push({round:5,text:`第6件品质：${meta.qualities[items[5].quality]}，轮廓${items[5].width}×${items[5].height}`});
    return {...s,history:s.history.map(h=>({...h,bids:[...h.bids]})),sold:[...s.sold],result:s.result?{...s.result}:null,
      budget,fee,opening,publicClues:clues,recommended:Math.min(budget,Math.floor(total*[.55,.61,.65,.69,.73][s.round-1])),
      estimate:Math.floor(total*[.82,.9,.96,1.02,1][s.round-1]),total:fullyOpen?total:null,
      net:fullyOpen&&s.result?.winner===0?total-s.result.price-fee:null,
      items:items.map((x,i)=>i<s.count?{...x,index:i,revealed:true,sold:s.sold.includes(i),displayed:s.displayed===i}:{index:i,revealed:false,
        quality:privateKnown&&(s.round>=2||i<5)||s.round>=2&&i===0?x.quality:null,
        width:i===0&&s.round>=3||i===5&&s.round>=5?x.width:null,height:i===0&&s.round>=3||i===5&&s.round>=5?x.height:null}),
    };
  }
  function act(action,value) {
    s.feedback='';const reject=text=>(s.feedback=text,false);
    if(action==='restart'){reset();return true;}
    if(action==='begin'&&s.phase==='intro'){s.phase='setup';return true;}
    if(action==='area'&&s.phase==='setup'){s.area=true;return true;}
    if(action==='role'&&s.phase==='setup'){s.role=true;return true;}
    if(action==='enter'&&s.phase==='setup'){
      if(!s.area||!s.role)return reject('先选择小额区和索菲，再进入教学仓。');
      s.cash-=budget+fee;s.held=budget;s.phase='public';return true;
    }
    if(action==='read-public'&&s.phase==='public'){s.phase='private';return true;}
    if(action==='read-private'&&s.phase==='private'){s.phase='bid';return true;}
    if(action==='bid'&&s.phase==='bid'){
      if(typeof value!=='string'||!value.trim())return reject('先填写报价；不出价可填 0。');
      const bid=Number(value);if(!Number.isSafeInteger(bid)||bid<0||bid>budget)return reject(`报价要是0到${num(budget)}之间的整数。`);
      const bids=[bid,...factors[s.round-1].map(f=>Math.min(budget,Math.floor(total*f)))],outcome=tutorialOutcome(s.round,bids,budget);
      s.history.push({round:s.round,bids,...outcome});
      if(outcome.done){s.result=outcome;s.cash+=budget-(outcome.winner===0?outcome.price:0);s.held=0;}
      s.phase='review';return true;
    }
    if(action==='next-round'&&s.phase==='review'&&!s.result){s.round++;s.phase='bid';return true;}
    if(action==='settlement'&&s.phase==='review'&&s.result){s.phase='settlement';return true;}
    if(action==='open'&&s.phase==='settlement'&&s.result?.winner===0){s.phase='reveal';return true;}
    if(action==='reveal'&&s.phase==='reveal'&&s.count<items.length){s.count++;return true;}
    if(action==='finish-reveal'&&s.phase==='reveal'&&s.count===items.length){s.phase='accounts';return true;}
    if(action==='quiz-cash'&&s.phase==='accounts')return reject('藏品还在仓库里。只有手动卖出后，才会增加现金。');
    if(action==='quiz-inventory'&&s.phase==='accounts'){s.phase='inventory';return true;}
    const index=Number(value),valid=value!==null&&/^[0-5]$/.test(String(value))&&Number.isInteger(index)&&index>=0&&index<items.length&&!s.sold.includes(index);
    if(action==='select-sale'&&s.phase==='inventory'&&valid){s.selection=index;return true;}
    if(action==='quote-sale'&&s.phase==='inventory'){
      if(s.selection===null)return reject('先选择一件已开仓藏品。');
      if(s.sold.length>=items.length-1)return reject('留一件藏品，继续练习展示柜。');s.phase='sell-confirm';return true;
    }
    if(action==='cancel-sale'&&s.phase==='sell-confirm'){s.phase='inventory';return true;}
    if(action==='confirm-sale'&&s.phase==='sell-confirm'&&s.selection!==null&&!s.sold.includes(s.selection)){
      s.cash+=items[s.selection].value;s.sold.push(s.selection);s.selection=null;s.phase='inventory';s.feedback='练习出售成功，现金已增加；其他藏品仍在练习仓库。';return true;
    }
    if(action==='to-display'&&s.phase==='inventory'&&s.sold.length){s.selection=null;s.phase='display';return true;}
    if(action==='select-display'&&s.phase==='display'&&valid){s.selection=index;return true;}
    if(action==='place'&&s.phase==='display'&&s.selection!==null&&!s.sold.includes(s.selection)){s.displayed=s.selection;s.phase='done';return true;}
    return reject('请先完成当前提示的操作。');
  }
  return {get view(){return view();},act};
}
const button=(action,text,disabled=false)=>`<button class="button primary" data-tutorial="${action}"${disabled?' disabled':''}>${text}</button>`;
const art=x=>`/art/auction/${encodeURIComponent(x.id)}-v5.png`;
function board(v,qualities) {
  return `<div class="tutorial-board" aria-label="教学小仓格板，8列4行">${v.items.map((x,i)=>{
    const w=x.width??1,h=x.height??1;
    return `<div class="board-item tutorial-cell-${i} tutorial-w${w} tutorial-h${h} ${x.quality===null?'':`q${x.quality}`} ${x.revealed?'':'unknown'}" aria-label="第${i+1}件，${x.revealed?esc(x.name):x.quality===null?'品质未知':esc(qualities[x.quality])+'品质'}">${x.revealed?`<img src="${art(x)}" alt="${esc(x.name)}">`:'?'}<span>${i+1}</span></div>`;
  }).join('')}</div>`;
}
function stock(v,action,qualities) {
  return `<div class="tutorial-stock">${v.items.map(x=>`<button class="tutorial-good q${x.quality}${v.selection===x.index?' selected':''}" data-tutorial="${action}" data-index="${x.index}" aria-pressed="${v.selection===x.index}"${x.sold?' disabled':''}><img src="${art(x)}" alt=""><strong>${esc(x.name)}</strong><span>${esc(qualities[x.quality])}品质 · ${num(x.value)}币</span><small>${x.sold?'已出售':v.selection===x.index?'已选择':'点选这件'}</small></button>`).join('')}</div>`;
}
export function tutorialView(v,meta) {
  const phase=v.phase,q=meta.qualities,stage=['intro','setup'].includes(phase)?0:['public','private'].includes(phase)?1:['bid','review','settlement'].includes(phase)?2:['reveal','accounts'].includes(phase)?3:['inventory','sell-confirm','display'].includes(phase)?4:5;
  let title='',copy='',content='';
  if(phase==='intro'){
    title='先跟着玩完一仓。';copy='从看懂线索，到亲自出价，再把喜欢的藏品摆进柜里。';
    content=`<div class="tutorial-roadmap"><span>01 选区域和人物</span><span>02 看公共与私人情报</span><span>03 封牌，比较报价</span><span>04 开仓，核对盈亏</span><span>05 出售与陈列</span></div><p>这是一局固定样本的教学练习，不需要登录，不消耗正式钱包，也不会给正式仓库发藏品。按教学报价会走满五轮；正式局也可能提前成交、流拍或亏损。</p><p class="mini-note">进入教程不会暂停正在进行的正式竞拍。离开教程后可以回来继续，刷新页面会重新开始。</p>${button('begin','开始新手教学 →')}`;
  } else if(phase==='setup'){
    title='先选一个价位，再选信息能力。';copy='这次用小额区和索菲练手。预算是出价上限，入场费另计。';
    content=`<div class="tutorial-choices"><button data-tutorial="area" aria-pressed="${v.area}"><strong>小额区</strong><span>预算 ${num(v.budget)}币</span><small>入场费 ${num(v.fee)}币</small>${v.area?'✓ 已选择':'点这里选择'}</button><button data-tutorial="role" aria-pressed="${v.role}"><strong>索菲 · 广看品质</strong><span>${esc(meta.roles.sophie.skill)}</span>${v.role?'✓ 已选择':'点这里选择'}</button></div><p>主题：生活日用仓。日用 / 服饰 / 户外 / 玩具的同品质权重较高，其他类别仍可能出现；本次六件为固定教材，不代表掉率。</p><p>练习现金 ${num(v.opening)}币。入场暂存预算与入场费，共${num(v.budget+v.fee)}币；没花掉的预算结算时退回。</p>${button('enter','暂存练习预算并入场 →',!v.area||!v.role)}`;
  } else if(phase==='public'||phase==='private'){
    title=phase==='public'?'先看全桌共享的情报。':'再看只属于你的技能线索。';
    copy=phase==='public'?'最高品质是金，不等于每件都是金，也不等于这仓一定赚。每轮都会追加公共情报。':'索菲首轮辨认五件品质；剩下的会逐轮补齐。知道品质后仍不知道具体物件和价格，轮廓也要结合公共线索看。';
    content=`${board(v,q)}<div class="tutorial-clues ${phase}">${phase==='public'?'<h3>全桌公共情报</h3><p>第1轮 · 本仓最高品质：金</p>':`<h3>你的索菲线索</h3><p>第1～5件：${v.items.slice(0,5).map(x=>esc(q[x.quality])).join(' / ')}；第6件暂未知。</p><p>白 → 绿 → 蓝 → 紫 → 金 → 红；品质、尺寸和类别都能影响候选价值。</p>`}</div>${phase==='public'?button('read-public','看懂了，看看我的技能线索 →'):button('read-private','开始第1轮报价 →')}`;
  } else if(phase==='bid'){
    title=`第${v.round}轮：看完线索，封一张暗标。`;copy=v.round===1?'输入的是这一仓的总报价，不是加价金额。你提交前，看不到对手的本轮暗标。':`第${v.round}轮新情报已追加。每轮报价独立，上一轮未成交的报价不会逐轮累加扣钱。`;
    content=`<div class="tutorial-match"><div>${board(v,q)}<div class="tutorial-clues"><h3>全桌公共情报</h3>${v.publicClues.map(c=>`<p${c.round===v.round?' class="tutorial-new"':''}>第${c.round}轮 · ${esc(c.text)}</p>`).join('')}<p>私人品质线索已叠加到格板；同价优先顺序：你 → 阿吉 → 老猫 → 掌柜。</p></div></div><form id="tutorial-bid-form" class="tutorial-bid"><h3>第${v.round} / 5轮 · 索菲</h3><p>教学参考估值（预设）</p><strong>${num(v.estimate)}币</strong><p>估值不是保证收益，正式局要留出入场费和误差空间。</p><label for="tutorial-bid">本轮总报价（整数）</label><input id="tutorial-bid" type="number" inputmode="numeric" min="0" max="${v.budget}" step="1" required placeholder="先点下方教学报价，或自己填写"><button type="button" class="button outline" data-tutorial="fill-bid">填入教学报价 ${num(v.recommended)}</button><button class="button primary" type="submit">封牌，公开本轮报价 →</button><small>范围0～${num(v.budget)}币；0表示本轮不出价。教学对手是固定样本，正式局不能预知报价。</small></form></div>`;
  } else if(phase==='review'){
    const last=v.history.at(-1),rank=last.bids.indexOf(Math.max(...last.bids));
    title=last.done?'这一轮成交了。':`第${v.round}轮开牌，继续竞拍。`;copy=last.done?`${names[last.winner]??'无人'}${last.winner===null?'接盘，流拍。':`以${num(last.price)}币拍中。`}`:`${names[rank]}暂时最高，但领先幅度未达到本轮提前成交条件。`;
    content=`<div class="tutorial-offers">${last.bids.map((b,i)=>`<div${i===rank?' class="highest"':''}><small>${names[i]}${i===rank?' · 本轮最高':''}</small><strong>${b?num(b):'过牌'}</strong></div>`).join('')}</div><p>前四轮，最高价超过次高价的2 / 1.6 / 1.3 / 1.1倍时，可提前成交；等于不算。第五轮以最高有效报价成交；同价按开局顺序，全部0则流拍。</p>${last.done?button('settlement','看看本局结算 →'):button('next-round',`查看第${v.round+1}轮新情报 →`)}`;
  } else if(phase==='settlement'){
    const won=v.result.winner===0;title=won?'竞拍成功，先别急着算赚了多少。':'这次没拍中，只付入场费。';
    copy=won?'没花掉的预算已经退回。藏品还没揭晓，总值与最终盈亏暂时未知。':'正式局也可以主动放弃追价；没拍中不扣成交价，入场费不退。';
    content=`<div class="tutorial-money"><div><small>成交价</small><strong>${num(v.result.price)}</strong></div><div><small>你的净现金支出</small><strong>${num(v.fee+(won?v.result.price:0))}</strong></div><div><small>退回未用预算</small><strong>${num(v.budget-(won?v.result.price:0))}</strong></div></div>${won?button('open','开始逐件开仓 →'):`<p>想练习开仓和收纳，可以重来并使用教学报价。</p>${button('restart','按教学提示再练一次')}`}`;
  } else if(phase==='reveal'){
    title='把这仓，一件一件翻出来。';copy='每次点击只揭晓一件。正式局也能自动逐件揭晓，暂停后随时继续。';
    const last=v.count?v.items[v.count-1]:null;
    content=`${board(v,q)}<progress max="6" value="${v.count}" aria-label="教学开仓进度"></progress><p>已揭晓 ${v.count} / 6件 · 已揭晓小计 ${num(v.items.reduce((n,x)=>n+(x.revealed?x.value:0),0))}币</p>${last?`<p class="tutorial-receipt">刚揭晓：${esc(last.name)} · ${esc(q[last.quality])}品质 · ${last.width}×${last.height} / ${last.width*last.height}格 · ${num(last.value)}币</p>`:''}${v.count<6?button('reveal','揭晓下一件 →'):button('finish-reveal','全部看清了，核对盈亏 →')}`;
  } else if(phase==='accounts'){
    title='分清藏品价值与钱包现金。';copy=v.net>=0?'本次教学样本盈利；正式局没有盈利保证。':'这次报价偏高，算上入场费后亏损；可以重练并调整报价。';
    content=`<div class="tutorial-money"><div><small>藏品总值</small><strong>${num(v.total)}</strong></div><div><small>成交价＋入场费</small><strong>${num(v.result.price+v.fee)}</strong></div><div><small>本局盈亏</small><strong>${v.net>0?'+':''}${num(v.net)}</strong></div></div><p>盈亏 = 藏品总值 − 成交价 − 入场费。当前现金 ${num(v.cash)}币，藏品还不是现金。</p><h3>拍中后，藏品已经自动卖掉了吗？</h3>${button('quiz-inventory','没有，还在仓库，卖出才增加现金')}<button class="button outline" data-tutorial="quiz-cash">已经全部变成现金了</button>`;
  } else if(phase==='inventory'){
    title='亲手卖出一件，看看现金变化。';copy='点选藏品，再预览出售并确认。正式仓库也支持勾选批量出售；陈列中的藏品不参与批卖。';
    content=`<p class="tutorial-receipt">练习现金 ${num(v.cash)}币 · 已售${v.sold.length}件 · 剩余${6-v.sold.length}件</p>${stock(v,'select-sale',q)}<div class="tutorial-actions">${button('quote-sale','预览出售所选藏品',v.selection===null)}${v.sold.length?button('to-display','出售练习完成，去展示柜 →'):''}</div>`;
  } else if(phase==='sell-confirm'){
    const x=v.items[v.selection];title='确认前，再看一眼卖的是哪件。';copy='出售会把所选藏品换成现金。正式操作也需要核对清单和金额。';
    content=`<div class="tutorial-receipt"><strong>${esc(x.name)}</strong><p>售出1件，增加 ${num(x.value)}竞拍币；其余藏品不会被出售。</p></div>${button('confirm-sale','确认练习出售')}<button class="button outline" data-tutorial="cancel-sale">取消，返回仓库</button>`;
  } else if(phase==='display'){
    title='把喜欢的一件，留在展示柜。';copy='点选一件未售出的藏品，放进六格展示柜。陈列不会增加现金；正式局可撤下后再出售。';
    content=`${stock(v,'select-display',q)}${button('place','放入练习展示柜 →',v.selection===null)}`;
  } else if(phase==='done'){
    const x=v.items[v.displayed];title='这一仓，你已经完整玩过了。';copy='你完成了选区、读线索、封牌、开仓、核算盈亏、出售和陈列。';
    content=`<div class="tutorial-cabinet"><div class="tutorial-good q${x.quality}"><img src="${art(x)}" alt="${esc(x.name)}"><strong>${esc(x.name)}</strong><span>练习展示位 01</span></div>${Array.from({length:5},(_,i)=>`<div class="tutorial-empty">展示位 0${i+2}</div>`).join('')}</div><p>练习现金 ${num(v.cash)}币；已售${v.sold.length}件，剩余${6-v.sold.length}件（含陈列1件）。这些练习资产不会带入正式游戏。</p><div class="tutorial-actions"><a class="button primary" href="#play">去拍卖大厅，开始正式一局 →</a>${button('restart','再练一次')}<a class="text-link" href="#rules">回看完整规则 →</a></div><p class="mini-note">正式局需要Discord登录并选择服务器；请再确认入场费、预算、人物和主题，入场前会显示金额。</p>`;
  }
  return `<div class="tutorial-shell"><div class="tutorial-topline"><span>新手教学 · 零消耗练习</span><a href="#play">退出练习，返回拍卖大厅 →</a></div><ol class="tutorial-steps" aria-label="教程进度">${['准备','情报','出价','开仓','收纳','完成'].map((x,i)=>`<li${i===stage?' aria-current="step"':''}>${i<stage?'✓':i+1} ${x}</li>`).join('')}</ol><div class="tutorial-coach"><span class="tutorial-coach-mark" aria-hidden="true">教</span><div><h2 id="tutorial-step-title" tabindex="-1">${title}</h2><p>${copy}</p></div></div><div id="tutorial-feedback" role="status" aria-live="polite">${esc(v.feedback)}</div><div class="tutorial-lesson">${content}</div></div>`;
}
