'use strict';
(function(root){
const MODES={easy:{name:'Easy',radius:20,hint:Infinity,reaction:48,description:'Petunjuk panas untuk semua lawan yang terlihat.'},medium:{name:'Medium',radius:16,hint:6,reaction:22,description:'Petunjuk panas hanya saat lawan berjarak 6 m atau kurang.'},hard:{name:'Hard',radius:12,hint:0,reaction:9,description:'Tanpa petunjuk panas: baca durasinya sendiri.'}};
const MAPS={kampung:{name:'Kampung Sore',x:48,z:32,lane:22,theme:'kampung',description:'Gang tanah, warung, jemuran, dan pos ronda.'},sawah:{name:'Tepi Sawah',x:54,z:36,lane:24,theme:'sawah',description:'Pematang, saluran air, dan tiga jembatan.'},pasar:{name:'Gerobak Baso',x:52,z:38,lane:25,theme:'pasar',description:'Gang pedagang baso, payung lapak, dan dua gerobak yang melintas.'}};
const PLAY_MODES={classic:{name:'Bebentengan Klasik',duration:300},tournament:{name:'Pertarungan Antar RT',duration:110},magrib:{name:'Pulang Sebelum Magrib',duration:120}};
const DT=1/60, BASE_RADIUS=1.3,TAG_RADIUS=1.02,RADIUS=.4;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function inside(x,z,o,pad=0){return Math.abs(x-o.x)<o.w/2+pad&&Math.abs(z-o.z)<o.d/2+pad;}
function layout(mapId){
const MAP={x:48,z:32,lane:22,theme:'kampung'},bases=[{x:-39,z:0},{x:39,z:0}],jails=[{x:38,z:10},{x:-38,z:-10}],obstacles=[],bushes=[],pickups=[],roads=[],water=[],bridges=[],fields=[],landmarks=[];
const obstacle=(x,z,w,d,type='wall')=>obstacles.push({x,z,w,d,type,opaque:type!=='water'});
Object.assign(MAP,MAPS[mapId]);
const home=MAP.x-9;bases[0].x=-home;bases[1].x=home;Object.assign(jails[0],{x:home-1,z:10});Object.assign(jails[1],{x:-home+1,z:-10});
  roads.push({x:0,z:0,w:MAP.x*2-8,d:5.4},{x:0,z:-MAP.lane,w:MAP.x*2-10,d:4},{x:0,z:MAP.lane,w:MAP.x*2-10,d:4},{x:-home,z:0,w:4.2,d:MAP.lane*2+4},{x:home,z:0,w:4.2,d:MAP.lane*2+4});
  for(const s of [-1,1]){if(mapId==='kampung'){obstacle(s*22,s*10,6,5,'house');obstacle(s*12,-s*17,5.5,4.8,'house');obstacle(s*33,-s*17,5.2,4.2,'house');obstacle(s*7,s*20,4.8,3.4,'ronda');obstacle(s*28,-s*8,4.2,3.4,'stall');obstacle(s*12,s*4.5,4.2,1.15);landmarks.push({x:s*7,z:s*20,y:3.7,name:'POS RONDA'},{x:s*28,z:-s*8,y:3.6,name:'WARUNG'});}else if(mapId==='sawah'){obstacle(s*32,s*11,5.4,4.5,'house');obstacle(s*13,s*28,4.5,3.5,'ronda');obstacle(s*23,-s*16,3,1.1);obstacle(s*13,s*6.5,2.3,2.3,'rock');fields.push({x:s*18,z:s*13,w:16,d:10},{x:s*34,z:-s*14,w:17,d:11});landmarks.push({x:s*13,z:s*28,y:3.7,name:'SAUNG'});}else{const spots=[[9,8,.12],[20,10.2,-.21],[31,8.1,.19],[14,-13.4,.08],[26,-15.4,-.16],[37,5.6,-.11],[39,-6.9,.15]];
      spots.forEach(([x,z,angle],index)=>{
        const yaw=angle+(s*z<0?0:Math.PI),style=(index+(s<0?1:0))%4;
        // One physical footprint includes the counter and its waiting customers.
        obstacles.push({x:s*x,z:s*z,w:4.07+Math.abs(Math.sin(angle)),d:3.25+Math.abs(Math.sin(angle)),type:'vendor',opaque:true,yaw,style,crowd:index%3!==1,facing:index%2});
      });
      obstacle(s*40,s*22,6,5,'house');obstacle(s*6,-s*8,2.8,1.2);
      landmarks.push({x:s*20,z:s*10.2,y:3.9,name:'DERETAN GEROBAK'},{x:s*26,z:-s*15.4,y:3.7,name:'LAPAK BASO'});}
    for(const [x,z,w,d]of [[home-7,15,5,4],[17,-7,6,3.5],[5,-MAP.lane+6,5,3.5],[5,5,4,3]])bushes.push({x:s*x,z:s*z,w,d});
    pickups.push({x:s*(home-9),z:s*4.3,type:'boost',ready:0},{x:s*19,z:s*(MAP.lane-5),type:'energy',ready:0},{x:s*7,z:-s*(MAP.lane-2),type:'boost',ready:0});
  }
  if(mapId==='sawah'){water.push({x:0,z:0,w:6,d:MAP.z*2});for(const z of [-MAP.lane,0,MAP.lane])bridges.push({x:0,z,w:7,d:7});const cuts=[[-MAP.z,-MAP.lane-3.5],[-MAP.lane+3.5,-3.5],[3.5,MAP.lane-3.5],[MAP.lane+3.5,MAP.z]];for(const [a,b]of cuts)obstacle(0,(a+b)/2,6,b-a,'water');}
  if(mapId==='pasar')obstacle(0,12,1.5,1.5,'tree');

  const mud=mapId==='sawah'?[{x:-14,z:0,w:13,d:6.5},{x:14,z:0,w:13,d:6.5},...fields.map(f=>({...f}))]:[];
  const posts=mapId==='kampung'?[{x:-7,z:-16.4},{x:7,z:16.4}]:[];
  const turns={kampung:[[-20,-20],[0,0],[21,19]],sawah:[[-18,-21],[9,-24],[18,0]],pasar:[[-24,-5],[0,-18],[22,0]]};
  const routes=[0,1].map(team=>[...turns[mapId].map(([x,z])=>({x:team?-x:x,z:team?-z:z})),bases[team]]);
  return {MAP,bases,jails,obstacles,bushes,pickups,roads,water,bridges,fields,landmarks,mud,posts,routes};
}

function cartsAt(tick,mapId){
  if(mapId!=='pasar')return [];
  return [-1,1].map((sign,i)=>({x:sign*17,z:Math.sin(tick/60*.63+i*Math.PI)*4.5,w:2.9,d:1.5}));
}
function createMatch(config, seats){
 const {map:mapId, mode:playMode, difficulty}=config;
 const {MAP,bases,jails,obstacles,bushes,pickups,roads,water,bridges,fields,mud,posts,routes}=layout(mapId);
 const mode=()=>MODES[difficulty], age=p=>(tick-p.lastTouch)*DT;
 const stats=p=>({max:100+p.up.stamina*25,regen:13+p.up.stamina*2.5,speed:5.8+p.up.agility*.25,accel:16+p.up.agility*3,dashCD:5-p.up.agility*.55,evadeCD:8-p.up.agility*.65,dashCost:23,evadeCost:27});
 const duration=PLAY_MODES[playMode].duration;
 let tick=0,remaining=duration,roundWait=0,tieUntil=0,ended=false,winner=null,overtime=false;
 let note='',eventId=0,leg=1,postsReady=[0,0],carts=[],newLeg=false;
 const scores=[0,0], wins=[0,0];
 const players=['Ari','Nia','Dewi','Bima','Citra','Dion'].map((name,id)=>({id,team:id<3?0:1,name:seats[id]||name,entrant:Boolean(seats[id]),human:Boolean(seats[id]),epoch:0,reveal:0,checkpoint:0,time:null,tokens:playMode==='tournament'?1:0,up:{stamina:0,agility:0}}));
 function announce(text){note=text;eventId++;}
 function cartBlocks(p,x,z){
   return carts.some(c=>inside(x,z,c,.32)&&(!inside(p.x,p.z,c,.32)||Math.hypot(x-c.x,z-c.z)<Math.hypot(p.x-c.x,p.z-c.z)-.001));
 }
function blocked(x,z,pad=RADIUS){return Math.abs(x)>MAP.x-.7||Math.abs(z)>MAP.z-.7||obstacles.some(o=>inside(x,z,o,pad));}
function segmentBlocked(a,b,pad=.05,solid=false){return obstacles.some(o=>{if(!solid&&!o.opaque)return false;let lo=0,hi=1;for(const axis of ['x','z']){const half=(axis==='x'?o.w:o.d)/2+pad,d=b[axis]-a[axis],mn=o[axis]-half,mx=o[axis]+half;if(Math.abs(d)<1e-7){if(a[axis]<mn||a[axis]>mx)return false;}else{let t1=(mn-a[axis])/d,t2=(mx-a[axis])/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}}return true;});}
function bushAt(p){return bushes.findIndex(b=>inside(p.x,p.z,b));}
function visionRange(p){return p.state==='jailed'?4:mode().radius;}
function canSee(observer,target){const d=dist(observer,target);if(d>visionRange(observer)||segmentBlocked(observer,target))return false;const b=bushAt(target);return b<0||d<=3.4||bushAt(observer)===b;}
function teamSees(team,p){return players.some(a=>a.team===team&&canSee(a,p));}
function swept(a,b,r){const sx=a.px-b.px,sz=a.pz-b.pz,dx=(a.x-a.px)-(b.x-b.px),dz=(a.z-a.pz)-(b.z-b.pz),len=dx*dx+dz*dz,t=len?clamp(-(sx*dx+sz*dz)/len,0,1):0;return Math.hypot(sx+t*dx,sz+t*dz)<=r;}
function touchBase(p,b){return swept(p,{x:b.x,z:b.z,px:b.x,pz:b.z},BASE_RADIUS);}
function floorAt(x,z) {
  if(mapId==='sawah' && Math.abs(x)<3.5 && bridges.some(b=>Math.abs(z-b.z)<b.d*.5))return .252;
  if(bases.some(b=>Math.hypot(x-b.x,z-b.z)<3.28))return .122;
  return roads.some(r=>inside(x,z,r))?.038:0;
}
function resetRound(){players.forEach(p=>{p.epoch++;const i=p.id%3,b=bases[p.team],s=stats(p);Object.assign(p,{x:b.x+(p.team?-1:1)*.6,z:(i-1)*.85,state:'active',homeSafe:false,lastTouch:tick,touching:true,yaw:p.team?-Math.PI/2:Math.PI/2,vx:0,vz:0,walk:0,energy:s.max,lastSpend:-9999,exhausted:false,sprinting:false,aiSprint:true,dashUntil:0,dashReady:0,evadeUntil:0,evadeReady:0,boostUntil:0,dx:p.team?-1:1,dz:0,lane:(i-1)*MAP.lane,waitUntil:tick+35+i*17,path:[],pathAt:0,targetCell:'',nextPath:0,nextDecision:0,decisionCount:0,intentTarget:null,intentUrgent:false});p.px=p.x;p.pz=p.z; p.oldYaw=p.yaw; p.oldWalk=p.walk; p.pace=p.oldPace=p.lean=p.oldLean=p.bank=p.oldBank=p.crouch=p.oldCrouch=0; p.floor=p.oldFloor=floorAt(p.x,p.z);});roundWait=0;}
function upgrade(p,key){const level=p.up[key];if(level>=3||p.tokens<level+1)return false;p.tokens-=level+1;p.up[key]++;if(key==='stamina')p.energy=Math.min(stats(p).max,p.energy+25);return true;}
function skill(p,kind){if(playMode==='classic'||(playMode==='magrib'&&kind==='evade'))return false;if(p.state!=='active'||roundWait)return false;const s=stats(p),ready=kind==='dash'?p.dashReady:p.evadeReady,cost=kind==='dash'?s.dashCost:s.evadeCost;if(tick<ready||p.energy<cost||tick<p.dashUntil||tick<p.evadeUntil)return false;p.energy-=cost;p.lastSpend=tick;if(kind==='dash'){p.dashUntil=tick+14;p.dashReady=tick+Math.round(s.dashCD*60);}else{p.evadeUntil=tick+27;p.evadeReady=tick+Math.round(s.evadeCD*60);}return true;}
// Navigation uses the same solid geometry as player collision.
let NX=1,NZ=1,grid=new Uint8Array(1);
const cell=(x,z)=>({ix:clamp(Math.round((x+MAP.x-1)/2),0,NX-1),iz:clamp(Math.round((z+MAP.z-1)/2),0,NZ-1)}),world=(ix,iz)=>({x:ix*2-MAP.x+1,z:iz*2-MAP.z+1});
function rebuildGrid(){NX=Math.floor(MAP.x-1)+1;NZ=Math.floor(MAP.z-1)+1;grid=new Uint8Array(NX*NZ);for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){const q=world(ix,iz);grid[iz*NX+ix]=blocked(q.x,q.z,.65)?1:0;}}
function pathTo(a,b){let start=cell(a.x,a.z),end=cell(b.x,b.z);const free=c=>{if(!grid[c.iz*NX+c.ix])return c;for(let r=1;r<=4;r++)for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++){const ix=c.ix+x,iz=c.iz+z;if(ix>=0&&ix<NX&&iz>=0&&iz<NZ&&!grid[iz*NX+ix])return {ix,iz};}return c;};start=free(start);end=free(end);const s=start.iz*NX+start.ix,t=end.iz*NX+end.ix,open=[s],closed=new Uint8Array(NX*NZ),cost=new Float32Array(NX*NZ).fill(Infinity),parent=new Int16Array(NX*NZ).fill(-1);cost[s]=0;let reached=false;const h=n=>Math.hypot(n%NX-end.ix,Math.floor(n/NX)-end.iz);for(let it=0;it<NX*NZ&&open.length;it++){let bi=0;for(let j=1;j<open.length;j++)if(cost[open[j]]+h(open[j])<cost[open[bi]]+h(open[bi]))bi=j;const n=open.splice(bi,1)[0];if(n===t){reached=true;break;}if(closed[n])continue;closed[n]=1;const x=n%NX,z=Math.floor(n/NX);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,zz=z+dz,k=zz*NX+xx;if(xx<0||xx>=NX||zz<0||zz>=NZ||grid[k]||closed[k])continue;if(dx&&dz&&(grid[z*NX+xx]||grid[zz*NX+x]))continue;const c=cost[n]+Math.hypot(dx,dz);if(c<cost[k]){cost[k]=c;parent[k]=n;open.push(k);}}}if(!reached)return [];const result=[{x:b.x,z:b.z}];for(let n=t;n!==s&&n>=0;n=parent[n])result.push(world(n%NX,Math.floor(n/NX)));result.reverse();return result;}
function route(p,target){if(!segmentBlocked(p,target,.65,true))return target;const c=cell(target.x,target.z),key=c.ix+','+c.iz;if(tick>=p.nextPath||p.targetCell!==key){p.path=pathTo(p,target);p.pathAt=0;p.targetCell=key;p.nextPath=tick+48;}while(p.pathAt<p.path.length&&dist(p,p.path[p.pathAt])<.85)p.pathAt++;return p.path[p.pathAt]||target;}
function inputForBot(p){if(playMode==='magrib'){
    if(p.homeSafe)return {x:0,z:0};const q=route(p,routes[p.team][p.checkpoint]);
    return {x:q.x-p.x,z:q.z-p.z,sprint:p.energy>(difficulty==='easy'?80:difficulty==='medium'?42:20)&&!p.exhausted};}if(p.state==='jailed'||tick<p.waitUntil)return {x:0,z:0,sprint:false};if(playMode==='tournament'&&p.tokens){const first=p.id%2?'agility':'stamina';if(!upgrade(p,first))upgrade(p,first==='agility'?'stamina':'agility');}
  if(tick>=p.nextDecision||!p.intentTarget){p.nextDecision=tick+(p.team===1?mode().reaction:22);p.decisionCount++;const own=bases[p.team],goal=bases[1-p.team];let target,danger,prey;
    if(p.state==='returning')target=own;else{const enemies=players.filter(o=>o.team!==p.team&&o.state==='active'&&teamSees(p.team,o));danger=enemies.filter(o=>o.lastTouch>p.lastTouch&&dist(p,o)<8).sort((a,b)=>dist(p,a)-dist(p,b))[0];prey=enemies.filter(o=>o.lastTouch<p.lastTouch&&dist(p,o)<11).sort((a,b)=>dist(p,a)-dist(p,b))[0];const mate=players.find(o=>o.team===p.team&&o.state==='jailed'),pickup=(playMode==='tournament'?pickups:[]).filter(o=>tick>=o.ready&&dist(p,o)<7&&canSee(p,o)&&(o.type==='boost'||p.energy<stats(p).max*.55)).sort((a,b)=>dist(p,a)-dist(p,b))[0];if(danger||age(p)>32)target=own;else if(mate&&(!prey||dist(p,prey)>3))target=mate;else if(prey){const lead=p.team===1&&difficulty==='hard'?.36:0;target={x:prey.x+prey.vx*lead,z:prey.z+prey.vz*lead};if(blocked(target.x,target.z))target=prey;}else if(pickup)target=pickup;else if(Math.abs(p.x-goal.x)>7)target={x:goal.x,z:p.lane};else target=goal;}
    p.intentTarget={x:target.x,z:target.z};p.intentUrgent=!!danger||!!prey;const q=route(p,p.intentTarget),dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz)||1;p.dx=dx/len;p.dz=dz/len;const tactical=p.team===0||difficulty!=='easy'||p.decisionCount%3===0;
    if(tactical&&p.state==='active'&&danger&&dist(p,danger)<3){if(!skill(p,'evade'))skill(p,'dash');}else if(tactical&&p.state==='active'&&((prey&&dist(p,prey)<5.5)||dist(p,goal)<7||danger)&&p.energy>40)skill(p,'dash');
  }
  const q=route(p,p.intentTarget),dx=q.x-p.x,dz=q.z-p.z;if(p.energy<24)p.aiSprint=false;else if(p.energy>65)p.aiSprint=true;return {x:dx,z:dz,sprint:p.aiSprint&&(p.intentUrgent||dist(p,p.intentTarget)>6||p.state==='returning')};
}
function collideMove(p,dx,dz){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));for(let i=0;i<steps;i++){const x=clamp(p.x+dx/steps,-MAP.x+.7,MAP.x-.7),z=clamp(p.z+dz/steps,-MAP.z+.7,MAP.z-.7);if(!blocked(x,p.z)&&!cartBlocks(p,x,p.z))p.x=x;else p.vx=0;if(!blocked(p.x,z)&&!cartBlocks(p,p.x,z))p.z=z;else p.vz=0;}}
function move(p,input){
  p.oldYaw=p.yaw; p.oldWalk=p.walk; p.oldPace=p.pace; p.oldBank=p.bank;
  p.oldFloor=p.floor; p.oldCrouch=p.crouch; p.oldLean=p.lean;
  if(p.state==='jailed'||p.homeSafe){
    p.vx=p.vz=0;p.sprinting=false;p.pace*=.76;p.lean*=.76;p.bank*=.76;p.crouch*=.76;return;
  }
  const s=stats(p),magnitude=Math.hypot(input.x,input.z),moving=magnitude>.08;
  let x=moving?input.x/magnitude:0,z=moving?input.z/magnitude:0;
  const throttle=moving?(input.analog?clamp((magnitude-.08)/.92,0,1):1):0;
  if(moving&&tick>=p.dashUntil){p.dx=x;p.dz=z;}
  if(p.exhausted&&p.energy>=20)p.exhausted=false;
  p.sprinting=!!input.sprint&&throttle>.55&&!p.exhausted&&p.energy>0&&tick>=p.dashUntil&&tick>=p.evadeUntil;
  const traction=mud.some(zone=>inside(p.x,p.z,zone))?.58:1;
  p.onMud=traction<1;let speed=s.speed*throttle*traction;
  if(p.sprinting){speed*=1.65;p.energy=Math.max(0,p.energy-23*DT);p.lastSpend=tick;if(p.energy<=0){p.exhausted=true;p.sprinting=false;}}
  if(tick<p.boostUntil)speed*=1.3;
  const dashing=tick<p.dashUntil,evading=tick<p.evadeUntil;
  if(dashing){
    speed=(22+p.up.agility*.6)*traction;p.vx=p.dx*speed;p.vz=p.dz*speed;
  }else{
    if(evading)speed*=1.14;
    const accelerating=p.vx*x+p.vz*z<speed;
    const response=moving&&accelerating?s.accel*.85:s.accel*1.13;
    const blend=1-Math.exp(-response*DT);
    p.vx=mix(p.vx,x*speed,blend); p.vz=mix(p.vz,z*speed,blend);
  }
  const beforeX=p.x,beforeZ=p.z;
  collideMove(p,p.vx*DT,p.vz*DT);
  if(tick-p.lastSpend>55)p.energy=Math.min(s.max,p.energy+s.regen*DT);
  if(p.touching)p.energy=Math.min(s.max,p.energy+26*DT);
  const dx=p.x-beforeX,dz=p.z-beforeZ,travel=Math.hypot(dx,dz),actualSpeed=travel/DT;
  let turn=0;
  if(actualSpeed>.15){
    const angle=Math.atan2(dx,dz)-p.yaw;
    turn=Math.atan2(Math.sin(angle),Math.cos(angle));
    p.yaw+=turn*(1-Math.exp(-DT*(dashing?22:14)));
    p.walk+=travel*mix(3.4,2.75,clamp(actualSpeed/9,0,1));
  }
  p.pace=mix(p.pace,clamp(actualSpeed/4,0,1),.20);
  p.bank=mix(p.bank,clamp(turn*.27,-.15,.15)*p.pace,.16);
  p.lean=mix(p.lean,dashing?.38:p.sprinting?.22:.085*p.pace,.14);
  p.crouch=mix(p.crouch,evading?1:0,.22);
  p.floor=mix(p.floor,floorAt(p.x,p.z),.36);
}
function getPickups(){for(const q of pickups){if(tick<q.ready)continue;const candidates=players.filter(p=>p.state==='active'&&dist(p,q)<1.15);if(!candidates.length)continue;candidates.sort((a,b)=>dist(a,q)-dist(b,q));if(candidates.length>1&&Math.abs(dist(candidates[0],q)-dist(candidates[1],q))<1e-8)continue;const p=candidates[0];if(q.type==='boost')p.boostUntil=tick+300;else p.energy=Math.min(stats(p).max,p.energy+55);q.ready=tick+1200;announce(p.name+' · '+(q.type==='boost'?'BOOST! Gerak +30% selama 5 detik.':'Energi pulih +55.'),true);}}
function jail(p,winner){const before=age(p).toFixed(2),win=age(winner).toFixed(2);p.epoch++;p.state='jailed';p.x=jails[p.team].x+(p.id%3-1)*.65;p.z=jails[p.team].z;p.px=p.x;p.pz=p.z;p.floor=p.oldFloor=floorAt(p.x,p.z);p.pace=p.oldPace=0;p.vx=p.vz=0;p.dashUntil=p.evadeUntil=p.boostUntil=0;p.sprinting=false;if(playMode==='tournament')winner.tokens++;announce(winner.name+' menang sentuh ('+win+' vs '+before+' dtk). '+p.name+' tertawan.'+(playMode==='tournament'?' Penangkap +1 poin upgrade.':''),p.id===0||winner.id===0);}

 function endMatch(team){ended=true;winner=team;announce(playMode==='magrib'?'Waktu lintasan selesai.':team===null?'Pertandingan seri.':'RT 0'+(team+1)+' menang!');}
 function finishLeg(){
   if(scores[0]===scores[1] && playMode==='tournament'){overtime=true;announce('Poin emas menentukan set ini.');return;}
   const team=scores[0]===scores[1]?null:(scores[0]>scores[1]?0:1);
   if(playMode==='classic'){endMatch(team);return;}
   wins[team]++;if(wins[team]>=2){endMatch(team);return;}
   newLeg=true;roundWait=150;announce('RT 0'+(team+1)+' merebut set '+leg+'. Bersiap untuk set berikutnya.');
 }
 function finishRound(team,text){
   if(team!==null){scores[team]++;if(playMode==='tournament')for(const p of players)if(p.team===team)p.tokens++;}
   roundWait=95;announce(text);
   if(Math.max(...scores)>=(playMode==='classic'?3:2)||overtime&&team!==null)finishLeg();
 }
 function contacts(){
  for(const p of players){if(p.state==='jailed')continue;const contact=touchBase(p,bases[p.team]);if(contact){p.lastTouch=tick;if(p.state==='returning')p.state='active';if(!p.touching&&p.id===0)announce('Sentuh benteng: panas diperbarui dan energi pulih lebih cepat.');}p.touching=dist(p,bases[p.team])<=BASE_RADIUS;}
  if(playMode==='tournament')getPickups();const caught=new Map();
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){const a=players[i],b=players[j];if(a.team===b.team||a.state!=='active'||b.state!=='active'||tick<a.evadeUntil||tick<b.evadeUntil||!swept(a,b,TAG_RADIUS)||segmentBlocked(a,b))continue;if(a.lastTouch===b.lastTouch){if(tick>tieUntil){announce('Sentuhan benteng sama: seri, tidak ada tangkapan.');tieUntil=tick+120;}continue;}const win=a.lastTouch>b.lastTouch?a:b,lose=win===a?b:a,prev=caught.get(lose.id);if(!prev||win.lastTouch>prev.lastTouch)caught.set(lose.id,win);}
  for(const [id,win]of caught)jail(players[id],win);
  for(const p of players.filter(p=>p.state==='jailed')){const helper=players.find(a=>a.team===p.team&&a.state==='active'&&tick>=a.evadeUntil&&dist(a,p)<1.3);if(helper){p.state='returning';p.energy=stats(p).max;if(playMode==='tournament')helper.tokens+=2;announce(helper.name+' membebaskan '+p.name+'. Yang dibebaskan pulang ke benteng dulu.',p.id===0||helper.id===0);}}
  const scorers=new Set(players.filter(p=>p.state==='active'&&tick>=p.evadeUntil&&touchBase(p,bases[1-p.team])).map(p=>p.team));
  if(scorers.size===2){finishRound(null,'Kedua benteng tersentuh bersamaan: ronde seri.');return;}if(scorers.size===1){const t=[...scorers][0];finishRound(t,'BENTENG! Tim '+('RT 0'+(t+1))+' mendapat 1 angka.');return;}
  for(let t=0;t<2;t++)if(players.filter(p=>p.team===t).every(p=>p.state==='jailed')){finishRound(1-t,'Semua pemain tim '+('RT 0'+(t+1))+' tertawan. Lawan +1 skor.');return;}

 }
 function step(inputs={}){
   if(ended)return;tick++;
   if(roundWait>0){roundWait--;if(roundWait===0){
     if(newLeg){newLeg=false;leg++;scores.fill(0);remaining=duration;overtime=false;}
     resetRound();
   }return;}
   if(!overtime)remaining=Math.max(0,remaining-DT);
   if(remaining<.0001 && !overtime){remaining=0;if(playMode==='magrib')endMatch(null);else finishLeg();return;}
   carts=cartsAt(tick,mapId);
   if(playMode==='tournament'&&tick%1500===0)for(const p of players)p.tokens++;
   for(const p of players){
     p.px=p.x;p.pz=p.z;const input=inputs[p.id];
     move(p,p.human?(input||{x:0,z:0}):inputForBot(p));
     posts.forEach((post,i)=>{if(p.state==='active'&&tick>=postsReady[i]&&dist(p,post)<1.8){
       postsReady[i]=tick+900;p.energy=Math.min(stats(p).max,p.energy+22);
       if(playMode!=='magrib')for(const foe of players)if(foe.team!==p.team&&dist(foe,post)<18)foe.reveal=tick+210;
       announce(p.name+' membunyikan kentongan.');}});
   }
   if(playMode!=='magrib'){contacts();return;}
   for(const p of players){
     if(p.homeSafe)continue;
     if(dist(p,routes[p.team][p.checkpoint])>1.85)continue;
     p.checkpoint++;
     if(p.checkpoint===4){p.time=tick/60;p.homeSafe=true;p.state='home';p.vx=p.vz=0;announce(p.name+' pulang dalam '+p.time.toFixed(2)+' dtk.');}
   }
   const humans=players.filter(p=>p.entrant);
   if((humans.length?humans:players).every(p=>p.homeSafe))endMatch(null);
 }
 function action(id,kind){
   const p=players[id];if(!p||!p.human||ended||roundWait)return;
   if(kind==='stamina'||kind==='agility'){if(playMode==='tournament')upgrade(p,kind);}
   else if(kind==='dash'||kind==='evade')skill(p,kind);
 }
 function snapshot(){
   return {tick,remaining,scores:[...scores],wins:[...wins],leg,roundWait,ended,winner,overtime,note,eventId,postsReady:[...postsReady],
     items:pickups.map(q=>q.ready),players:players.map(p=>{
       const out={};
       for(const k of wireKeys){const v=p[k];out[k]=typeof v==='number'?Math.round(v*1000)/1000:v;}
       out.up={...p.up};return out;
     })};
 }
 rebuildGrid();resetRound();
 return {step,action,snapshot,players};
}
const wireKeys='id team name epoch x z vx vz yaw walk pace bank floor crouch lean energy tokens state homeSafe lastTouch touching sprinting exhausted dashUntil evadeUntil boostUntil dashReady evadeReady checkpoint time onMud reveal'.split(' ');
function tier(rp){return rp>=180?'Emas':rp>=90?'Perak':'Perunggu';}
const api={layout,createMatch,cartsAt,tier,MAPS,MODES,PLAY_MODES};
if(typeof module==='object'&&module.exports)module.exports=api;else root.BentengCore=api;
})(globalThis);
