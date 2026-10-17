const palette={
  wall:[246,233,211],wood:[111,65,50],deepWood:[74,43,39],gold:[205,156,82],cream:[255,248,232],
  red:[172,40,52],brightRed:[202,53,61],darkRed:[119,28,42],pink:[227,164,159],
  skin:[245,207,171],hair:[55,38,34],ink:[58,43,40],floor:[151,91,69],floorLight:[177,112,81]
};

class Raster {
  constructor(width,height,color){this.width=width;this.height=height;this.pixels=new Uint8Array(width*height*3);this.rect(0,0,width,height,color);}
  pixel(x,y,color){if(x<0||y<0||x>=this.width||y>=this.height)return;const i=(y*this.width+x)*3;this.pixels[i]=color[0];this.pixels[i+1]=color[1];this.pixels[i+2]=color[2];}
  rect(x,y,w,h,color){const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y)),x1=Math.min(this.width,Math.ceil(x+w)),y1=Math.min(this.height,Math.ceil(y+h));if(x1<=x0||y1<=y0)return;const row=new Uint8Array((x1-x0)*3);for(let i=0;i<x1-x0;i++){row[i*3]=color[0];row[i*3+1]=color[1];row[i*3+2]=color[2];}for(let yy=y0;yy<y1;yy++)this.pixels.set(row,(yy*this.width+x0)*3);}
  ellipse(cx,cy,rx,ry,color){const x0=Math.max(0,Math.floor(cx-rx)),y0=Math.max(0,Math.floor(cy-ry)),x1=Math.min(this.width,Math.ceil(cx+rx)),y1=Math.min(this.height,Math.ceil(cy+ry));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1)this.pixel(x,y,color);}}
  polygon(points,color){const minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),maxY=Math.min(this.height-1,Math.ceil(Math.max(...points.map(p=>p[1]))));for(let y=minY;y<=maxY;y++){const hits=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y))hits.push(xi+(y-yi)*(xj-xi)/(yj-yi));}hits.sort((a,b)=>a-b);for(let i=0;i<hits.length-1;i+=2)this.rect(Math.ceil(hits[i]),y,Math.floor(hits[i+1])-Math.ceil(hits[i])+1,1,color);}}
}

function drawLamp(c,x,y,scale=1){c.rect(x-2*scale,y-32*scale,4*scale,26*scale,palette.gold);c.ellipse(x,y,18*scale,23*scale,palette.brightRed);c.ellipse(x,y+1*scale,11*scale,16*scale,[246,190,113]);c.rect(x-14*scale,y-24*scale,28*scale,4*scale,palette.gold);c.rect(x-14*scale,y+19*scale,28*scale,4*scale,palette.gold);}

function drawCouple(c,cx,baseY){
  const groomX=cx-54,brideX=cx+54;
  c.ellipse(groomX,baseY-101,27,36,palette.skin);c.ellipse(groomX,baseY-127,28,10,palette.hair);c.rect(groomX-25,baseY-127,50,8,palette.darkRed);c.rect(groomX-17,baseY-142,34,17,palette.red);c.rect(groomX-5,baseY-151,10,10,palette.gold);
  c.polygon([[groomX-18,baseY-76],[groomX-48,baseY-59],[groomX-66,baseY],[groomX+30,baseY],[groomX+48,baseY-59],[groomX+18,baseY-76]],palette.red);
  c.polygon([[groomX-18,baseY-76],[groomX,baseY-35],[groomX+18,baseY-76]],palette.darkRed);c.rect(groomX-30,baseY-20,60,7,palette.gold);c.rect(groomX-63,baseY-2,126,7,palette.wood);
  c.ellipse(brideX,baseY-100,27,34,palette.skin);c.ellipse(brideX,baseY-118,34,35,palette.brightRed);c.rect(brideX-32,baseY-120,64,28,palette.red);c.polygon([[brideX-32,baseY-111],[brideX+32,baseY-111],[brideX+24,baseY-70],[brideX,baseY-61],[brideX-24,baseY-70]],palette.red);c.rect(brideX-7,baseY-143,14,14,palette.gold);
  c.polygon([[brideX-18,baseY-67],[brideX-46,baseY-53],[brideX-65,baseY],[brideX+65,baseY],[brideX+46,baseY-53],[brideX+18,baseY-67]],palette.brightRed);
  c.polygon([[brideX-18,baseY-67],[brideX,baseY-29],[brideX+18,baseY-67]],palette.darkRed);c.rect(brideX-35,baseY-21,70,6,palette.gold);c.rect(brideX-64,baseY-2,128,7,palette.wood);
  c.ellipse(cx,baseY-52,10,6,palette.gold);c.rect(cx-2,baseY-48,4,19,palette.gold);
}

