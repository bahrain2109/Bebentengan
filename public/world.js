(()=>{
'use strict';
const root=document.getElementById('benteng-kampung-sore'),canvas=root.querySelector('.world'),court=root.querySelector('.court'),labels=root.querySelector('.labels'),mini=root.querySelector('.minimap'),ctx=mini.getContext('2d');
const ui=Object.fromEntries([...root.querySelectorAll('[data-ui]')].map(n=>[n.dataset.ui,n]));
const {MODES,MAPS,PLAY_MODES}=BentengCore;
let mapId='kampung',difficulty='medium',playMode='classic',mapOpen=false,features=null,timeStart=0;
const mapOverlay=root.querySelector('.map-overlay'),bigMap=root.querySelector('.bigmap'),bigCtx=bigMap.getContext('2d');
const cover=root.querySelector('.cover'),eventEl=root.querySelector('.event'),startButton=root.querySelector('[data-action="start"]'),pauseButton=root.querySelector('[data-action="pause"]'),energyFill=root.querySelector('.energyfill'),energyTrack=root.querySelector('.energytrack');
const skillButtons=Object.fromEntries([...root.querySelectorAll('[data-skill]')].map(n=>[n.dataset.skill,n]));
const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
if(!gl){ui.title.textContent='WebGL belum tersedia';ui.covertext.textContent='Buka file ini pada browser yang mendukung grafis 3D.';startButton.disabled=true;return;}
const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
const prog=gl.createProgram();
const fragmentPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision ? 'highp' : 'mediump';
const visibilityGLSL = `
  uniform vec4 uVision[3];
  uniform float uDusk;
  float visibility(vec2 pos) {
    float value = 0.0;
    for (int i=0; i<3; ++i) {
      vec4 eye = uVision[i];
      value = max(value, (1.0 - smoothstep(eye.z-3.5, eye.z, distance(pos, eye.xy))) * eye.w);
    }
    return value;
  }
  vec3 atmosphere(vec3 color, float visible) {
    vec3 sun = color * mix(vec3(1.055, 1.015, 0.94), vec3(0.93, 0.68, 0.64), uDusk);
    vec3 shade = sun * vec3(0.48, 0.55, 0.61) + vec3(0.043, 0.067, 0.073);
    return mix(shade, sun, visible);
  }`;
gl.attachShader(prog,shader(gl.VERTEX_SHADER,`
  attribute vec3 aP, aC; attribute float aSurface;
  uniform mat4 uVP; uniform vec2 uCartOffset; uniform float uSceneTime;
  varying mediump vec3 vC, vP; varying mediump float vSurface;
  void main(){ vec3 pos=aP+vec3(uCartOffset.x,0.,uCartOffset.y);
    if(aSurface>12.5 && aSurface<13.5){
      float beat=sin(uSceneTime*2.0+pos.x*.43+pos.z*.24);
      pos.x+=beat*.035;pos.y+=beat*.042;
    }
    if(aSurface>13.5&&aSurface<14.5){float sip=sin(uSceneTime*1.35+pos.x*.7+pos.z*.3);pos.y+=.046*sip;pos.z+=.018*sip;}
    if(aSurface>15.5&&aSurface<16.5){
      vec2 hub=vec2(.285,sign(aP.z)*.41),v=aP.yz-hub;float a=-uCartOffset.y/.225;
      pos.yz=hub+vec2(v.x*cos(a)-v.y*sin(a),v.x*sin(a)+v.y*cos(a))+vec2(0.,uCartOffset.y);
    }
    vP=pos;vC=aC;vSurface=aSurface;gl_Position=uVP*vec4(pos,1.0); }`));
gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,`
  precision ${fragmentPrecision} float;
  varying mediump vec3 vC, vP;
  varying mediump float vSurface;
  uniform sampler2D uGround,uMaterials,uSigns; uniform float uMarket;
  uniform vec2 uMapSize;
  uniform vec3 uPlayers[6];
  uniform float uTime, uRiver;
  ${visibilityGLSL}
  float cloudNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    float a=fract(sin(dot(i,vec2(37.1,71.7)))*728.31),b=fract(sin(dot(i+vec2(1,0),vec2(37.1,71.7)))*728.31);
    float c=fract(sin(dot(i+vec2(0,1),vec2(37.1,71.7)))*728.31),d=fract(sin(dot(i+1.,vec2(37.1,71.7)))*728.31);
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
  }
  void main(){
    if(vSurface>31.5){
      vec3 d=normalize(vP);float ht=clamp(d.y,0.,1.);
      vec3 sky=mix(vec3(.95,.83,.65),vec3(.36,.65,.76),smoothstep(-.025,.43,ht));
      vec2 field=d.xz/(.15+ht)*2.8;
      float clouds=.58*cloudNoise(field)+.29*cloudNoise(field*2.13)+.13*cloudNoise(field*4.21);
      sky=mix(sky,vec3(.98,.92,.82),.50*smoothstep(.49,.77,clouds)*smoothstep(.025,.17,ht));
      float sun=dot(d,normalize(vec3(-.55,.27,-.79)));
      sky+=vec3(.28,.16,.05)*pow(max(sun,0.),62.);
      sky=mix(sky,vec3(1.,.92,.73),smoothstep(.998,.999,sun));
      gl_FragColor=vec4(mix(sky,sky*vec3(.96,.72,.78),uDusk*.80),1.);return;
    }
    float ground = 1.0-smoothstep(0.29, 0.55, vP.y);
    vec3 color=vC;
    if(vSurface>29.5)color=texture2D(uSigns,vC.xy).rgb;
    if(vSurface>0.5&&vSurface<5.5){
      vec3 texel=texture2D(uMaterials,(vP.xz+vec2(vP.y*0.68,vP.y*0.28))*0.40).rgb-0.5;
      if(vSurface<1.5) color*=1.0+texel.r*0.64;
      else if(vSurface<2.5) color*=1.0+texel.g*0.56;
      else if(vSurface<3.5) color*=1.0+texel.b*0.56;
      else if(vSurface<4.5) color*=1.0+texel.g*0.24+texel.b*0.16;
      else color*=1.0+texel.r*0.34;
    }
    if(ground > 0.0) {
      vec2 uv=clamp(vP.xz / (2.0*uMapSize) + 0.5, 0.0, 1.0);
      vec3 atlas=texture2D(uGround,uv).rgb;
      float detail=atlas.r;
      if(vSurface>0.5 && vSurface<2.5 && vP.y<0.056){
        vec2 grain=texture2D(uMaterials,vP.xz*0.55).rg-0.5;
        float lane=smoothstep(0.02,0.98,atlas.g+grain.x*0.30);
        vec3 grass=vec3(0.50,0.62,0.375)*(1.0+grain.x*0.29);
        vec3 soil=vec3(0.765,0.671,0.507)*(1.0+grain.y*0.34);
        if(uMarket>.5){
          vec2 brick=vP.xz/vec2(1.02,.54);brick.x+=mod(floor(brick.y),2.)*.5;
          vec2 edge=min(fract(brick),1.-fract(brick));
          float joint=smoothstep(.012,.09,min(edge.x,edge.y));
          float varied=fract(sin(dot(floor(brick),vec2(7.91,3.47)))*274.8);
          float nearField=clamp(gl_FragCoord.w*24.,0.,1.);
          joint=mix(.91,joint,nearField);soil=mix(vec3(.646,.565,.478),mix(vec3(.695,.62,.52),vec3(.76,.675,.57),varied),joint);
          vec3 sidepath=mix(vec3(.655,.614,.528),vec3(.72,.664,.565),grain.y+.5);
          grass=mix(grass,sidepath*(.99+.045*varied),atlas.b);
          soil*=1.+grain.y*.13;
        }
        color=mix(grass,soil,lane);
      }
      color *= mix(1.0, detail*1.11, ground*(vP.y<0.08?1.0:0.40));
      float shadow=0.0;
      for(int i=0; i<6; ++i) {
        vec2 p=vP.xz-uPlayers[i].xy;
        vec2 d=vec2(dot(p,vec2(0.84,0.54)),dot(p,vec2(-0.54,0.84)));
        float castShadow=1.0-smoothstep(0.2,1.0,length((d-vec2(0.65,0.0))/vec2(1.27,0.38)));
        float contact=1.0-smoothstep(0.04,0.55,length(p));
        shadow=max(shadow, max(castShadow*0.31,contact*0.47)*uPlayers[i].z);
      }
      color *= 1.0-ground*shadow;
      if(uRiver>0.5 && abs(vP.x)<3.0 && abs(vP.y-0.0575)<0.003) {
        float ripple=sin(vP.z*7.0+vP.x*2.0+uTime*1.8+sin(vP.x*2.1-uTime*0.6));
        color += vec3(0.10,0.12,0.10)*smoothstep(0.76,1.0,ripple);
      }
    }
    gl_FragColor=vec4(atmosphere(color,visibility(vP.xz)),1.0);
  }`));

gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);gl.enable(gl.DEPTH_TEST);
const aSurface=gl.getAttribLocation(prog,'aSurface');
const aP=gl.getAttribLocation(prog,'aP'),aC=gl.getAttribLocation(prog,'aC'),uVP=gl.getUniformLocation(prog,'uVP'),uVision=gl.getUniformLocation(prog,'uVision[0]'),uDusk=gl.getUniformLocation(prog,'uDusk');
const staticBuffer=gl.createBuffer(),dynamicBuffer=gl.createBuffer();gl.enableVertexAttribArray(aP);gl.enableVertexAttribArray(aC);
const rgb=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
const C={grass:rgb('#6b9665'),lawn:rgb('#91b579'),path:rgb('#c7bc92'),light:rgb('#eee5c4'),wood:rgb('#987555'),dark:rgb('#304b41'),a:rgb('#2daca4'),b:rgb('#e17b5b'),roof:rgb('#b87257'),wall:rgb('#dfd1ab'),leaf:rgb('#477957'),leaf2:rgb('#6d9d66'),skin:rgb('#d5a57c'),hair:rgb('#403a34'),pants:rgb('#365b59'),shoe:rgb('#eee8d0'),shadow:rgb('#4f7352'),stone:rgb('#919f8a'),boost:rgb('#f5cd68'),energy:rgb('#86ded1'),fog:rgb('#1d3b35')};
let vertices=[];
const materialIds=new Map([[C.grass,1],[C.lawn,1],[C.path,2],[C.wood,3],[C.roof,4],[C.wall,4],[C.stone,4],[C.leaf,5],[C.leaf2,5]]);
// Food carts share their street fixtures, signage and animated materials across both teams.
const food = {
  black:rgb('#343a35'), steel:rgb('#a3b5b5'), rim:rgb('#e3e8df'), enamel:rgb('#fff1cc'),
  broth:rgb('#b87d3d'), meat:rgb('#bb8a63'), herbs:rgb('#579058'), glass:rgb('#90c8c1'),
  paving:rgb('#b3a28a'), apron:rgb('#f1e2c1'), steam:rgb('#eee4cc'),
  awnings:['#b44f37','#346f61','#cc963e','#415c71'].map(rgb),
  shells:['#638b79','#b47642','#8c4e3e','#536d77'].map(rgb)
};
materialIds.set(food.steam,12);
const stir=rgb('#bd865d');materialIds.set(stir,13);
const skyMaterial=[0,0,0];materialIds.set(skyMaterial,32);
const signSampler=gl.getUniformLocation(prog,'uSigns'),cartOffset=gl.getUniformLocation(prog,'uCartOffset');
const sceneTime=gl.getUniformLocation(prog,'uSceneTime'),marketUniform=gl.getUniformLocation(prog,'uMarket');
const rollingMeshes=[],vendorMeshes=[];
const rollingSpoke=rgb('#afbbba');materialIds.set(rollingSpoke,16);
const sipping=crowdTone=>{const tone=crowdTone.slice();materialIds.set(tone,14);return tone;};
function paintSigns(){
  const art=document.createElement('canvas');art.width=512;art.height=1024;
  const ctx=art.getContext('2d'),labels=['BASO URAT','BASO SAPI','BASO ACI','MIE BASO'];
  const colors=['#873e30','#275b4b','#8b561d','#354e60'];
  for(let i=0;i<4;i++){
    ctx.save();ctx.translate(0,i*256);ctx.fillStyle='#f2dfb2';ctx.fillRect(0,0,512,256);
    ctx.fillStyle=colors[i];ctx.fillRect(8,9,496,238);
    ctx.strokeStyle='#ddbc76';ctx.lineWidth=4;ctx.strokeRect(18,19,476,218);
    ctx.textAlign='center';ctx.fillStyle='#ffebbd';
    ctx.font='bold 27px sans-serif';ctx.fillText('•  G E R O B A K  •',256,67);
    ctx.font='bold 77px Georgia, serif';ctx.fillText(labels[i],256,153,450);
    ctx.fillRect(65,187,100,3);ctx.fillRect(347,187,100,3);
    ctx.font='italic 30px Georgia, serif';ctx.fillText('kuah hangat',256,198);
    ctx.restore();
  }
  const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,art);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(signSampler,2);gl.activeTexture(gl.TEXTURE0);
}
function signFace(x,y,z,w,h,style,side){
  const corners=[[-1,1,0,0],[1,1,1,0],[1,-1,1,1],[-1,-1,0,1]];
  for(const i of [0,1,2,0,2,3]){
    const [dx,dy,u,v]=corners[i];vertices.push(x+dx*w*.5*side,y+dy*h*.5,z,.01+.98*u,(style+.014+.972*v)/4,0,30);
  }
}
function place(x,z,yaw,build){
  const first=vertices.length,cs=Math.cos(yaw),sn=Math.sin(yaw);build();
  for(let i=first;i<vertices.length;i+=7){const xx=vertices[i],zz=vertices[i+2];vertices[i]=x+cs*xx+sn*zz;vertices[i+2]=z-sn*xx+cs*zz;}
}
function cartWheel(x,z,r){
  const y=.06+r,segments=14;
  for(let i=0;i<segments;i++){
    const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
    const rim=(d,t,side)=>[x+side*.055,y+Math.sin(t)*d,z+Math.cos(t)*d];
    for(const side of [-1,1]){
      const p=rim(r,a,side),q=rim(r,b,side),s=rim(r*.76,a,side),t=rim(r*.76,b,side);
      tri(p,s,t,food.black);tri(p,t,q,food.black);
    }
    const p=rim(r,a,-1),q=rim(r,b,-1),s=rim(r,a,1),t=rim(r,b,1);
    tri(p,s,t,food.black,.84);tri(p,t,q,food.black,.84);
    if(i%2===0)limb([x,y,z],rim(r*.79,a,0),.016,r<.26?rollingSpoke:food.steel);
  }
  box(x,y,z,.16,.105,.105,food.rim);
}
function bowl(x,y,z,r,full=false){
  cylinder(x,y+.063,z,r*.56,.115,food.enamel,10,r);
  cylinder(x,y+.127,z,r*.87,.014,full?food.broth:food.rim,10);
}
function soupCart(style,small=false){
  const paint=food.shells[style],stripe=food.awnings[style],r=small?.225:.31;
  const width=small?2.60:3.12,half=width*.5;
  for(const side of [-1,1])for(const end of [-1,1])cartWheel(side*(half-.09),end*.41,r);
  box(0,.63,0,width,.28,1.13,C.wood);box(0,1.02,0,width-.11,.67,1.12,paint);
  box(0,1.39,0,width+.1,.11,1.28,food.steel);
  for(const s of [-1,1]){box(0,.74,s*.58,width,.08,.045,C.wood);box(0,1.25,s*.58,width-.12,.046,.055,food.rim);}
  const signW=small?1.55:1.83;
  for(const side of [-1,1])signFace(0,1.02,side*.566,signW,.43,style,side);
  // Open-sided cabinet with a tinted back pane, front mullions and shelves.
  const cx=-half+.57;
  box(cx,1.88,-.42,.93,.82,.025,food.glass);
  for(const s of [-1,1])for(const t of [-1,1])box(cx+s*.48,1.88,t*.42,.047,.92,.047,food.rim);
  box(cx,2.34,0,1.10,.08,.96,paint);box(cx,1.88,0,.97,.04,.80,food.steel);
  for(const y of [1.51,1.98])for(let i=0;i<5;i++)
    ellipsoid(cx-.33+(i%3)*.27,y+(i>2?.065:0),-.15+Math.floor(i/3)*.25,.115,.105,.105,food.meat,0,6,3);
  const potX=small?.55:.74;
  cylinder(potX,1.63,.01,.36,.45,food.steel,14,.39);cylinder(potX,1.866,.01,.405,.064,food.rim,14);
  cylinder(potX,1.901,.01,.345,.017,food.broth,14);
  for(let i=0;i<4;i++)ellipsoid(potX+Math.cos(i*1.7)*.19,1.928,.01+Math.sin(i*1.7)*.16,.088,.072,.086,food.meat,0,6,3);
  for(const side of [-1,1])box(potX+side*.406,1.67,.01,.16,.058,.105,food.black);
  limb([potX+.11,1.90,.12],[potX+.23,2.2,.25],.024,C.wood);
  bowl(.06,1.45,.31,.19,true);
  for(let i=0;i<3;i++)bowl(half-.23,1.45+i*.057,-.31,.16);
  for(let i=0;i<2;i++){const x=-.04+i*.21;cylinder(x,1.64,-.29,.073,.39,i?food.broth:C.b,7);cylinder(x,1.86,-.29,.045,.09,food.enamel,6);}
  if(!small){
    for(const s of [-1,1])box(s*(half-.14),2.15,-.34,.066,1.50,.066,C.wood);
    if(style%2===0){
      const tip=2.98;
      for(let i=0;i<9;i++){
        const x=-half-.11+(i+.5)*(width+.22)/9,c=i%2?food.enamel:stripe;
        box(x,tip,-.02,(width+.22)/9,.07,1.86,c,0,.12);
        box(x,tip-.17,.89,(width+.22)/9,.18,.05,c);
      }
    }else{
      cylinder(0,2.67,-.37,.048,1.15,C.wood,7);
      const n=12;
      for(let i=0;i<n;i++){
        const a=2*Math.PI*i/n,b=2*Math.PI*(i+1)/n;
        const p=[1.92*Math.cos(a),2.71,-.12+1.25*Math.sin(a)],q=[1.92*Math.cos(b),2.71,-.12+1.25*Math.sin(b)],tip=[0,3.38,-.12];
        const color=i%2?food.enamel:stripe;tri(p,q,tip,color,.92+.07*Math.cos(a));
        tri(p,q,[(p[0]+q[0])*.5,2.59,(p[2]+q[2])*.5],color,.86);
      }
    }
    for(const side of [-1,1])signFace(0,2.48,side*.40,1.85,.52,style,side);
    box(0,2.48,0,1.89,.55,.77,C.wood);
  }
}
const crowdSkin=['#c78c63','#ad7754','#d59f72','#a87251'].map(rgb);
const bowlHands=crowdSkin.map(sipping);
const crowdShirts=['#b77742','#728d81','#786178','#b47a59','#687d92'].map(rgb);
function resident(x,z,yaw,index,seller,customerBowl=false){
  place(x,z,yaw,()=>{
    const skin=crowdSkin[index%4],shirt=crowdShirts[index%5],apron=food.apron;
    const hip=.81,offset=index%2?.045:-.035;
    for(const s of [-1,1]){
      const foot=[s*.134,.12,s*offset];
      limb([s*.13,hip,0],foot,.091,C.pants);ellipsoid(foot[0],.085,foot[2]+.045,.11,.071,.18,C.hair,0,7,4);
    }
    ellipsoid(0,1.065,0,.266,.36,.16,shirt,0,8,5);
    cylinder(0,1.445,0,.080,.18,skin,8);
    ellipsoid(0,1.625,.018,.172,.215,.17,skin,0,9,5);ellipsoid(0,1.749,-.002,.182,.12,.174,C.hair,0,9,5);
    for(const e of [-1,1])ellipsoid(e*.059,1.645,.172,.016,.014,.01,food.black,0,6,3);
    if(seller){box(0,1.03,.145,.32,.52,.036,apron);box(0,.848,.169,.19,.098,.025,C.wood);
      if(index%2){cylinder(0,1.77,0,.189,.14,C.wood,9,.164);box(0,1.73,.14,.25,.032,.11,C.wood);}
      else{box(0,1.36,.138,.18,.049,.044,apron);}
    }else if(index%3===1)ellipsoid(0,1.58,-.145,.14,.17,.099,C.hair,0,8,4);
    for(const s of [-1,1]){
      const elbow=[s*.31,1.055,.06],hand=[s*(seller?.245:.21),seller?1.26:customerBowl?1.17:.95,seller?.42:customerBowl?.28:.13];
      limb([s*.228,1.30,0],elbow,.087,shirt);const eating=!seller&&customerBowl&&s===1;
      if(eating){hand[0]=.085;hand[1]=1.47;hand[2]=.27;}
      const handColor=seller&&s===1?stir:eating?bowlHands[index%4]:skin;
      limb(elbow,hand,.058,handColor);ellipsoid(...hand,.069,.071,.067,handColor,0,6,4);
    }
    if(seller){
      const metal=food.rim;
      limb([.25,1.26,.42],[.25,1.55,.64],.019,stir);ellipsoid(.25,1.55,.66,.066,.027,.075,metal,0,7,3);
    }else if(customerBowl)bowl(.10,1.13,.30,.18,true);
  });
}
function parkedVendor(o){
  const style=o.style,stretch=o.facing;
  place(o.x,o.z,o.yaw,()=>{
    soupCart(style);
    resident(-.35,-.99,0,style+1,true);
    resident(.64,1.27,Math.PI-.16,style+2,false,true);
    if(o.crowd)resident(-.62,1.32,Math.PI+.32,style+4,false);
    if(stretch){cylinder(-1.76,.31,.78,.23,.14,food.awnings[style],9);for(const s of [-1,1])box(-1.76+s*.13,.15,.78,.055,.27,.23,C.wood);}
  });
}
function makeRollingMeshes(){
  if(rollingMeshes.length)return;
  for(const style of [0,1]){
    const previous=vertices;vertices=[];soupCart(style,true);
    resident(-.20,-.67,.12,style+2,true);
    const data=new Float32Array(vertices);vertices=previous;
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    rollingMeshes.push({buffer,count:data.length/7});
  }
}
function rebuildVendorMeshes(){
  for(const v of vendorMeshes)gl.deleteBuffer(v.buffer);
  vendorMeshes.length=0;
  for(const o of obstacles){
    if(o.type!=='vendor')continue;
    const world=vertices;vertices=[];parkedVendor(o);
    const data=new Float32Array(vertices);vertices=world;
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    vendorMeshes.push({x:o.x,z:o.z,buffer,count:data.length/7});
  }
}
function drawVendorMeshes(){
  if(!vendorMeshes.length)return;
  // Test a sphere enclosing the counter, canopy and waiting customers against each frustum plane.
  const planes=[];
  for(let axis=0;axis<3;axis++)for(const side of [-1,1]){
    const x=vp[3]+side*vp[axis],y=vp[7]+side*vp[axis+4],z=vp[11]+side*vp[axis+8];
    planes.push([x,z,1.6*y+vp[15]+side*vp[axis+12]+4.3*Math.hypot(x,y,z)]);
  }
  for(const v of vendorMeshes)if(planes.every(([x,z,d])=>x*v.x+z*v.z+d>=0))renderBuffer(v.buffer,null,v.count);
}
function drawRollingCarts(carts){
  if(!carts.length)return;
  for(const [i,c] of carts.entries()){
    gl.uniform2f(cartOffset,c.x,c.z);renderBuffer(rollingMeshes[i].buffer,null,rollingMeshes[i].count);
  }
  gl.uniform2f(cartOffset,0,0);
}
function steamFromPot(x,z,t){
  // Two short curling ribbons lift from the soup. The far end tapers to a thread.
  for(let j=0;j<2;j++)for(let i=0;i<6;i++){
    const corner=(n,edge)=>{
      const h=n/6,phase=t*1.75+j*2.7+h*4.5+x*.17,w=.034*Math.sin(Math.PI*(.07+.90*h));
      return [x+j*.075+Math.sin(phase)*(.023+.14*h)+edge*w,1.97+h*.78,z+Math.cos(phase*.94)*(.026+.047*h)];
    };
    const a=corner(i,-1),b=corner(i,1),c=corner(i+1,1),d=corner(i+1,-1);
    tri(a,b,c,food.steam);tri(a,c,d,food.steam);
  }
}
function marketSteam(carts,t){
  if(mapId!=='pasar'||reducedMotion)return;
  for(const o of obstacles){if(o.type!=='vendor'||(screen!=='home'&&Math.hypot(o.x-camX,o.z-camZ)>24))continue;
    steamFromPot(o.x+.74*Math.cos(o.yaw),o.z-.74*Math.sin(o.yaw),t);}
  for(const c of carts)steamFromPot(c.x+.55,c.z,t);
}
function marketFrontages(){
  const plaster=['#ecd3a2','#b8c4a4','#d2a386','#cac4aa'].map(rgb);
  const tile=['#a5604b','#886252','#a37251','#83796a'].map(rgb);
  // Low shophouses frame the walking street beyond the playing boundary.
  for(const side of [-1,1])for(let k=0;k<8;k++){
    const x=-44+k*12.6,z=side*(MAP.z+6+(k%3)*.65);
    place(x,z,side<0?0:Math.PI,()=>{
      const h=3.3+.32*(k%3),w=8.3+(k%2)*1.35,c=plaster[k%4];
      box(0,h*.5,0,w,h,4.5,c);box(0,h+.19,0,w+.52,.24,5.1,tile[k%4],0,.16);
      for(const post of [-1,0,1])box(post*(w*.46),h*.5,2.32,.18,h,.17,C.wood);
      for(const j of [-1,1]){const xx=j*w*.231;
        box(xx,1.10,2.28,w*.40,2.20,.11,food.shells[(k+1)%4]);
        for(let slat=0;slat<5;slat++)box(xx,.31+slat*.38,2.35,w*.395,.027,.02,C.wood);
        box(xx,2.70,2.30,w*.37,.40,.12,C.light);}
      box(0,2.45,2.88,w+.25,.11,1.30,food.awnings[k%4],0,.18);
    });
  }
}
function distantLandscape(){
  // A shallow dome stays outside the playable grounds.
  const r=109,n=36;
  for(let i=0;i<n;i++)for(let j=0;j<8;j++){
    const point=(k,m)=>{const a=k/n*2*Math.PI,h=m/8*Math.PI*.5;
      return [Math.cos(a)*Math.cos(h)*r,Math.sin(h)*r-1,Math.sin(a)*Math.cos(h)*r];};
    tri(point(i,j),point(i+1,j),point(i+1,j+1),skyMaterial);
    tri(point(i,j),point(i+1,j+1),point(i,j+1),skyMaterial);
  }
  for(let k=0;k<2;k++){
    const ridge=r-9-k*8,base=k?rgb('#819b86'):rgb('#93a8a0');
    const point=i=>{const a=i/64*2*Math.PI;
      const h=4.1+1.8*Math.sin(a*5+.7*k)+1.85*Math.sin(a*3.0+2*k)+.64*Math.sin(a*11+k);
      return [Math.cos(a)*ridge,h+(k?0:3.4),Math.sin(a)*ridge];};
    for(let i=0;i<64;i++){const a=point(i),b=point(i+1),lo=[a[0],-.6,a[2]],end=[b[0],-.6,b[2]];
      tri(a,b,lo,base);tri(b,end,lo,base);}
  }
}
function banana(x,z,s,phase){
  const stem=rgb('#a6a168'),leaf=rgb('#54885d'),light=rgb('#79a65e');
  cylinder(x,.93*s,z,.14*s,1.85*s,stem,8,.105*s);
  for(let i=0;i<7;i++){
    const a=phase+i*2.40,len=s*(1.04+.16*(i%3)),dx=Math.cos(a),dz=Math.sin(a);
    const pt=(t,b)=>{const width=Math.sin(Math.PI*t)*.23*s*b;
      return [x+t*len*dx-width*dz,s*(1.66+.85*Math.sin(t*2.65)-.28*t)+.08*s*(1-Math.abs(b)),z+t*len*dz+width*dx];};
    for(let j=0;j<5;j++)for(const b of [-1,1]){
      const q=j/5,r=(j+1)/5;tri(pt(q,0),pt(q,b),pt(r,b),b<0?leaf:light);tri(pt(q,0),pt(r,b),pt(r,0),b<0?leaf:light);
    }
  }
}

