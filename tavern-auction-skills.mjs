// V3 skills consume only currently disclosed clues. V1/V2 remain in revealAuction.
export const AUCTION_SKILL_VERSION=3;
export const AUCTION_LEGACY_SKILLS=Object.freeze({
 sophie:'首轮随机获知5件品质，此后每轮再获知2件未知品质。',
 gabriella:'每轮随机获知2件完全未知藏品的品质与轮廓。',
 viktor:'首轮获知紫/金/红合计件数，第2轮分辨各档件数，第4轮获知这些藏品的总占格。',
 zhou:'首轮认出镇仓大件的轮廓，此后每轮再获知1件未知品质。',
 lucia:'前四轮每轮获知1件未知品质，第五轮一次公开剩余全部品质。',
});
export const AUCTION_CURRENT_SKILLS=Object.freeze({
 ...AUCTION_LEGACY_SKILLS,
 gabriella:'每轮勘验2件藏品，补齐品质与轮廓；已完全看清的藏品不再重复勘验。',
 zhou:'首轮锁定镇仓大件轮廓，没有大件则随机勘验一件；第2轮鉴定该件品质，第3轮辨认类别。首轮及第4、5轮各获知1件未知品质，鉴定信息已知时改查另一件品质。',
 lucia:'前四轮每轮辨认1件藏品的品质与类别，优先未知品质；第五轮看清剩余全部品质。',
});
export const AUCTION_ROLE_TACTICS=Object.freeze({
 sophie:{focus:'广看品质',tip:'首轮信息多，适合尽早比较整仓品质；尺寸仍需结合公共线索判断。'},
 gabriella:{focus:'精查轮廓',tip:'同品质物件的占格不同，品质与轮廓一起看，能缩小候选范围。'},
 viktor:{focus:'整仓统计',tip:'先判断高品质件数，再结合分档数量与总占格；数量不等于具体位置。'},
 zhou:{focus:'重点鉴定',tip:'沿同一件藏品逐步看清轮廓、品质和类别；没出镇仓大件也有可查的目标。'},
 lucia:{focus:'类别与后程',tip:'前期将类别与仓库主题交叉判断，第五轮品质更完整；也要留意提前成交。'},
});

export function revealAuctionSkill(items,info,role,round,random,publicInfo){
 const visible=i=>({...info.items[i],
  quality:info.items[i].quality??publicInfo?.items[i]?.quality??null,
  width:info.items[i].width??publicInfo?.items[i]?.width??null,
  category:info.items[i].category??publicInfo?.items[i]?.category??null,
 });
 const pick=(indices,count)=>{
  const a=[...indices];for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,count);
 };
 const indices=items.map((_,i)=>i),unknown=()=>indices.filter(i=>visible(i).quality===null),
  quality=i=>{info.items[i].quality=items[i].quality;},
  qualities=n=>pick(unknown(),n).forEach(quality);
 if(role==='sophie'){qualities(round===1?5:2);return;}
 if(role==='gabriella'){
  for(const i of pick(indices.filter(i=>visible(i).quality===null||visible(i).width===null),2)){
   quality(i);info.items[i].width=items[i].width;info.items[i].height=items[i].height;
  }return;
 }
 if(role==='zhou'){
  if(round===1){
   const large=items.findIndex(x=>x.width*x.height>4);
   info.focus=large>=0?large:random(items.length);info.largeAbsent=large<0;
   const i=info.focus;info.items[i].width=items[i].width;info.items[i].height=items[i].height;
  }
  const i=info.focus;
  if(round===2&&visible(i).quality===null)quality(i);
  else if(round===3&&visible(i).category===null)info.items[i].category=items[i].category;
  else qualities(1);
  return;
 }
 if(role==='lucia'){
  if(round===5){unknown().forEach(quality);return;}
  const unknownQuality=unknown(),candidates=unknownQuality.length?unknownQuality:indices.filter(i=>visible(i).category===null);
  for(const i of pick(candidates,1)){quality(i);info.items[i].category=items[i].category;}
 }
}
