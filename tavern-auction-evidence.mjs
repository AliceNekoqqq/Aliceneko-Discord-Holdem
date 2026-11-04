// Exact conditional appraisal for V9. Reads a model and disclosed clues only.
// A single featured position is mixed with ordinary positions, as in generation.
const groups=pool=>Array.from({length:6},(_,q)=>pool.filter(x=>x.quality===q));
const factorial=n=>{let x=1;for(let i=2;i<=n;i++)x*=i;return x;};
const optionCache=new WeakMap();
function options(m,clue,featured,unit,limit,cap,noLarge=false){
 let cache=optionCache.get(m);if(!cache){cache=new Map();optionCache.set(m,cache);}
 const key=[featured,unit,limit,cap,noLarge,clue.quality,clue.width,clue.height,clue.category].join(':');
 if(cache.has(key))return cache.get(key);
 const pool=featured?m.featured:m.ordinary,bins=new Map(),totals=groups(pool).map(xs=>xs.reduce((s,x)=>s+x.dropWeight,0)),total=m.weights.reduce((s,x)=>s+x,0);
 for(const x of pool){
  if(noLarge&&x.width*x.height>4 || x.quality>limit || clue.quality!=null&&clue.quality!==x.quality || clue.width!=null&&(clue.width!==x.width||clue.height!==x.height) || clue.category!=null&&clue.category!==x.category)continue;
  const q=x.quality,area=x.width*x.height,k=`${q}:${area}`,b=bins.get(k)??{q,area,p:0,v:0},
   p=m.weights[q]/total*x.dropWeight/totals[q],value=Math.floor((cap&&q===5?Math.min(x.value,2000000):x.value)*unit/100000);
  b.p+=p;b.v+=p*value;bins.set(k,b);
 }
 const out=[...bins.values()].filter(x=>x.p>0).map(x=>({...x,v:x.v/x.p}));
 if(cache.size<64)cache.set(key,out);return out;
}
const blank={quality:null,width:null,height:null,category:null};
function unconditioned(info,unit,m,limit){
 const ordinary=info.items.map(c=>options(m,c,false,unit,limit,c.quality==null,info.largeAbsent===true)),featured=info.items.map(c=>options(m,c,true,unit,limit,c.quality==null,info.largeAbsent===true)),n=info.items.length;
 const stats=xs=>({p:xs.reduce((s,x)=>s+x.p,0),v:xs.reduce((s,x)=>s+x.p*x.v,0)}),a=ordinary.map(stats),b=featured.map(stats);let p=0,v=0;
 for(let h=-1;h<n;h++){
  let prior=h===-1?1-m.chance:m.chance/n,total=0;
  for(let i=0;i<n;i++){const x=i===h?b[i]:a[i];if(!x.p){prior=0;break;}prior*=x.p;total+=x.v/x.p;}
  p+=prior;v+=prior*total;
 }return {p,v};
}
function aggregate(info,unit,m,limit){
 const known=info.items.map((c,i)=>({c,i})).filter(({c})=>c.quality!=null||c.width!=null||c.category!=null),n=info.items.length,
  remaining=n-known.length,cap=!info.highCounts,ordinary=options(m,blank,false,unit,limit,cap,info.largeAbsent===true),featured=options(m,blank,true,unit,limit,cap,info.largeAbsent===true),
  qstats=xs=>Array.from({length:6},(_,q)=>{const a=xs.filter(x=>x.q===q),p=a.reduce((s,x)=>s+x.p,0);return {p,v:p?a.reduce((s,x)=>s+x.p*x.v,0)/p:0,areas:a.map(x=>({...x,p:x.p/p}))};}),
  og=qstats(ordinary),fg=qstats(featured),sum=(xs,qs)=>{const p=qs.reduce((s,q)=>s+xs[q].p,0);return {p,v:p?qs.reduce((s,q)=>s+xs[q].p*xs[q].v,0)/p:0};},
  lo=sum(og,[0,1,2]),hi=sum(og,[3,4,5]),fl=sum(fg,[0,1,2]),fh=sum(fg,[3,4,5]),memo=new Map();
 function areaStats(counts,target,fq){
  let dp=new Map([[0,{p:1,v:0}]]);
  for(let q=3;q<=5;q++)for(let j=0;j<counts[q-3];j++){
   const xs=q===fq&&j===0?fg[q].areas:og[q].areas,next=new Map();
   for(const [area,d]of dp)for(const x of xs){const a=area+x.area;if(a>target)continue;const b=next.get(a)??{p:0,v:0};b.p+=d.p*x.p;b.v+=(d.v+d.p*x.v)*x.p;next.set(a,b);}dp=next;
  }return dp.get(target)??{p:0,v:0};
 }
 function unknown(counts,high,area,hasFeature){
  const key=[counts?.join(','),high,area,hasFeature].join(':');if(memo.has(key))return memo.get(key);
  const low=remaining-high;let out={p:0,v:0};
  if(!Number.isInteger(high)||high<0||low<0||counts?.some(c=>!Number.isInteger(c)||c<0)||area!==undefined&&area<0)return out;
  if(!counts){
   const p=factorial(remaining)/factorial(high)/factorial(low)*hi.p**high*lo.p**low;
   let value=high*hi.v+low*lo.v;
   if(hasFeature&&remaining)value+=high/remaining*(fh.v-hi.v)+low/remaining*(fl.v-lo.v);
   out={p,v:p*value};
  }else{
   let p=factorial(remaining)/factorial(low)*lo.p**low;
   for(let i=0;i<3;i++)p*=og[i+3].p**counts[i]/factorial(counts[i]);
   if(p){
    const term=(fq,share)=>{
     if(!share)return;
     const lowValue=low*lo.v+(fq===-2?fl.v-lo.v:0),
      d=area===undefined?{p:1,v:counts.reduce((s,c,i)=>s+c*og[i+3].v,0)+(fq>=3?fg[fq].v-og[fq].v:0)}:areaStats(counts,area,fq);
     out.p+=p*share*d.p;out.v+=p*share*(d.v+d.p*lowValue);
    };
    if(!hasFeature)term(-1,1);
    else if(!remaining)term(-1,1);
    else {term(-2,low/remaining);for(let q=3;q<=5;q++)term(q,counts[q-3]/remaining);}
   }
  }
  memo.set(key,out);return out;
 }
 let p=0,v=0;
 // Feature at a disclosed position, at any undisclosed position, or absent.
 const hypotheses=[{h:-1,prior:1-m.chance},...known.map(({i})=>({h:i,prior:m.chance/n})),{h:-2,prior:m.chance*remaining/n}];
 for(const {h,prior}of hypotheses){
  if(!prior)continue;
  function visit(k,prob,value,high,counts,area){
   if(k===known.length){
    const rest=unknown(counts,info.highCount-high,info.highArea===undefined?undefined:info.highArea-area,h===-2);
    p+=prior*prob*rest.p;v+=prior*prob*(rest.v+rest.p*value);return;
   }
   const {c,i}=known[k];
   for(const x of options(m,c,i===h,unit,limit,cap&&c.quality==null,info.largeAbsent===true)){
    const next=counts?[...counts]:null;if(x.q>=3&&next)next[x.q-3]--;
    visit(k+1,prob*x.p,value+x.v,high+(x.q>=3?1:0),next,area+(x.q>=3?x.area:0));
   }
  }
  visit(0,1,0,0,info.highCounts?[...info.highCounts]:null,0);
 }
 return {p,v};
}
export function estimateAuctionEvidence(info,unit,m){
 if(info.items.length!==m.count)throw Error('仓库件数线索异常。');
 const evidence=limit=>info.highCount===null?unconditioned(info,unit,m,limit):aggregate(info,unit,m,limit),
  top=info.maxQuality,a=evidence(top??5),b=top==null?{p:0,v:0}:evidence(top-1),p=a.p-b.p;
 if(!(p>0))throw Error('公共情报与技能线索不匹配。');
 return Math.max(0,(a.v-b.v)/p);
}