function tri(a,b,c,col,shade=1){
  const material=materialIds.get(col)||0;
  for(const point of [a,b,c])vertices.push(point[0],point[1],point[2],col[0]*shade,col[1]*shade,col[2]*shade,material);
}
function box(x,y,z,w,h,d,col,yaw=0,pitch=0,roll=0){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);const v=[];for(const [sx,syy,sz]of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]){let xx=sx*w*.5,yy=syy*h*.5,zz=sz*d*.5;const y2=yy*cp-zz*sp,z2=yy*sp+zz*cp,x2=xx*cr-y2*sr,y3=xx*sr+y2*cr;v.push([x+x2*cy+z2*sy,y+y3,z-x2*sy+z2*cy]);}for(const [a,b,c,d,s]of [[0,1,2,3,.76],[5,4,7,6,.94],[4,0,3,7,.82],[1,5,6,2,.9],[3,2,6,7,1.05],[4,5,1,0,.68]]){tri(v[a],v[b],v[c],col,s);tri(v[a],v[c],v[d],col,s);}}
function cylinder(x,y,z,r,h,col,n=12,rt=r){for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,A=[x+Math.cos(a)*r,y-h/2,z+Math.sin(a)*r],B=[x+Math.cos(b)*r,y-h/2,z+Math.sin(b)*r],D=[x+Math.cos(a)*rt,y+h/2,z+Math.sin(a)*rt],E=[x+Math.cos(b)*rt,y+h/2,z+Math.sin(b)*rt];const s=.85+Math.cos(a-.8)*.15;tri(A,B,E,col,s);tri(A,E,D,col,s);tri([x,y+h/2,z],D,E,col,1.04);}}
function ring(x,z,r,col,width=.08,y=.04){for(let i=0;i<32;i++){const a=i*Math.PI/16,b=(i+1)*Math.PI/16,p=(q,r)=>[x+Math.cos(q)*r,y,z+Math.sin(q)*r];tri(p(a,r),p(b,r),p(b,r-width),col);tri(p(a,r),p(b,r-width),p(a,r-width),col);}}
function house(x,z,w,depth){box(x,1.15,z,w,2.3,depth,C.wall);box(x,.12,z,w+.24,.24,depth+.24,C.stone);const y=2.3,h=1.5,A=[x-w*.59,y,z-depth*.63],B=[x+w*.59,y,z-depth*.63],D=[x,y+h,z-depth*.63],a=[x-w*.59,y,z+depth*.63],b=[x+w*.59,y,z+depth*.63],d=[x,y+h,z+depth*.63];tri(A,B,D,C.roof,.83);tri(a,d,b,C.roof,.93);tri(A,D,d,C.roof,1.04);tri(A,d,a,C.roof,1.04);tri(D,B,b,C.roof,.8);tri(D,b,d,C.roof,.8);box(x,.82,z+depth/2+.05,.78,1.5,.08,C.wood);for(const sign of [-1,1])box(x+sign*w*.3,1.3,z+depth/2+.05,.6,.7,.06,C.a);}
function ellipsoid(x,y,z,rx,ry,rz,col,yaw=0,n=10,bands=6){const cs=Math.cos(yaw),sn=Math.sin(yaw),p=(a,b)=>{const xx=Math.sin(a)*Math.cos(b)*rx,zz=Math.sin(a)*Math.sin(b)*rz;return [x+xx*cs+zz*sn,y+Math.cos(a)*ry,z-xx*sn+zz*cs];};for(let j=0;j<bands;j++)for(let i=0;i<n;i++){const a=j/bands*Math.PI,b=(j+1)/bands*Math.PI,u=i/n*Math.PI*2,v=(i+1)/n*Math.PI*2,s=.8+.19*Math.cos(a)+.08*Math.cos(u-.7);tri(p(a,u),p(b,u),p(b,v),col,s);tri(p(a,u),p(b,v),p(a,v),col,s);}}
function limb(a,b,r,col){const up=norm(b.map((v,i)=>v-a[i])),t=Math.abs(up[1])<.95?[0,1,0]:[1,0,0],side=norm(cross(up,t)),front=cross(up,side);for(let i=0;i<8;i++){const u=i*Math.PI/4,v=(i+1)*Math.PI/4,pt=(o,k)=>o.map((c,j)=>c+r*(side[j]*Math.cos(k)+front[j]*Math.sin(k)));tri(pt(a,u),pt(b,u),pt(b,v),col,.87+Math.sin(u)*.1);tri(pt(a,u),pt(b,v),pt(a,v),col,.87+Math.sin(u)*.1);}}
function tree(x,z,s=1){groveTree(x,z,s);}
function pot(x,z){cylinder(x,.22,z,.2,.42,rgb('#b7774d'),8,.29);cylinder(x,.5,z,.06,.3,C.leaf,6);for(let i=0;i<4;i++){const a=i*Math.PI/2;ellipsoid(x+Math.sin(a)*.14,.58,z+Math.cos(a)*.14,.19,.06,.12,C.leaf2,a,6,3);}}
function clothesline(x,z){for(const s of [-1,1])cylinder(x+s*2,1.25,z,.07,2.5,C.wood,6);box(x,2.3,z,4.1,.025,.025,C.light);for(let i=0;i<4;i++){const c=[C.light,C.a,C.b,C.boost][i],xx=x-1.45+i*.95;box(xx,1.88,z,.57,.72,.045,c);box(xx,2.11,z,.88,.17,.045,c);}}
function stall(x,z,w=4.6,d=3.2,kind='stall'){const col=kind==='ronda'?C.roof:C.a;for(const sx of [-1,1])for(const sz of [-1,1])box(x+sx*(w*.45),1.4,z+sz*d*.4,.11,2.8,.11,C.wood);box(x,.14,z,w,.28,d,C.wood);for(let i=0;i<8;i++)box(x-w*.55+(i+.5)*w*1.1/8,2.77,z,w*1.1/8,.1,d*1.25,i%2?C.light:col,0,.12);box(x,1.0,z+d*.32,w*.9,.12,.65,C.wood);if(kind==='ronda'){box(x-.8,.65,z,1.4,.13,.6,C.wood);cylinder(x+.8,1.64,z,.14,.8,C.wood,8);box(x+.8,1.64,z+.14,.035,.53,.035,C.dark);}else{for(let i=0;i<8;i++)ellipsoid(x-w*.36+i*w*.1,1.2,z+d*.32,.16,.18,.14,i%2?C.boost:C.b,0,7,4);box(x,.6,z-d*.22,1.2,.9,.8,C.wood);}}
function bunting(x,z,w=7){for(const s of [-1,1])cylinder(x+s*w/2,2,z,.06,4,C.wood,6);box(x,3.7,z,w,.025,.025,C.light);for(let i=0;i<9;i++){const xx=x-w/2+(i+.2)*w/9;tri([xx,3.7,z],[xx+w/12,3.7,z],[xx+w/24,3.05,z],i%3===0?C.b:i%3===1?C.light:C.boost);}}
const MAP={x:48,z:32,lane:22,theme:'kampung'},bases=[{x:-39,z:0},{x:39,z:0}],jails=[{x:38,z:10},{x:-38,z:-10}],obstacles=[],bushes=[],pickups=[],roads=[],water=[],bridges=[],fields=[],landmarks=[];
function scenery(){box(0,-.25,0,240,.4,240,C.grass);box(0,-.035,0,MAP.x*2,.07,MAP.z*2,C.lawn);for(const r of roads)box(r.x,.025,r.z,r.w,.025,r.d,C.path);
  for(const f of fields){box(f.x,.036,f.z,f.w,.04,f.d,rgb('#749351'));for(let i=0;i<12;i++)box(f.x-f.w/2+(i+.5)*f.w/12,.14,f.z,.15,.21,f.d-.6,rgb('#a3be58'));}
  for(const r of water){box(r.x,.04,r.z,r.w,.035,r.d,rgb('#76a9ae'));}
  for(const b of bridges){box(b.x,.12,b.z,b.w,.18,b.d,C.wood);for(let x=-3.3;x<3.6;x+=.48)box(x,.23,b.z,.4,.045,b.d,C.light);for(const s of [-1,1]){box(0,.85,b.z+s*3.4,7,.09,.09,C.wood);for(const x of [-3,0,3])box(x,.5,b.z+s*3.4,.1,1,.1,C.wood);}}
  for(const o of obstacles){if(o.type==='water')continue;if(o.type==='house'){house(o.x,o.z,o.w,o.d);box(o.x,.18,o.z+o.d/2+.4,1.5,.22,.8,C.stone);box(o.x,.7,o.z+o.d/2+.55,1.7,.11,.55,C.wood);pot(o.x+o.w*.44,o.z+o.d*.65);pot(o.x-o.w*.44,o.z+o.d*.65);for(const s of [-1,1]){box(o.x+s*o.w*.3,1.3,o.z+o.d/2+.09,.73,.85,.04,C.light);box(o.x+s*o.w*.3,1.3,o.z+o.d/2+.12,.5,.6,.045,C.a);box(o.x+s*o.w*.3,1.3,o.z+o.d/2+.15,.045,.6,.02,C.light);}if(mapId==='kampung')clothesline(o.x,o.z-o.d*.7);}else if(o.type==='vendor')continue;else if(o.type==='stall'||o.type==='ronda')stall(o.x,o.z,o.w,o.d,o.type);else if(o.type==='tree')tree(o.x,o.z,1.9);else if(o.type==='rock')ellipsoid(o.x,.65,o.z,o.w*.55,.8,o.d*.55,C.stone,.2,7,4);else{box(o.x,.65,o.z,o.w,1.3,o.d,C.stone);box(o.x,1.36,o.z,o.w+.12,.12,o.d+.12,C.light);}}
  for(const b of bushes){for(let i=0;i<7;i++){const x=b.x+Math.sin(i*19+1)*b.w*.32,z=b.z+Math.cos(i*13+2)*b.d*.3;ellipsoid(x,.58,z,b.w*.28,.6,b.d*.32,i%2?C.leaf:C.leaf2,0,7,4);}}
  bases.forEach((b,i)=>{const c=i?C.b:C.a;cylinder(b.x,.065,b.z,3.3,.11,i?rgb('#bda079'):rgb('#b4a17a'),40);ring(b.x,b.z,3.06,C.light,.052,.124);ring(b.x,b.z,1.3,c,.055,.126);
    cylinder(b.x,.18,b.z,.38,.33,C.stone,12,.30);
    const bamboo=rgb('#ac8f55'),joint=rgb('#736344');
    cylinder(b.x,2.1,b.z,.135,4.2,bamboo,12,.10);
    for(let k=1;k<=10;k++){const y=.20+k*.345;cylinder(b.x,y,b.z,.146-k*.003,.032,joint,12);}
    for(let k=0;k<3;k++)cylinder(b.x,1.12+k*.085,b.z,.144,.065,c,12);bunting(b.x-1,b.z-6,7);});
  jails.forEach((b,i)=>{ring(b.x,b.z,1.8,i?C.b:C.a,.1);box(b.x,.36,b.z+1.8,3.4,.14,.5,C.wood);for(const x of [-1.5,1.5])box(b.x+x,.14,b.z+1.8,.12,.28,.4,C.wood);});
  for(const z of [-MAP.z+1,MAP.z-1])for(let x=-MAP.x+2;x<MAP.x-1;x+=3){box(x,.55,z,.11,1.1,.11,C.wood);box(x+1.5,.72,z,3,.08,.08,C.wood);box(x+1.5,.36,z,3,.07,.08,C.wood);}for(const x of [-MAP.x+1,MAP.x-1])for(let z=-MAP.z+1;z<MAP.z;z+=3){box(x,.55,z,.11,1.1,.11,C.wood);box(x,.65,z+1.5,.08,.08,3,C.wood);}
  const planting=mapRandom(1071+MAP.x);
  for(let x=-MAP.x;x<MAP.x;x+=6){
    for(const side of [-1,1]){const offset=(planting()-.5)*2.8;
      tree(x+offset,side*(MAP.z+3+planting()*3),.88+planting()*.58);}
  }
  for(const side of [-1,1]){
    banana(side*(MAP.x-1),side*(MAP.z-3),1.15,side*.4);
    if(mapId==='kampung')banana(side*22+2.35,side*10-1.42,.92,side*.7);
    if(mapId==='sawah')banana(side*32+2.08,side*11+1.52,1.05,side*.3);
  }
  distantLandscape();for(const s of [-1,1]){for(let z=-MAP.z;z<MAP.z;z+=8)tree(s*(MAP.x+3),z,1.25);tree(s*(MAP.x-4),s*18,.95);if(mapId!=='sawah')tree(s*4,-s*26,1.1);const x=s*(MAP.x-5);cylinder(x,2,-5,.06,4,C.wood,7);box(x+.47,3.7,-5,.85,.28,.035,C.b);box(x+.47,3.42,-5,.85,.28,.035,C.light);}
  if(mapId==='pasar'){
    marketFrontages();
    for(const sx of [-1,1]){
      for(const dx of [12,30]){
        const x=sx*dx,z1=-6.5,z2=7.2;
        for(const z of [z1,z2])cylinder(x,2.48,z,.064,4.9,C.wood,7);
        for(let i=0;i<12;i++){
          const at=j=>[x,4.88-.72*Math.sin(j/12*Math.PI),z1+(z2-z1)*j/12];
          const a=at(i),b=at(i+1);limb(a,b,.021,food.black);
          if(i%2){cylinder(a[0],a[1]-.095,a[2],.028,.16,food.black,6);ellipsoid(a[0],a[1]-.22,a[2],.072,.096,.072,food.enamel,0,6,3);}
        }
      }
    }
  }else if(mapId==='kampung'){for(const s of [-1,1]){box(s*36,.57,5.4,1.6,1.1,.8,C.wood);cylinder(s*36,.15,5.4,.36,.2,C.dark,10);}}
}
// This small baked texture covers the arena. Geometry and collision remain in world units.
const groundTexture = gl.createTexture();
const groundUniform = {
  size: gl.getUniformLocation(prog,'uMapSize'), time: gl.getUniformLocation(prog,'uTime'),
  river: gl.getUniformLocation(prog,'uRiver'), players: gl.getUniformLocation(prog,'uPlayers[0]')
};
function mapRandom(seed) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}
function bakeGround() {
  const sheet=document.createElement('canvas');
  sheet.width=1024; sheet.height=1024;
  const brush=sheet.getContext('2d');
  const rand=mapRandom(47381 + MAP.x);
  brush.fillStyle='#ededed'; brush.fillRect(0,0,1024,1024);
  brush.setTransform(512/MAP.x,0,0,512/MAP.z,512,512);
  function patch(x,z,rx,rz,angle,opacity) {
    brush.save(); brush.translate(x,z); brush.rotate(angle); brush.scale(rx,rz);
    const fade=brush.createRadialGradient(0,0,0,0,0,1);
    fade.addColorStop(0,'rgba(32,32,32,'+opacity+')'); fade.addColorStop(0.65,'rgba(45,45,45,'+opacity*.6+')');
    fade.addColorStop(1,'rgba(45,45,45,0)'); brush.fillStyle=fade;brush.fillRect(-1,-1,2,2);
    brush.restore();
  }
  for(let i=0;i<220;i++)patch((rand()*2-1)*MAP.x,(rand()*2-1)*MAP.z,1+rand()*5,1+rand()*2,rand()*3,.04+rand()*.1);
  for(const road of roads){
    const horizontal=road.w>road.d;
    brush.save();brush.translate(road.x,road.z);if(!horizontal)brush.rotate(Math.PI/2);
    const length=horizontal?road.w:road.d, halfWidth=(horizontal?road.d:road.w)/2;
    for(const side of [-1,1]) {
      brush.strokeStyle='rgba(93,93,93,.17)';brush.lineWidth=.16;brush.beginPath();
      for(let t=-length/2;t<=length/2;t+=.5){
        const lane=side*halfWidth*.49+.14*Math.sin(t*.37)+.08*Math.cos(t*.81);
        if(t===-length/2)brush.moveTo(t,lane);else brush.lineTo(t,lane);
      }
      brush.stroke();
    }
    brush.restore();
  }
  brush.fillStyle='rgba(50,50,50,.18)';
  for(let i=0;i<8200;i++)brush.fillRect((rand()*2-1)*MAP.x,(rand()*2-1)*MAP.z,.025+rand()*.15,.045+rand()*.10);
  for(const o of obstacles) {
    if(o.type==='water') continue;
    if(o.type==='vendor'){
      patch(o.x+.56,o.z+.48,2.25,1.22,o.yaw+.14,.55);
      for(const offset of [-1.02,1.23]){const xx=o.x+Math.sin(o.yaw)*offset,zz=o.z+Math.cos(o.yaw)*offset;
        patch(xx+.36,zz+.25,.85,.32,.46,.72);patch(xx,zz,.28,.22,0,.64);}
      continue;
    }
    const treeShadow=o.type==='tree';
    patch(o.x+1.1,o.z+.65,o.w*.65+1.5,o.d*.58+.8,.16,treeShadow?.64:.56);
    if(!treeShadow){
      brush.fillStyle='rgba(52,52,52,.21)';
      brush.beginPath(); const w=o.w*.52,d=o.d*.52,ex=o.type==='house'?2.35:1.2;
      const points=[[-w,-d],[w,-d],[w+ex,-d+ex*.57],[w+ex,d+ex*.57],[-w+ex,d+ex*.57],[-w,d]];
      for(let i=0;i<points.length;i++){const [x,z]=points[i];if(!i)brush.moveTo(o.x+x,o.z+z);else brush.lineTo(o.x+x,o.z+z);}
      brush.closePath();brush.fill();
    }
  }
  for(const b of bushes)patch(b.x+.55,b.z+.3,b.w*.66,b.d*.63,.12,.5);
  for(const b of bases)patch(b.x+1.45,b.z+.8,2.15,.24,.49,.54);
  // Store the connected dirt lanes in the green channel. Each lane feathers into grass.
  const mask=document.createElement('canvas');mask.width=sheet.width;mask.height=sheet.height;
  const paint=mask.getContext('2d');
  paint.fillStyle='#000';paint.fillRect(0,0,mask.width,mask.height);
  paint.setTransform(512/MAP.x,0,0,512/MAP.z,512,512);paint.lineJoin='round';paint.lineCap='round';
  for(const road of roads){
    const flat=road.w>road.d,len=flat?road.w:road.d,span=flat?road.d:road.w;
    const path=new Path2D();
    for(let d=-len/2+span*.43;d<len/2-span*.43+.01;d+=.45){
      const bend=.12*Math.sin(d*.46+road.x)+.085*Math.sin(d*1.23+road.z);
      const x=road.x+(flat?d:bend),z=road.z+(flat?bend:d);
      if(d<=-len/2+span*.43)path.moveTo(x,z);else path.lineTo(x,z);
    }
    paint.globalCompositeOperation='lighten';
    for(const [extra,tone] of [[.45,37],[.25,86],[.09,142],[-.1,201],[-.36,255]]){
      paint.strokeStyle='rgb('+tone+','+tone+','+tone+')';paint.lineWidth=span+extra;paint.stroke(path);
    }
  }
  const surface=brush.getImageData(0,0,sheet.width,sheet.height),lanes=paint.getImageData(0,0,sheet.width,sheet.height).data;
  // A worn, continuous pedestrian apron wraps around the carts on both sides.
  let pavement=null;
  if(mapId==='pasar'){
    const pave=document.createElement('canvas');pave.width=pave.height=1024;
    const g=pave.getContext('2d');g.setTransform(512/MAP.x,0,0,512/MAP.z,512,512);
    g.fillStyle='#000';g.fillRect(-MAP.x,-MAP.z,2*MAP.x,2*MAP.z);
    function edge(x,side){return side*(8.1+1.1*Math.sin(x*.18+side)+.55*Math.sin(x*.48));}
    for(const [extra,color] of [[1.1,'#424242'],[.67,'#969696'],[.25,'#e8e8e8'],[0,'#fff']]){
      g.fillStyle=color;g.beginPath();
      for(const sign of [1,-1])for(let i=0;i<=87;i++){
        const x=sign*((i-43.5)*1.04);const z=edge(x,sign)+sign*extra;
        if(sign===1&&i===0)g.moveTo(x,z);else g.lineTo(x,z);}
      g.closePath();g.fill();
      g.strokeStyle=color;g.lineCap='round';
      for(const cart of obstacles.filter(o=>o.type==='vendor')){
        g.lineWidth=6.9+2*extra;g.beginPath();g.moveTo(cart.x+1,cart.z);g.quadraticCurveTo(cart.x+1.5,cart.z*.7,cart.x+2.8,cart.z*.38);g.stroke();
      }
    }
    pavement=g.getImageData(0,0,1024,1024).data;
  }
  for(let i=0;i<surface.data.length;i+=4){surface.data[i+1]=lanes[i];if(pavement)surface.data[i+2]=pavement[i];}
  brush.putImageData(surface,0,0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,groundTexture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sheet); gl.generateMipmap(gl.TEXTURE_2D);
}
function addFieldDetails(){
  const random=mapRandom(181+MAP.x), greens=[rgb('#82954e'),rgb('#a4ac60'),rgb('#80934c')];
  for(const field of fields)for(let i=0;i<165;i++){
    const x=field.x+(random()-.5)*(field.w-.4),z=field.z+(random()-.5)*(field.d-.4),h=.24+.24*random();
    tri([x-.045,.12,z],[x+.045,.12,z],[x+.11,h,z-.025],greens[i%3]);
    tri([x,.12,z-.04],[x,.12,z+.04],[x-.09,h*.83,z+.08],greens[(i+1)%3]);
  }
  for(const b of bushes)for(let i=0;i<19;i++){
    const x=b.x+(random()-.5)*b.w*1.12,z=b.z+(random()-.5)*b.d*1.16;
    tri([x-.055,.018,z],[x+.055,.018,z],[x+.08,.23+random()*.17,z-.05],greens[i%3]);
  }
  const tile=rgb('#a76348'),timber=rgb('#885e43');
  for(const o of obstacles.filter(o=>o.type==='house')){
    const eave=o.w*.59,halfDepth=o.d*.63;
    for(const side of [-1,1]){
      for(let i=1;i<=6;i++){
        const u=i/7;
        box(o.x+side*eave*u,3.82-1.5*u,o.z,.065,.046,halfDepth*2+.04,tile);
      }
      for(const end of [-1,1])box(o.x+side*(o.w*.49),1.16,o.z+end*o.d*.49,.13,2.25,.13,timber);
    }
    box(o.x,3.82,o.z,.13,.13,halfDepth*2+.1,tile);
  }
}
function wavingFlags(time){
  for(let index=0;index<bases.length;index++){
    const base=bases[index];
    for(let i=0;i<7;i++){
      const corner=(j,height)=>{
        const t=j/7;
        return [base.x+.13+1.38*t,3.99+height-.13*t*t,base.z+t*(.12*Math.sin(time*3.6-t*6+index)+.08*Math.sin(time*2.1-t*3.2))];
      };
      const top=corner(i,0),next=corner(i+1,0),low=corner(i,-.72),end=corner(i+1,-.72);
      const color=i===0?C.light:(index?C.b:C.a);
      tri(top,low,end,color,.97);tri(top,end,next,color,1.03);
    }
  }
}