const western={
  foliage:[102,118,83],leaf:[130,145,101],ivory:[251,247,235],dress:[248,245,235],
  dressShade:[220,212,193],suit:[58,66,76],suitLight:[83,91,99],shirt:[255,251,241],
  flower:[255,247,226],flowerPink:[194,119,111],green:[98,119,82],tie:[111,43,48]
};
function drawWesternArch(c){
  c.ellipse(540,164,267,171,western.foliage);c.ellipse(540,169,248,159,[239,225,201]);c.rect(318,174,444,112,[239,225,201]);
  c.ellipse(540,160,235,145,[245,234,216]);c.rect(338,173,404,113,[245,234,216]);
  for(let i=0;i<=12;i++){
    const angle=Math.PI+i*Math.PI/12,x=540+248*Math.cos(angle),y=171+156*Math.sin(angle);
    c.ellipse(x,y,17,13,i%3===0?western.flowerPink:western.flower);
    c.ellipse(x-5,y-1,5,5,palette.cream);c.ellipse(x+5,y+2,5,5,palette.gold);
    if(i%2===0){c.ellipse(x-13,y+13,8,4,western.leaf);c.ellipse(x+13,y+13,8,4,western.foliage);}
  }
  for(const side of [225,855]){
    c.ellipse(side,242,36,53,western.foliage);c.ellipse(side,218,27,37,western.leaf);
    for(let i=0;i<5;i++){c.ellipse(side-18+i*9,194+i%2*10,8,7,i%2?western.flower:western.flowerPink);}
  }
}

function drawWesternCouple(c,cx,baseY){
  const groomX=cx-55,brideX=cx+55;
  c.polygon([[brideX-21,baseY-128],[brideX+17,baseY-132],[brideX+49,baseY-87],[brideX+62,baseY],[brideX-68,baseY],[brideX-50,baseY-80]],western.ivory);
  c.polygon([[brideX-14,baseY-73],[brideX-38,baseY-57],[brideX-65,baseY],[brideX+63,baseY],[brideX+38,baseY-57],[brideX+15,baseY-73]],western.dress);
  c.ellipse(brideX,baseY-101,22,29,palette.skin);c.ellipse(brideX,baseY-119,25,18,palette.hair);
  c.ellipse(brideX+19,baseY-104,8,21,palette.hair);c.ellipse(brideX-19,baseY-104,6,19,palette.hair);
  c.polygon([[brideX-13,baseY-75],[brideX,baseY-39],[brideX+13,baseY-75]],western.ivory);
  c.polygon([[brideX-7,baseY-74],[brideX,baseY-51],[brideX+7,baseY-74]],western.dressShade);
  c.rect(brideX-33,baseY-18,66,5,palette.gold);
  c.ellipse(brideX-10,baseY-82,4,4,western.flowerPink);c.ellipse(brideX,baseY-86,4,4,western.flower);c.ellipse(brideX+8,baseY-81,4,4,western.flowerPink);
  c.ellipse(groomX,baseY-101,22,29,palette.skin);c.ellipse(groomX,baseY-120,24,14,palette.hair);c.rect(groomX-21,baseY-118,6,18,palette.hair);
  c.polygon([[groomX-16,baseY-75],[groomX-39,baseY-59],[groomX-52,baseY],[groomX+51,baseY],[groomX+39,baseY-59],[groomX+16,baseY-75]],western.suit);
  c.polygon([[groomX-9,baseY-74],[groomX,baseY-34],[groomX+9,baseY-74],[groomX+2,baseY-81]],western.shirt);
  c.polygon([[groomX-3,baseY-75],[groomX+3,baseY-75],[groomX+6,baseY-44],[groomX,baseY-39],[groomX-6,baseY-44]],western.tie);
  c.polygon([[groomX-16,baseY-73],[groomX-33,baseY-62],[groomX-14,baseY-35],[groomX-2,baseY-47]],western.suitLight);
  c.polygon([[groomX+16,baseY-73],[groomX+33,baseY-62],[groomX+14,baseY-35],[groomX+2,baseY-47]],western.suitLight);
  c.ellipse(groomX+17,baseY-66,4,4,western.flowerPink);c.ellipse(groomX+24,baseY-69,4,4,western.flower);
  c.rect(groomX-47,baseY-2,103,7,palette.wood);c.rect(brideX-64,baseY-2,128,7,palette.wood);
  c.ellipse(cx,baseY-47,11,8,western.green);c.ellipse(cx-8,baseY-53,7,7,western.flower);c.ellipse(cx,baseY-56,7,7,western.flowerPink);c.ellipse(cx+8,baseY-52,7,7,western.flower);
}