// Tileable fine-scale grain: grass, earth and timber share one RGB sample.
function makeMaterialTexture(){
  const side=128, pixels=new Uint8Array(side*side*4),rand=mapRandom(929);
  const grid=new Float32Array(16*16);
  for(let i=0;i<grid.length;i++)grid[i]=rand();
  function noise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y);
    let fx=x-ix,fy=y-iy;fx*=fx*(3-2*fx);fy*=fy*(3-2*fy);
    const get=(a,b)=>grid[((b&15)<<4)+(a&15)];
    return mix(mix(get(ix,iy),get(ix+1,iy),fx),mix(get(ix,iy+1),get(ix+1,iy+1),fx),fy);
  }
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const at=(y*side+x)*4,u=x/side,v=y/side,grit=rand()-.5,coarse=noise(u*8,v*8)-.5;
    const blade=noise(u*16,v*8)*.6+.4*noise(u*16+v*16,v*4);
    const wave=Math.sin(Math.PI*2*(u*15+noise(u*4,v*2)*1.7));
    pixels[at]=Math.round(128+coarse*110+(blade-.5)*160+grit*60);
    pixels[at+1]=Math.round(128+coarse*84+grit*90+(grit>.44?31:0));
    pixels[at+2]=Math.round(128+wave*28+coarse*65+grit*26);
    pixels[at+3]=255;
  }
  const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,side,side,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(gl.getUniformLocation(prog,'uMaterials'),1);gl.activeTexture(gl.TEXTURE0);
  return texture;
}
function groveTree(x,z,s=1){
  const bark=rgb('#715238'),leafA=C.leaf,leafB=C.leaf2,leafC=rgb('#75984f');
  const random=mapRandom(412+Math.abs(Math.round(x*391+z*97)));
  cylinder(x,1.12*s,z,.25*s,2.24*s,bark,9,.145*s);
  for(let i=0;i<5;i++){
    const a=i*2.39996+random()*.45,r=(.52+.39*random())*s,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r,h=(2.57+.57*random())*s;
    limb([x,(1.24+i*.08)*s,z],[xx,h,zz],.106*s,bark);
    const crown=(.85+.29*random())*s;
    ellipsoid(xx,h+.22*s,zz,crown,.82*crown,crown*.91,[leafA,leafB,leafA,leafC,leafB][i],a,9,5);
  }
  ellipsoid(x+.14*s,3.57*s,z,1.12*s,.93*s,1.09*s,leafB,0,10,6);
}
function roadsideDetail(){
  const random=mapRandom(431+MAP.x), colors=[rgb('#7f944e'),rgb('#97a661'),rgb('#858d4c')];
  for(const road of roads){
    const horizontal=road.w>road.d,extent=horizontal?road.w:road.d;
    for(const sign of [-1,1])for(let i=0;i<extent*1.8;i++){
      const u=(random()-.5)*extent,edge=sign*((horizontal?road.d:road.w)*.5+(random()-.38)*.7);
      const x=road.x+(horizontal?u:edge),z=road.z+(horizontal?edge:u);
      if(mapId==='pasar'&&Math.abs(z)<10&&Math.abs(x)<42&&random()>.08)continue;
      if(roads.some(r=>r!==road&&inside(x,z,r,.25))||water.some(r=>inside(x,z,r))||bases.some(b=>Math.hypot(x-b.x,z-b.z)<3.4))continue;
      const size=.12+random()*.22,col=colors[i%3];
      for(let j=0;j<3;j++){
        const xx=x+random()*.16,zz=z+random()*.15;
        tri([xx-size*.14,.041,zz],[xx+size*.14,.041,zz],[xx+(j-1)*.07,.06+size*(.55+.4*random()),zz+.055],col);
      }
    }
  }
}

let staticData,staticCount=0;
function rebuildMap(){layoutMap();vertices=[];scenery();rebuildVendorMeshes();if(mapId==='pasar')makeRollingMeshes();addFieldDetails();roadsideDetail();regionGeometry();bakeGround();staticData=new Float32Array(vertices);staticCount=staticData.length/7;gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);gl.bufferData(gl.ARRAY_BUFFER,staticData,gl.STATIC_DRAW);mini.width=528;mini.height=Math.round(528*MAP.z/MAP.x);bigMap.width=960;bigMap.height=Math.round(960*MAP.z/MAP.x);mini.style.aspectRatio=String(MAP.x/MAP.z);bigMap.style.aspectRatio=String(MAP.x/MAP.z);}
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const mul=(a,b)=>{const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[row+c*4]+=a[row+k*4]*b[k+c*4];return r;};
function camera(eye,target,aspect){const z=norm(eye.map((v,i)=>v-target[i])),x=norm(cross([0,1,0],z)),y=cross(z,x),view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]),f=1/Math.tan(50*Math.PI/360),near=.1,far=160,proj=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);return mul(proj,view);}
const DT=1/60,BASE_RADIUS=1.3,TAG_RADIUS=1.02,RADIUS=.4;
const players=['LU','ARI','NIA','BIMA','CITRA','DION'].map((name,id)=>({id,name,team:id<3?0:1}));
players.forEach(p=>{p.label=document.createElement('div');p.label.className='nameplate'+(p.team?' enemy':'');p.label.innerHTML='<span></span><span class="sub"></span>';labels.append(p.label);p.nameEl=p.label.children[0];p.subEl=p.label.children[1];});
const baseLabels=bases.map((b,i)=>{const el=document.createElement('div');el.className='base-label';el.textContent='BENTENG '+(i?'B':'A');labels.append(el);return el;});
pickups.forEach(p=>{p.label=document.createElement('div');p.label.className='pickup-label';p.label.textContent=p.type==='boost'?'BOOST':'ENERGI';labels.append(p.label);});

let tick=0,remaining=300,roundWait=0,scores=[0,0],running=false,camX=0,camZ=0,closeZoom=false,vp,width=900,height=550,lastMini=-100,lastUi=-100;
const keys=new Set(),stick={x:0,z:0,id:null},particles=[],trails=[];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
let reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let selfSlot=0,screen='home',paused=false,overlayMap=false,online=false;
let snapshot=null, sampleA=null,sampleB=null,sequence=[],renderHandle=0,lastRAF=0,lastMenu=0;
let showResult=false,localMenuMessage='',prefMotion='auto';
const now=()=>performance.now();
const me=()=>players[selfSlot],myTeam=()=>Math.floor(selfSlot/3);
function mode(){return MODES[difficulty];}
function age(p){return Math.max(0,tick-p.lastTouch)*DT;}
function inside(x,z,o,pad=0){return Math.abs(x-o.x)<o.w*.5+pad&&Math.abs(z-o.z)<o.d*.5+pad;}
function segmentBlocked(a,b){
 return obstacles.some(o=>{if(!o.opaque)return false;let lo=0,hi=1;
  for(const axis of ['x','z']){const h=(axis==='x'?o.w:o.d)*.5,d=b[axis]-a[axis],m=o[axis]-a[axis];
    if(Math.abs(d)<.00001){if(Math.abs(m)>h)return false;}else{const t=m/d,w=Math.abs(h/d);lo=Math.max(lo,t-w);hi=Math.min(hi,t+w);if(lo>hi)return false;}}
  return true;});
}
function bushAt(p){return bushes.findIndex(b=>inside(p.x,p.z,b));}
function visionRange(p){return p.state==='jailed'?4:mode().radius;}
function teamSees(team,p){return players.some(a=>a.team===team&&dist(a,p)<=visionRange(a)&&!segmentBlocked(a,p)&&(bushAt(p)<0||bushAt(p)===bushAt(a)||dist(a,p)<3.4));}
function shown(p){return screen==='home'||playMode==='magrib'||p.team===myTeam()||p.reveal>tick||teamSees(myTeam(),p);}
function heatHint(p){return playMode==='magrib'||difficulty==='hard'||dist(me(),p)>mode().hint||p.state!=='active'?'':p.lastTouch===me().lastTouch?'SAMA PANAS':me().lastTouch>p.lastTouch?'BISA DITANGKAP':'LEBIH PANAS';}
function clearInput(){keys.clear();stick.x=stick.z=0;stick.id=null;root.querySelector('.knob').style.transform='translate(0,0)';}
function input(){return {x:stick.x+Number(keys.has('d'))-Number(keys.has('a')),z:stick.z+Number(keys.has('s'))-Number(keys.has('w')),analog:stick.id!==null&&!['w','a','s','d'].some(k=>keys.has(k)),sprint:keys.has('shift')};}
function layoutMap(){
 const data=BentengCore.layout(mapId);Object.assign(MAP,data.MAP);
 for(const e of [...pickups,...landmarks])e.label?.remove();
 for(const [list,source] of [[bases,data.bases],[jails,data.jails],[obstacles,data.obstacles],[bushes,data.bushes],[pickups,data.pickups],[roads,data.roads],[water,data.water],[bridges,data.bridges],[fields,data.fields],[landmarks,data.landmarks]])list.splice(0,list.length,...source);
 features=data;
 for(const p of [...pickups,...landmarks]){p.label=document.createElement('div');p.label.className=p.type?'pickup-label':'base-label';p.label.textContent=p.name||(p.type==='boost'?'BOOST':'ENERGI');labels.append(p.label);}
}
function regionGeometry(){
 const mudColor=rgb('#815e43'),waterColor=rgb('#ad9573');
 for(const m of features.mud){
   box(m.x,.045,m.z,m.w,.018,m.d,mudColor);
   for(let i=0;i<8;i++){const a=(Math.sin(i*17.3)*.39),b=Math.cos(i*9.1)*.36;
     ellipsoid(m.x+a*m.w,.063,m.z+b*m.d,.45+(i%3)*.31,.016,.14+(i%2)*.14,waterColor,i*.7,9,3);}
 }
 for(const p of features.posts){
   ring(p.x,p.z,1.8,C.boost,.085,.10);cylinder(p.x,1.1,p.z,.07,2.2,C.wood,8);
   cylinder(p.x+.28,1.22,p.z,.18,.96,rgb('#be9255'),8);box(p.x+.28,1.23,p.z+.176,.07,.53,.03,C.dark);
   box(p.x+.13,2.13,p.z,.55,.08,.11,C.wood);
 }
}
function activityGeometry(){
 if(screen==='home')return;
 if(playMode==='magrib'&&me().checkpoint<4){
   const q=features.routes[myTeam()][me().checkpoint];ring(q.x,q.z,1.8,C.boost,.15,.14);
   for(const side of [-1,1]){cylinder(q.x+side*1.72,1.25,q.z,.075,2.5,C.wood,8);box(q.x+side*1.72+.28,2.26,q.z,.55,.36,.06,C.boost);}
 }
}
function showStatus(){
 if(!snapshot)return;
 for(const q of players)q.label.classList.toggle('enemy',q.team!==myTeam());
 const p=me();
 ui.edition.textContent=online?'Ruang teman · Kamu di RT 0'+(myTeam()+1):'Lawan komputer · '+({easy:'Santai',medium:'Seru',hard:'Jagoan'})[difficulty];
 const num=v=>String(v).padStart(2,'0'),sec=Math.max(0,Math.ceil(remaining));
 ui.teamA.textContent='RT 01';ui.teamB.textContent='RT 02';ui.scoreA.textContent=scores[0];ui.scoreB.textContent=scores[1];
 ui.clock.textContent=snapshot.overtime?'EMAS':Math.floor(sec/60)+':'+num(sec%60);
 const trial=playMode==='magrib';
 ui.modeTitle.textContent=trial?'Pulang Sebelum Magrib':playMode==='classic'?'Bebentengan Klasik':'Pertarungan Antar RT';
 ui.phaseLabel.textContent=trial?'TIME TRIAL':playMode==='classic'?'KASUAL':'SET '+snapshot.leg+' · '+snapshot.wins.join('–');
 ui.modeDetail.textContent=trial?'Lewati tiga pos secara berurutan, lalu sentuh tiang sendiri.':playMode==='classic'?'Rebut 3 angka atau unggul saat waktu habis.':'Menangi 2 set. Setiap set berakhir pada 2 angka atau saat waktu habis.';
 const target=trial?features.routes[myTeam()][Math.min(3,p.checkpoint)]:bases[p.state==='returning'?myTeam():1-myTeam()];
 const bearing=Math.round(Math.atan2(target.x-p.x,p.z-target.z)*4/Math.PI);
 const arrow=['↑','↗','→','↘','↓','↙','←','↖'][(bearing+8)%8];
 ui.compass.textContent=p.state==='jailed'?'TAWANAN · Tunggu bantuan':(trial?(p.homeSafe?'FINIS':p.checkpoint===3?'PULANG':'POS '+(p.checkpoint+1)):(p.state==='returning'?'BENTENG SENDIRI':'BENTENG LAWAN'))+' '+arrow+' · '+Math.ceil(dist(p,target))+' m';
 root.querySelector('.heat .cap').textContent=trial?'WAKTU LINTASAN':'SEJAK SENTUH TIANG';
 ui.heat.textContent=trial?(p.time??tick/60).toFixed(1)+' dtk':p.state==='jailed'?'Tertawan':p.state==='returning'?'Pulang dulu':age(p).toFixed(1)+' dtk';
 ui.heatState.textContent=trial?(p.homeSafe?'Sudah finis':Math.min(3,p.checkpoint)+'/3 pos dilewati'):p.state==='jailed'?'Tunggu teman membebaskanmu':p.touching?'Tiang sendiri':p.onMud?'Berlumpur · laju 58%':'Sentuhan terbaru lebih kuat';
 const m=100+25*p.up.stamina;ui.energyText.textContent=Math.round(p.energy)+' / '+m;energyFill.style.width=p.energy/m*100+'%';energyTrack.setAttribute('aria-valuenow',String(Math.round(p.energy)));energyTrack.setAttribute('aria-valuemax',String(m));
 ui.boost.textContent=p.onMud?'LUMPUR · 58%':p.reveal>tick?'TERDENGAR KENTONGAN':p.exhausted?'Pulihkan energi':p.sprinting?'SPRINT':tick<p.boostUntil?'BOOST':'';
 for(const [k,delay,cost] of [['dash',p.dashReady,23],['evade',p.evadeReady,27]]){const t=Math.max(0,(delay-tick)/60);skillButtons[k].disabled=t>0||p.energy<cost||p.state!=='active'||roundWait>0;ui[k+'Text'].textContent=t?t.toFixed(1)+'s':k==='dash'?'SPASI':'E';}
 ui.tokens.textContent=p.tokens+' poin';ui.nextPoint.textContent='Poin berikutnya '+Math.ceil((1500-tick%1500)/60)+' dtk';ui.visionLabel.textContent=trial?'Lintasan':'Radius '+mode().radius+' m';
 for(const k of ['stamina','agility']){ui[k+'Title'].textContent=(k==='stamina'?'[1] Stamina':'[2] Ketangkasan')+' · Lv. '+p.up[k]+'/3';ui[k+'Cost'].textContent=p.up[k]>=3?'MAKS':p.up[k]+1+' poin';root.querySelector('[data-upgrade="'+k+'"]').disabled=p.up[k]>=3||p.tokens<=p.up[k];}
 ui.miniTitle.textContent=MAPS[mapId].name.toUpperCase();ui.bigMapTitle.textContent='Denah '+MAPS[mapId].name;
 const message=snapshot.note||MAPS[mapId].description;if(eventEl.textContent!==message)eventEl.textContent=message;ui.banner.hidden=true;
 if(trial){ui.teamA.textContent='POS';ui.teamB.textContent='TARGET';ui.scoreA.textContent=Math.min(3,p.checkpoint);ui.scoreB.textContent='3';}
}
const blendFields=['x','z','yaw','walk','pace','floor','bank','lean','crouch','vx','vz'];
function applyVisual(a,b,t){
 for(let i=0;i<6;i++){
   const p=players[i],next=b.players[i],prior=a.players[i].epoch===next.epoch?a.players[i]:next;
   Object.assign(p,next);
   for(const name of blendFields){let v1=prior[name],v2=next[name];if(name==='yaw')v2=v1+Math.atan2(Math.sin(v2-v1),Math.cos(v2-v1));p[name]=mix(v1,v2,t);}
   p.px=p.x;p.pz=p.z;p.oldYaw=p.yaw;p.oldWalk=p.walk;p.oldPace=p.pace;p.oldFloor=p.floor;p.oldBank=p.bank;p.oldLean=p.lean;p.oldCrouch=p.crouch;
 }
 snapshot=b;tick=mix(a.tick,b.tick,t);remaining=b.remaining;roundWait=b.roundWait;scores=b.scores;
 for(let i=0;i<pickups.length;i++)pickups[i].ready=b.items[i];
}
function receive(state){
 const at=now();if(sequence.length&&state.tick<sequence.at(-1).s.tick)sequence.length=0;
 if(sequence.length&&sequence.at(-1).s.tick===state.tick)sequence.pop();
 sequence.push({s:state,at});if(sequence.length>12)sequence.shift();
 if(sequence.length===1){applyVisual(state,state,1);camX=me().x;camZ=me().z;lastMini=lastUi=-100;showStatus();}
}
function renderFrame(time){
 renderHandle=requestAnimationFrame(renderFrame);const frameSeconds=Math.max(0,(time-lastRAF)/1000||DT),elapsed=Math.min(.1,frameSeconds);lastRAF=time;
 if(screen==='home'){if(time-lastMenu<90||document.hidden||!snapshot)return;lastMenu=time;draw(1,.09);return;}
 if(!online&&!paused&&!overlayMap&&!showResult)window.GameApp?.soloFrame(frameSeconds);
 if(!sequence.length)return;
 const at=time-(online?82:18);while(sequence.length>2&&sequence[1].at<=at)sequence.shift();
 const a=sequence[0],b=sequence[1]||a,t=a===b?1:clamp((at-a.at)/Math.max(1,b.at-a.at),0,1);
 applyVisual(a.s,b.s,t);if(screen==='home')return;
 adjustResolution(elapsed);draw(1,elapsed);
 if(snapshot.ended&&!showResult){showResult=true;clearInput();mapOverlay.hidden=true;overlayMap=false;paused=false;window.GameApp?.result(snapshot);setOverlay('Hasil pertandingan',window.GameApp?.summary(snapshot)||'Selesai.',online?'Kembali ke ruang':'Main lagi');}
}
function setOverlay(title,info,button){
 cover.hidden=false;ui.title.textContent=title;ui.covertext.textContent=info;ui.eyebrow.textContent=MAPS[mapId].name;startButton.textContent=button;
}
function pauseGame(){
 if(screen!=='game'||showResult)return;
 if(overlayMap){toggleMap();return;}
 paused=!paused;lastRAF=now();clearInput();window.GameApp?.sendNow();
 if(paused)setOverlay(online?'Kontrol dijeda':'Ambil napas.',online?'Pertandingan di ruang teman terus berjalan.':'Waktu pertandingan berhenti sementara.','Lanjut bermain');else cover.hidden=true;
}
function toggleMap(){
 if(screen!=='game'||showResult||paused)return;overlayMap=!overlayMap;mapOpen=overlayMap;mapOverlay.hidden=!overlayMap;clearInput();window.GameApp?.sendNow();
 root.querySelector('[data-action="minimap"]').setAttribute('aria-expanded',String(overlayMap));ui.mapNote.textContent=online?'Pertandingan terus berjalan saat denah terbuka.':'Permainan dijeda saat denah terbuka.';if(overlayMap)drawMinimap(bigCtx,true);
}
function enter(config,slot,multi,first){
 screen='game';lastRAF=now();selfSlot=slot;online=multi;paused=showResult=overlayMap=mapOpen=false;mapOverlay.hidden=cover.hidden=true;clearInput();sequence=[];
 const changed=mapId!==config.map;mapId=config.map;difficulty=config.difficulty;playMode=config.mode;root.dataset.play=playMode;
 root.querySelector('.keyhelp').textContent='WASD gerak · Shift sprint'+(playMode==='classic'?'':playMode==='magrib'?' · Spasi dash':' · Spasi dash · E elak')+' · M peta';
 if(changed)rebuildMap();root.classList.remove('frontopen');document.querySelector('#front').hidden=true;lastMini=lastUi=-100;running=true;lookX=lookZ=0;timeStart=now();receive(first);
 root.querySelector('[data-action="restart"]').textContent=multi?'Keluar ruang':'Menu utama';
 window.scrollTo(0,0);
}
function menuView(){
 screen='home';running=false;paused=showResult=overlayMap=mapOpen=false;mapOverlay.hidden=cover.hidden=true;clearInput();root.classList.add('frontopen');document.querySelector('#front').hidden=false;window.scrollTo(0,0);
}
function previewMap(id){
 if(!MAPS[id])return;
 if(mapId!==id){mapId=id;rebuildMap();}
 const demo=BentengCore.createMatch({map:id,mode:'classic',difficulty:'medium'},{0:'Pemain'});selfSlot=0;sequence=[];receive(demo.snapshot());draw();
}
// Player meshes stay on the GPU. A pose updates only transforms and colours.
const instancing=gl.getExtension('ANGLE_instanced_arrays');
const actorProgram=gl.createProgram();
gl.attachShader(actorProgram,shader(gl.VERTEX_SHADER,`
  attribute vec3 pos, normal, basisX, basisY, basisZ, origin, pigment;
  uniform mat4 uVP;
  varying mediump vec3 vColor, vPosition;
  void main(){
    vec3 n=normalize(basisX*normal.x/max(dot(basisX,basisX),0.00001)
                   + basisY*normal.y/max(dot(basisY,basisY),0.00001)
                   + basisZ*normal.z/max(dot(basisZ,basisZ),0.00001));
    float sun=max(dot(n,normalize(vec3(-0.80,1.0,-0.52))),0.0);
    float sky=0.5+0.5*n.y;
    vColor=pigment*(0.58+0.22*sky+0.32*sun)+vec3(0.014,0.019,0.022)*(1.0-sun);
    vPosition=origin+basisX*pos.x+basisY*pos.y+basisZ*pos.z;
    gl_Position=uVP*vec4(vPosition,1.0);
  }`));