function hashColor(value){let h=2166136261;for(const char of String(value)){h^=char.codePointAt(0);h=Math.imul(h,16777619);}return [
  72+(h>>>16&63),
  53+(h>>>8&63),
  55+(h&63)
];}
function drawGuest(c,cx,top,person,index){
  const skin=[233+(index*17%20),188+(index*11%28),153+(index*7%30)],hair=hashColor(person.id+'hair'),robe=hashColor(person.id+'robe');
  c.ellipse(cx,top+13,10,11,skin);c.ellipse(cx,top+6,11,5,hair);c.rect(cx-11,top+6,4,9,hair);c.rect(cx+7,top+6,4,9,hair);
  c.polygon([[cx-9,top+24],[cx-22,top+34],[cx-25,top+58],[cx+25,top+58],[cx+22,top+34],[cx+9,top+24]],robe);c.polygon([[cx-5,top+26],[cx,top+40],[cx+5,top+26]],palette.cream);c.rect(cx-20,top+47,40,3,palette.gold);
}

function makeScene(people,type){
  const guests=people.slice(2),columns=10,rows=Math.ceil(guests.length/columns),width=1080,height=Math.max(500,405+rows*72),c=new Raster(width,height,palette.wall);
  c.rect(0,0,width,25,palette.wood);c.rect(18,24,width-36,14,palette.gold);
  c.rect(30,38,1020,250,[234,216,186]);
  c.rect(66,45,13,225,palette.wood);c.rect(1000,45,13,225,palette.wood);
  if(type==='western'){
    drawWesternArch(c);
    c.rect(263,53,28,229,palette.cream);c.polygon([[291,53],[337,53],[306,270],[278,270]],[224,210,183]);
    c.rect(789,53,28,229,palette.cream);c.polygon([[789,53],[743,53],[774,270],[802,270]],[224,210,183]);
  }else{
    c.ellipse(540,159,269,168,palette.darkRed);c.ellipse(540,166,249,162,palette.cream);c.ellipse(540,176,221,148,[230,210,178]);c.rect(319,176,442,112,palette.cream);
    c.rect(265,53,29,229,palette.red);c.polygon([[294,53],[339,53],[306,270],[276,270]],palette.brightRed);c.rect(786,53,29,229,palette.red);c.polygon([[786,53],[741,53],[774,270],[804,270]],palette.brightRed);
  }
  c.rect(0,287,width,36,palette.deepWood);c.rect(0,323,width,9,palette.gold);
  c.rect(0,332,width,height-332,palette.floor);for(let y=354;y<height;y+=40){c.rect(0,y,width,2,palette.floorLight);}
  c.rect(90,341,900,9,type==='western'?western.dress:palette.gold);c.rect(90,350,900,7,palette.wood);
  drawLamp(c,139,106,0.75);drawLamp(c,941,106,0.75);
  if(type==='western')drawWesternCouple(c,540,286);else drawCouple(c,540,286);
  if(guests.length){const panelY=368;c.rect(42,panelY-8,width-84,rows*72+23,[131,72,56]);c.rect(48,panelY-3,width-96,rows*72+13,[239,218,190]);for(let i=0;i<guests.length;i++){const row=Math.floor(i/columns),col=i%columns,cx=96+col*98;drawGuest(c,cx,panelY+row*72,guests[i],i);}}
  c.rect(18,height-19,width-36,9,palette.gold);c.rect(18,height-10,width-36,10,palette.deepWood);
  return {canvas:c,rows,guestCount:guests.length};
}

const CRC=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(name,bytes){const out=new Uint8Array(bytes.length+12),view=new DataView(out.buffer);view.setUint32(0,bytes.length);out.set(new TextEncoder().encode(name),4);out.set(bytes,8);let crc=0xffffffff;for(let i=4;i<out.length-4;i++)crc=CRC[(crc^out[i])&255]^(crc>>>8);view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;}

async function encodePNG(canvas){
  const {width,height}=canvas,scan=new Uint8Array((width*3+1)*height);for(let y=0;y<height;y++)scan.set(canvas.pixels.subarray(y*width*3,(y+1)*width*3),y*(width*3+1)+1);
  const compressed=new Uint8Array(await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header.set([8,2,0,0,0],8);
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}

export async function renderWeddingHall(people,type='chinese'){
  if(!Array.isArray(people)||people.length<2||people.length>100)throw Error('Invalid wedding party');
  if(type!=='chinese'&&type!=='western')throw Error('Invalid wedding type');
  const {canvas,guestCount}=makeScene(people,type);
  return {png:await encodePNG(canvas),width:canvas.width,height:canvas.height,guestCount,type};
}