gl.attachShader(actorProgram,shader(gl.FRAGMENT_SHADER,`
  precision ${fragmentPrecision} float;
  varying mediump vec3 vColor, vPosition;
  ${visibilityGLSL}
  void main(){gl_FragColor=vec4(atmosphere(vColor,visibility(vPosition.xz)),1.0);}`));
gl.linkProgram(actorProgram);
if(!gl.getProgramParameter(actorProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(actorProgram));
const actorAttrib={};
for(const name of ['pos','normal','basisX','basisY','basisZ','origin','pigment'])actorAttrib[name]=gl.getAttribLocation(actorProgram,name);
const actorVP=gl.getUniformLocation(actorProgram,'uVP'), actorVision=gl.getUniformLocation(actorProgram,'uVision[0]'), actorDusk=gl.getUniformLocation(actorProgram,'uDusk');
const partAttrs=['basisX','basisY','basisZ','origin','pigment'].map(name=>actorAttrib[name]);
function makePartMesh(kind) {
  const mesh=[]; const put=(p,n)=>mesh.push(...p,...n);
  if(kind==='round'){
    const slices=12,bands=8;
    const point=(i,j)=>{const phi=j*Math.PI/bands,theta=i*2*Math.PI/slices;return [Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];};
    for(let j=0;j<bands;j++)for(let i=0;i<slices;i++){
      const a=point(i,j),b=point(i,j+1),c=point(i+1,j+1),d=point(i+1,j);
      if(j>0)for(const p of [a,c,d])put(p,p);
      if(j<bands-1)for(const p of [a,b,c])put(p,p);
    }
  } else {
    for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){
      const normal=[0,0,0];normal[axis]=sign;
      for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){
        const p=normal.slice();p[(axis+1)%3]=a;p[(axis+2)%3]=b;put(p,normal);
      }
    }
  }
  const vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
  const batch={vbo, count:mesh.length/6, transforms:new Float32Array(512*15), length:0, stream:gl.createBuffer()};
  gl.bindBuffer(gl.ARRAY_BUFFER,batch.stream);gl.bufferData(gl.ARRAY_BUFFER,batch.transforms.byteLength,gl.DYNAMIC_DRAW);return batch;
}
const bodyMesh=makePartMesh('round'), gearMesh=makePartMesh('box');
function part(mesh,xAxis,yAxis,zAxis,center,color){
  const a=mesh.transforms,at=mesh.length*15;
  a.set(xAxis,at);a.set(yAxis,at+3);a.set(zAxis,at+6);a.set(center,at+9);a.set(color,at+12);mesh.length++;
}
function flushActors(vision,dusk){
  gl.disableVertexAttribArray(aP);gl.disableVertexAttribArray(aC);gl.disableVertexAttribArray(aSurface);gl.useProgram(actorProgram);
  gl.uniformMatrix4fv(actorVP,false,vp);gl.uniform4fv(actorVision,vision);gl.uniform1f(actorDusk,dusk);
  gl.enableVertexAttribArray(actorAttrib.pos);gl.enableVertexAttribArray(actorAttrib.normal);
  for(const batch of [bodyMesh,gearMesh]){
    if(!batch.length)continue;
    gl.bindBuffer(gl.ARRAY_BUFFER,batch.vbo);
    gl.vertexAttribPointer(actorAttrib.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(actorAttrib.normal,3,gl.FLOAT,false,24,12);
    if(instancing){
      gl.bindBuffer(gl.ARRAY_BUFFER,batch.stream);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,batch.transforms.subarray(0,batch.length*15));
      for(let i=0;i<partAttrs.length;i++){
        const loc=partAttrs[i];gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,60,i*12);
        instancing.vertexAttribDivisorANGLE(loc,1);
      }
      instancing.drawArraysInstancedANGLE(gl.TRIANGLES,0,batch.count,batch.length);
      for(const loc of partAttrs){instancing.vertexAttribDivisorANGLE(loc,0);gl.disableVertexAttribArray(loc);}
    } else {
      for(let j=0;j<batch.length;j++){
        for(let k=0;k<partAttrs.length;k++){const n=j*15+k*3;gl.vertexAttrib3f(partAttrs[k],batch.transforms[n],batch.transforms[n+1],batch.transforms[n+2]);}
        gl.drawArrays(gl.TRIANGLES,0,batch.count);
      }
    }
  }
  gl.disableVertexAttribArray(actorAttrib.pos);gl.disableVertexAttribArray(actorAttrib.normal);
  gl.useProgram(prog);gl.enableVertexAttribArray(aP);gl.enableVertexAttribArray(aC);
}
const skinTones=['#bd8662','#aa744d','#cea17b','#b7825d','#bf9068','#a67251'].map(rgb);
const actorColors={waiting:rgb('#9b9989'),returning:rgb('#9db7a0'),sole:rgb('#50493c'),eyes:rgb('#342d27'),socks:rgb('#e8debf')};
function floorAt(x,z) {
  if(mapId==='sawah' && Math.abs(x)<3.5 && bridges.some(b=>Math.abs(z-b.z)<b.d*.5))return .252;
  if(bases.some(b=>Math.hypot(x-b.x,z-b.z)<3.28))return .122;
  return roads.some(r=>inside(x,z,r))?.038:0;
}
function avatar(p,alpha){
  const x=mix(p.px,p.x,alpha),z=mix(p.pz,p.z,alpha);
  const projected=project(x,1.1,z);
  if(projected.w<=0||projected.x< -55||projected.x>width+55||projected.y< -65||projected.y>height+65)return;
  const yaw=mix(p.oldYaw,p.yaw,alpha),co=Math.cos(yaw),si=Math.sin(yaw);
  const phase=mix(p.oldWalk,p.walk,alpha),stride=mix(p.oldPace,p.pace,alpha);
  const turn=mix(p.oldBank,p.bank,alpha),floor=mix(p.oldFloor,p.floor,alpha);
  const duck=mix(p.oldCrouch,p.crouch,alpha),lean=mix(p.oldLean,p.lean,alpha);
  const breathing=reducedMotion?0:Math.sin((tick+alpha)*.035+p.id)*.014*(1-stride);
  const bob=reducedMotion?0:Math.cos(phase*2)*.033*stride+breathing;
  const hip=.94-.22*duck+bob;
  const world=(side,y,front)=>[x+side*co+front*si,floor+y,z-side*si+front*co];
  const swingTwist=reducedMotion?0:Math.cos(phase)*stride*.115;
  const torso=(side,y,front)=>world(side+turn*(y-hip)+front*swingTwist,y,front+lean*(y-hip)-side*swingTwist);
  function shape(mesh,at,rx,ry,rz,col){
    part(mesh,[co*rx,0,-si*rx],[0,ry,0],[si*rz,0,co*rz],at,col);
  }
  function segment(start,end,r,col){
    const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2],length=Math.hypot(dx,dy,dz);
    if(length<.001)return;
    const up=[dx/length,dy/length,dz/length],side=norm(cross(up,[si,0,co])),front=cross(side,up);
    part(bodyMesh,side.map(v=>v*r),[dx*.58,dy*.58,dz*.58],front.map(v=>v*r),start.map((v,i)=>(v+end[i])*.5),col);
  }
  const shirt=p.state==='jailed'?actorColors.waiting:p.state==='returning'?actorColors.returning:p.team?C.b:C.a;
  const skin=skinTones[p.id];
  for(const side of [-1,1]){
    const swing=Math.sin(phase)*side*stride;
    const lift=Math.max(0,Math.cos(phase)*side)*stride;
    const runBlend=clamp((Math.hypot(p.vx,p.vz)-4)/5,0,1);
    const step=swing*mix(.32,.49,runBlend),yFoot=.115+lift*lift*mix(.19,.29,runBlend);
    const ankle=world(side*.14,yFoot,step);
    const knee=world(side*.155,(hip+yFoot)*.5+.025,step*.53+.12+duck*.16+lift*.13);
    segment(world(side*.14,hip,0),knee,.135,C.pants);segment(knee,ankle,.083,skin);
    segment(world(side*.14,yFoot+.17,step+.024),ankle,.088,actorColors.socks);
    shape(bodyMesh,world(side*.14,yFoot,step+.073),.12,.092,.216,C.shoe);
    shape(gearMesh,world(side*.14,yFoot-.063,step+.075),.112,.035,.181,actorColors.sole);
    const shoulder=torso(side*.26,hip+.55,0);
    const elbow=torso(side*(.295+.02*stride),hip+.30,-swing*.225-.04);
    const hand=torso(side*.305,hip+.11+.12*stride-swing*.055,-swing*.38+.105+.11*stride);
    segment(shoulder,elbow,.112,shirt);segment(elbow,hand,.073,skin);
    shape(bodyMesh,hand,.083,.087,.079,skin);
  }
  shape(bodyMesh,world(0,hip+.005,0),.238,.195,.159,C.pants);
  shape(bodyMesh,torso(0,hip+.32,0),.27,.356,.176,shirt);
  shape(gearMesh,torso(0,hip+.43,.169),.128,.021,.014,C.light);
  shape(gearMesh,torso(-.115,hip+.49,-.153),.029,.062,.014,C.light);
  shape(bodyMesh,torso(0,hip+.66,0),.09,.112,.086,skin);
  const head=(s,h,f)=>torso(s,hip+.866+h,f);
  shape(bodyMesh,head(0,0,.012),.175,.222,.169,skin);
  shape(bodyMesh,head(0,.12,-.018),.181,.129,.171,C.hair);
  for(const side of [-1,1]){
    shape(bodyMesh,head(side*.17,-.01,.005),.033,.059,.035,skin);
    shape(bodyMesh,head(side*.065,.01,.16),.021,.016,.010,actorColors.eyes);
  }
  shape(bodyMesh,head(0,-.025,.171),.031,.041,.030,skin);
  if(p.id===2||p.id===4)shape(bodyMesh,head(0,-.008,-.181),.087,.145,.101,C.hair);
  if(p.id===1||p.id===5){
    shape(bodyMesh,head(0,.157,-.005),.185,.086,.179,p.id===5?shirt:C.hair);
    shape(gearMesh,head(0,.132,.151),.134,.016,.093,p.id===5?shirt:C.hair);
  }
  const ringY=Math.max(floor,.04)+.012;
  if(p.id===selfSlot)ring(x,z,.54,C.light,.045,ringY);
  if(tick<p.evadeUntil)ring(x,z,.84,C.energy,.08,ringY+.012);
  else if(tick<p.boostUntil)ring(x,z,.72,C.boost,.05,ringY+.012);
  if(p.state==='jailed')ring(x,z,.66,C.wood,.06,ringY+.015);
}

function project(x,y,z){const v=[x,y,z,1],r=[0,0,0,0];for(let i=0;i<4;i++)for(let k=0;k<4;k++)r[i]+=vp[i+k*4]*v[k];return {x:(r[0]/r[3]*.5+.5)*width,y:(-.5*r[1]/r[3]+.5)*height,w:r[3]};}
const teamVision=new Float32Array(12),shadowCasters=new Float32Array(18);
let renderScale=1, qualitySamples=0,qualityTime=0,goodWindows=0,zoomBlend=0,lookX=0,lookZ=0;
let cameraHeight=15.8,cameraBack=14.4;
function adjustResolution(elapsed){
  if(!running||elapsed<=0)return;
  qualityTime+=elapsed;qualitySamples++;
  if(qualityTime<1.5)return;
  const average=qualityTime/qualitySamples;
  if(average>.024){renderScale=Math.max(.62,renderScale-.10);goodWindows=0;}
  else if(average<.0185){if(++goodWindows>=3){renderScale=Math.min(1,renderScale+.06);goodWindows=0;}}
  else goodWindows=0;
  qualityTime=qualitySamples=0;
}
function renderBuffer(buffer,data,count){
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  if(data){
    if(data.byteLength>streamCapacity){streamCapacity=Math.max(streamCapacity*2,data.byteLength);gl.bufferData(gl.ARRAY_BUFFER,streamCapacity,gl.DYNAMIC_DRAW);}
    if(count)gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
  }
  gl.enableVertexAttribArray(aSurface);
  gl.vertexAttribPointer(aP,3,gl.FLOAT,false,28,0);gl.vertexAttribPointer(aC,3,gl.FLOAT,false,28,12);gl.vertexAttribPointer(aSurface,1,gl.FLOAT,false,28,24);
  if(count)gl.drawArrays(gl.TRIANGLES,0,count);
}
let streamCapacity=0;
function draw(alpha=1,elapsed=DT){
  if(roundWait)alpha=1;
  width=Math.max(1,court.clientWidth);height=Math.max(1,court.clientHeight);
  const dpr=Math.min(window.devicePixelRatio||1,1.5)*renderScale;
  const pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
  gl.viewport(0,0,pixelWidth,pixelHeight);gl.useProgram(prog);
  const me=players[selfSlot],dusk=playMode==='magrib'?clamp(.15+.85*(1-remaining/120),0,1):0;
  const time=reducedMotion?0:Math.max(0,tick-1+alpha)*DT;
  const follow=reducedMotion?1:1-Math.exp(-Math.max(.001,elapsed)*8);
  const aim=reducedMotion?1:1-Math.exp(-Math.max(.001,elapsed)*4.5);
  lookX=mix(lookX,reducedMotion?0:clamp(me.vx*.20,-1.65,1.65),aim);
  lookZ=mix(lookZ,reducedMotion?0:clamp(me.vz*.20,-1.65,1.65),aim);
  camX=mix(camX,clamp(mix(me.px,me.x,alpha)+lookX,-MAP.x+3,MAP.x-3),follow);
  camZ=mix(camZ,clamp(mix(me.pz,me.z,alpha)+lookZ,-MAP.z+3,MAP.z-3),follow);
  zoomBlend=mix(zoomBlend,closeZoom?1:0,(running&&!reducedMotion)?aim:1);
  cameraHeight=mix(15.8,9.4,zoomBlend);cameraBack=mix(14.4,9.6,zoomBlend);
  vp=screen==='home'?(mapId==='pasar'?camera([1.2,3.45,-1.2],[-18,1.15,-7.35],width/height):camera([-34,6.5,12],[-12,1,-3],width/height)):camera([camX,cameraHeight,camZ+cameraBack],[camX,0,camZ-1.7],width/height);
  gl.uniformMatrix4fv(uVP,false,vp);gl.uniform1f(uDusk,dusk);
  gl.clearColor(.88,.80,.64,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  for(const p of players){
    const x=mix(p.px,p.x,alpha),z=mix(p.pz,p.z,alpha),at=p.id*3;
    shadowCasters[at]=x;shadowCasters[at+1]=z;shadowCasters[at+2]=shown(p)?1:0;
    if(p.team===myTeam()){const i=(p.id%3)*4;teamVision[i]=x;teamVision[i+1]=z;teamVision[i+2]=(screen==='home'||playMode==='magrib')?200:visionRange(p);teamVision[i+3]=1;}
  }
  gl.uniform4fv(uVision,teamVision);gl.uniform3fv(groundUniform.players,shadowCasters);
  gl.uniform2f(groundUniform.size,MAP.x,MAP.z);gl.uniform1f(groundUniform.river,mapId==='sawah'?1:0);gl.uniform1f(groundUniform.time,time);
  const ambient=screen==='home'?(reducedMotion?0:performance.now()/1000):time;
  const cartTick=screen==='home'?ambient*60:tick;
  const carts=BentengCore.cartsAt(cartTick,mapId);
  gl.uniform1f(sceneTime,ambient);gl.uniform1f(marketUniform,mapId==='pasar'?1:0);
  renderBuffer(staticBuffer,null,staticCount);drawVendorMeshes();drawRollingCarts(carts);
  vertices=[];bodyMesh.length=gearMesh.length=0;
  for(const p of players)if(shadowCasters[p.id*3+2])avatar(p,alpha);
  marketSteam(carts,ambient);activityGeometry();wavingFlags(screen==='home'&&!reducedMotion?performance.now()/1000:time);
  for(const p of pickups){
    if(playMode!=='tournament'||tick<p.ready||!teamSees(myTeam(),p))continue;
    const bob=reducedMotion?0:Math.sin(time*2.5+p.x)*.09,col=p.type==='boost'?C.boost:C.energy;
    cylinder(p.x,.08,p.z,.48,.12,C.stone,10);ring(p.x,p.z,.66,col,.045,.09);
    box(p.x,.72+bob,p.z,.48,.48,.48,col,time,.25,.25);box(p.x,.72+bob,p.z,.12,.62,.12,C.light,time);
  }
  if(!reducedMotion){
    for(const p of particles){const size=.035+p.life*.003;box(p.x,p.y+(1-p.life/p.total)*.22,p.z,size*2,size,size,p.col);}
    for(const p of trails)box(p.x,.12,p.z,.20,.025,.55,C.path,p.yaw);
  }
  const data=new Float32Array(vertices);renderBuffer(dynamicBuffer,data,data.length/7);
  flushActors(teamVision,dusk);
  if(screen==='home')return;
  positionLabels(alpha);
  if(tick-lastUi>=5||!running){lastUi=tick;showStatus();}
  if(screen!=='home'&&(tick-lastMini>=6||!running)){lastMini=tick;drawMinimap();if(mapOpen)drawMinimap(bigCtx,true);}
}

function positionLabels(alpha){const used=[];for(const p of players){const q=project(mix(p.px,p.x,alpha),p.floor+2.34,mix(p.pz,p.z,alpha)),visible=shown(p)&&q.w>0&&q.x>25&&q.x<width-25&&q.y>83&&q.y<height-68;p.label.style.display=visible?'block':'none';if(!visible)continue;if(tick>p.labelTick||p.labelState!==p.state||p.labelTick==null||!running){p.labelState=p.state;p.labelTick=tick-tick%6+5;p.nameEl.textContent=p.state==='active'&&p.team===myTeam()?p.name:p.name+' · '+(p.state==='active'&&playMode==='magrib'?'POS '+Math.min(p.checkpoint,3)+'/3':p.state==='home'?'AMAN':p.state==='jailed'?'TAWANAN':p.state==='returning'?'PULANG':age(p).toFixed(2).replace('.',',')+' dtk');p.subEl.textContent=p.state==='home'?'SUDAH DI BENTENG':p.state==='jailed'?'SENTUH UNTUK BEBASKAN':p.state==='returning'?'KE BENTENG SENDIRI':p.team!==myTeam()?heatHint(p):tick<p.evadeUntil?'SEDANG ELAK':p.id===selfSlot&&bushAt(p)>=0?'DI DALAM SEMAK':'';}let x=clamp(q.x,65,width-65),y=q.y;for(let i=0;i<5;i++){if(used.some(a=>Math.abs(a.x-x)<86&&Math.abs(a.y-y)<24))y-=24;else break;}y=Math.max(109,y);used.push({x,y});p.label.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y)+'px,0) translate(-50%,-100%)';}
  bases.forEach((b,i)=>{const q=project(b.x,5.1,b.z),el=baseLabels[i];el.style.display=!used.some(a=>Math.abs(a.x-q.x)<58&&Math.abs(a.y-q.y)<24)&&q.w>0&&q.x>55&&q.x<width-55&&q.y>85&&q.y<height-40?'block':'none';el.style.left=q.x+'px';el.style.top=q.y+'px';});
  for(const p of pickups){const q=project(p.x,1.6,p.z),visible=playMode==='tournament'&&tick>=p.ready&&teamSees(myTeam(),p)&&q.w>0&&q.x>40&&q.x<width-40&&q.y>105&&q.y<height-65;p.label.style.display=visible?'block':'none';p.label.style.left=q.x+'px';p.label.style.top=q.y+'px';}
  for(const p of landmarks){const q=project(p.x,p.y,p.z);p.label.style.display=dist(me(),p)<mode().radius&&q.w>0&&q.x>70&&q.x<width-70&&q.y>120&&q.y<height-70?'block':'none';p.label.style.left=q.x+'px';p.label.style.top=q.y+'px';}
}
const sightRays=Array.from({length:72},(_,i)=>{
  const angle=i*Math.PI/36;const x=Math.cos(angle),z=Math.sin(angle);
  return {x,z,invX:Math.abs(x)>1e-7?1/x:0,invZ:Math.abs(z)>1e-7?1/z:0};
});
function sightPolygon(p){
  const result=[],radius=visionRange(p);
  for(const ray of sightRays){
    let reach=radius;
    for(const o of obstacles){
      if(!o.opaque)continue;
      const dx=o.x-p.x,dz=o.z-p.z,halfX=o.w*.5+.05,halfZ=o.d*.5+.05;
      if(Math.abs(dx)>radius+halfX||Math.abs(dz)>radius+halfZ)continue;
      if((!ray.invX&&Math.abs(dx)>halfX)||(!ray.invZ&&Math.abs(dz)>halfZ))continue;
      const tx=dx*ray.invX,tz=dz*ray.invZ,wx=halfX*Math.abs(ray.invX),wz=halfZ*Math.abs(ray.invZ);
      const near=Math.max(0,ray.invX?tx-wx:0,ray.invZ?tz-wz:0);
      const far=Math.min(reach,ray.invX?tx+wx:reach,ray.invZ?tz+wz:reach);
      if(near<=far)reach=near;
    }
    result.push({x:p.x+ray.x*reach,z:p.z+ray.z*reach});
  }
  return result;
}

function cameraFootprint(){const h=cameraHeight,back=cameraBack,forward=norm([0,-h,-back-1.7]),up=[0,-forward[2],forward[1]],f=Math.tan(25*Math.PI/180);return [[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,y])=>{const ray=[x*f*width/height,forward[1]+up[1]*y*f,forward[2]+up[2]*y*f],t=-h/ray[1];return {x:camX+ray[0]*t,z:camZ+back+ray[2]*t};});}
function minimapPlayers(){return players.filter(shown);}
const terrainTiles = new WeakMap();
function drawMinimap(c=ctx,expanded=false){const target=expanded?bigMap:mini,w=target.width,h=target.height,pad=12,scale=Math.min((w-pad*2)/(MAP.x*2),(h-pad*2)/(MAP.z*2)),ox=(w-MAP.x*2*scale)/2,oz=(h-MAP.z*2*scale)/2,mx=x=>ox+(x+MAP.x)*scale,mz=z=>oz+(z+MAP.z)*scale;
  const rect=(r,col)=>{c.fillStyle=col;c.fillRect(mx(r.x-r.w/2),mz(r.z-r.d/2),r.w*scale,r.d*scale);},polygon=points=>{points.forEach((p,i)=>i?c.lineTo(mx(p.x),mz(p.z)):c.moveTo(mx(p.x),mz(p.z)));c.closePath();};
  function terrain(){c.fillStyle='#88a478';c.fillRect(ox,oz,MAP.x*2*scale,MAP.z*2*scale);for(const r of roads)rect(r,'#d0c6a0');for(const r of fields){rect(r,'#a3b565');c.strokeStyle='#7b9657';c.lineWidth=1.5;for(let x=r.x-r.w/2+1;x<r.x+r.w/2;x+=2){c.beginPath();c.moveTo(mx(x),mz(r.z-r.d/2));c.lineTo(mx(x),mz(r.z+r.d/2));c.stroke();}}for(const r of water)rect(r,'#80b6bf');for(const r of bridges)rect(r,'#d1b38a');for(const m of features.mud)rect(m,'#83694b');for(const b of bushes)rect(b,'#48744c');for(const o of obstacles){if(o.type==='water')continue;rect(o,o.type==='house'?'#ba795c':o.type==='vendor'?['#b86a4b','#679c7b','#d0a254','#7693a0'][o.style]:o.type==='stall'?'#d7b774':o.type==='ronda'?'#a18a6b':'#78816b');if(o.type==='house'||o.type==='stall'||o.type==='vendor'){c.strokeStyle='#f3ddb0';c.lineWidth=1.8;c.beginPath();c.moveTo(mx(o.x-o.w/2),mz(o.z));c.lineTo(mx(o.x+o.w/2),mz(o.z));c.stroke();}}}
  let layer=terrainTiles.get(target);
  if(!layer||layer.map!==mapId||layer.image.width!==w||layer.image.height!==h){
    const image=document.createElement('canvas');image.width=w;image.height=h;
    const original=c;c=image.getContext('2d');terrain();c=original;
    layer={map:mapId,image};terrainTiles.set(target,layer);
  }
  c.clearRect(0,0,w,h);c.fillStyle='#213f36';c.fillRect(0,0,w,h);c.drawImage(layer.image,0,0);c.fillStyle='#102c39af';c.fillRect(ox,oz,MAP.x*2*scale,MAP.z*2*scale);c.save();c.beginPath();for(const p of players.filter(p=>p.team===myTeam()))polygon(sightPolygon(p));c.clip();c.drawImage(layer.image,0,0);c.restore();c.save();c.beginPath();c.rect(ox,oz,MAP.x*2*scale,MAP.z*2*scale);c.clip();
  c.strokeStyle='#fff2b4aa';c.lineWidth=1.8;c.setLineDash([5,5]);c.beginPath();c.arc(mx(me().x),mz(me().z),visionRange(me())*scale,0,Math.PI*2);c.stroke();c.setLineDash([]);
  c.strokeStyle='#edf3d7a6';c.lineWidth=2;c.beginPath();polygon(cameraFootprint());c.stroke();c.restore();
  const baseSize=expanded?15:18;bases.forEach((b,i)=>{c.fillStyle=i?'#c0684f':'#207d73';c.fillRect(mx(b.x)-baseSize,mz(b.z)-baseSize,baseSize*2,baseSize*2);c.strokeStyle='#faf0cf';c.lineWidth=2;c.strokeRect(mx(b.x)-baseSize,mz(b.z)-baseSize,baseSize*2,baseSize*2);c.fillStyle='#fff9da';c.textAlign='center';c.textBaseline='middle';c.font='bold '+(expanded?20:29)+'px system-ui';c.fillText(i?'B':'A',mx(b.x),mz(b.z)+1);});
  if(playMode==='magrib'&&me().checkpoint<4){const q=features.routes[myTeam()][me().checkpoint];c.strokeStyle='#ffdf76';c.lineWidth=4;c.beginPath();c.arc(mx(q.x),mz(q.z),expanded?11:8,0,Math.PI*2);c.stroke();}
  for(const post of features.posts){c.fillStyle='#e9bc65';c.fillRect(mx(post.x)-3,mz(post.z)-3,6,6);}
  for(const cart of BentengCore.cartsAt(tick,mapId))rect(cart,'#7e4735');
  for(const p of minimapPlayers()){const x=mx(p.x),z=mz(p.z),r=p.id===selfSlot?11:expanded?8:7;c.beginPath();if(p.id===selfSlot){const dx=Math.sin(p.yaw),dz=Math.cos(p.yaw);c.moveTo(x+dx*r*1.5,z+dz*r*1.5);c.lineTo(x-dx*r-dz*r*.8,z-dz*r+dx*r*.8);c.lineTo(x-dx*r*.5,z-dz*r*.5);c.lineTo(x-dx*r+dz*r*.8,z-dz*r-dx*r*.8);c.closePath();}else if(p.team){c.moveTo(x,z-r);c.lineTo(x+r,z);c.lineTo(x,z+r);c.lineTo(x-r,z);c.closePath();}else c.arc(x,z,r,0,Math.PI*2);c.fillStyle=p.id===selfSlot?'#ffe58a':p.team?'#ff9673':'#55dac2';c.strokeStyle='#183b35';c.lineWidth=3;c.fill();c.stroke();if(p.state==='jailed'){c.strokeStyle='#fff4da';c.lineWidth=2;c.beginPath();c.moveTo(x-r*.5,z-r*.5);c.lineTo(x+r*.5,z+r*.5);c.moveTo(x+r*.5,z-r*.5);c.lineTo(x-r*.5,z+r*.5);c.stroke();}}
  if(expanded){c.font='600 17px system-ui';c.textAlign='center';c.textBaseline='bottom';for(const p of landmarks){c.strokeStyle='#183d34';c.lineWidth=4;c.strokeText(p.name,mx(p.x),mz(p.z)-12);c.fillStyle='#eee8cb';c.fillText(p.name,mx(p.x),mz(p.z)-12);}}
  c.fillStyle='#153930d9';c.fillRect(20,h-48,10*scale+22,36);c.strokeStyle='#ecebcf';c.lineWidth=2;c.beginPath();c.moveTo(30,h-23);c.lineTo(30+10*scale,h-23);c.stroke();c.fillStyle='#fff7d3';c.font=(expanded?'20':'27')+'px system-ui';c.textAlign='left';c.textBaseline='bottom';c.fillText('10 m',30,h-25);
}

const interact=()=>screen==='game'&&!paused&&!overlayMap&&!showResult;
function action(kind){if(interact())window.GameApp?.action(kind);}
startButton.onclick=()=>{if(showResult)window.GameApp?.replay();else if(paused)pauseGame();};
pauseButton.textContent='Jeda';pauseButton.onclick=pauseGame;
root.querySelector('[data-action="restart"]').onclick=()=>window.GameApp?.leaveGame();
root.querySelector('[data-action="zoom"]').onclick=e=>{closeZoom=!closeZoom;e.currentTarget.textContent=closeZoom?'Zoom −':'Zoom +';};
root.querySelector('[data-action="minimap"]').onclick=toggleMap;root.querySelector('[data-action="closemap"]').onclick=toggleMap;
for(const k of ['dash','evade'])skillButtons[k].onclick=()=>action(k);
for(const b of root.querySelectorAll('[data-upgrade]'))b.onclick=()=>action(b.dataset.upgrade);
skillButtons.sprint.onpointerdown=e=>{if(!interact())return;e.preventDefault();skillButtons.sprint.setPointerCapture(e.pointerId);keys.add('shift');window.GameApp?.sendNow();};
for(const ev of ['pointerup','pointercancel','lostpointercapture'])skillButtons.sprint.addEventListener(ev,()=>{keys.delete('shift');window.GameApp?.sendNow();});
const joy=root.querySelector('.joystick'),knob=root.querySelector('.knob');
function updateStick(e){const r=joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dz=e.clientY-r.top-r.height/2,len=Math.hypot(dx,dz),max=r.width*.32,scale=len>max?max/len:1;stick.x=dx*scale/max;stick.z=dz*scale/max;window.GameApp?.sendNow();knob.style.transform='translate('+(dx*scale)+'px,'+(dz*scale)+'px)';}
joy.addEventListener('pointerdown',e=>{e.preventDefault();if(!interact()||stick.id!==null)return;stick.id=e.pointerId;joy.setPointerCapture(e.pointerId);updateStick(e);});joy.addEventListener('pointermove',e=>{if(stick.id===e.pointerId){e.preventDefault();updateStick(e);}});const releaseStick=e=>{if(e.pointerId!==stick.id)return;stick.x=stick.z=0;stick.id=null;window.GameApp?.sendNow();knob.style.transform='translate(0px,0px)';};for(const ev of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(ev,releaseStick);

const keyMap={ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d',w:'w',a:'a',s:'s',d:'d',Shift:'shift'};
window.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||screen!=='game'||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;
 if(e.code==='Escape'){e.preventDefault();if(!e.repeat)pauseGame();return;}
 if(e.code==='KeyM'){e.preventDefault();if(!e.repeat)toggleMap();return;}
 if(!interact())return;
 const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(k){e.preventDefault();if(!keys.has(k)){keys.add(k);window.GameApp?.sendNow();}}
 const cmd={Space:'dash',KeyE:'evade',Digit1:'stamina',Digit2:'agility'}[e.code];if(cmd){e.preventDefault();if(!e.repeat)action(cmd);}
});
window.addEventListener('keyup',e=>{const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(k){keys.delete(k);window.GameApp?.sendNow();}});
function release(){clearInput();window.GameApp?.sendNow();if(!online&&interact())pauseGame();}
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clearInput();cancelAnimationFrame(renderHandle);setOverlay('Grafis terhenti','Muat ulang halaman untuk melanjutkan.','Muat ulang');startButton.onclick=()=>location.reload();});
window.Pitch={enter,receive,menuView,previewMap,input:()=>interact()?input():{x:0,z:0},settings(camera,motion){closeZoom=camera==='near';reducedMotion=motion==='low'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;},getState:()=>({slot:selfSlot,screen,tick,paused,online,mode:playMode,map:mapId,x:me().x,z:me().z,team:myTeam(),seen:players.filter(shown).map(p=>({id:p.id,x:p.x,z:p.z})),phase:snapshot?.ended?'result':'playing'})};
paintSigns();makeMaterialTexture();rebuildMap();previewMap(mapId);renderHandle=requestAnimationFrame(renderFrame);
})();
