'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,randomInt,createHash}=require('node:crypto');
const Core=require('./public/core.js');
const rooms=new Map(), membership=new Map(), browsers=new Map();
const store=process.env.DATA_DIR||path.join(__dirname,'data');
fs.mkdirSync(store,{recursive:true});
const dbPath=path.join(store,'rank.json');
const ratings=fs.existsSync(dbPath)?JSON.parse(fs.readFileSync(dbPath,'utf8')):{};
const files=new Map([['/',['index.html','text/html']],['/index.html',['index.html','text/html']],['/core.js',['core.js','text/javascript']],['/controller.js',['controller.js','text/javascript']],['/world.js',['world.js','text/javascript']],['/menu.css',['menu.css','text/css']]]);
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',slots=[0,3,1,4,2,5];
const fail=(status,message)=>{const error=new Error(message);error.status=status;throw error;};
function session(req,res){
 let raw=(req.headers.cookie||'').match(/(?:^|;\s*)bk_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!raw){raw=randomBytes(32).toString('hex');res.setHeader('Set-Cookie','bk_session='+raw+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'+((req.socket.encrypted||req.headers['x-forwarded-proto']==='https')?'; Secure':''));}
 return createHash('sha256').update(raw).digest('hex');
}
function safeConfig(input={}){
 if(!Object.hasOwn(Core.MAPS,input.map)||!Object.hasOwn(Core.PLAY_MODES,input.mode))fail(400,'Pilihan mode atau arena tidak tersedia.');
 return {map:input.map,mode:input.mode,difficulty:'medium'};
}
function checkName(s){return String(s||'').trim().slice(0,16)||'Pemain';}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function send(res,kind,data){if(!res||res.destroyed||res.writableEnded)return;if(res.writableLength>192*1024){res.destroy();return;}res.write('event: '+kind+'\ndata: '+JSON.stringify(data)+'\n\n');}
function memberInfo(r,m){return {code:r.code,host:r.host===m.id,slot:m.slot,phase:r.phase,config:r.config,matchId:r.matchId,rp:ratings[m.id]||0,roster:[...r.members.values()].map(p=>({slot:p.slot,name:p.name,connected:Boolean(p.stream)}))};}
function broadcast(r){for(const m of r.members.values())send(m.stream,'room',memberInfo(r,m));}
function join(r,id,name){
 if(r.phase!=='lobby')fail(409,'Pertandingan sudah dimulai.');
 if(membership.has(id))fail(409,'Keluar dari ruang sebelumnya dulu.');
 const slot=slots.find(n=>![...r.members.values()].some(p=>p.slot===n));
 if(slot==null)fail(409,'Ruang sudah penuh (6 pemain).');
 const m={id,name:checkName(name),slot,stream:null,seen:Date.now(),input:{x:0,z:0},inputAt:0,seq:-1,rateAt:0,rateCount:0};
 r.members.set(id,m);membership.set(id,r.code);broadcast(r);return m;
}
function leave(r,m){
 r.members.delete(m.id);membership.delete(m.id);
 if(m.stream){send(m.stream,'left',{});m.stream.end();}
 if(r.game){r.game.players[m.slot].human=false;if(r.phase==='playing'&&r.config.mode==='tournament')r.forfeits.add(m.id);}
 if(!r.members.size){rooms.delete(r.code);return;}
 if(r.host===m.id)r.host=([...r.members.values()].find(p=>p.stream)||r.members.values().next().value).id;
 broadcast(r);
}
function start(r){
 if(r.phase!=='lobby')fail(409,'Kembali dulu ke ruang teman.');
 const active=[...r.members.values()].filter(m=>m.stream);
 if(active.length<2)fail(409,'Tunggu minimal dua pemain tersambung.');
 const chosen={};r.entrants=new Map();r.forfeits=new Set();
 for(const m of r.members.values()){chosen[m.slot]=m.name;if(m.stream)r.entrants.set(m.id,m.slot);m.input={x:0,z:0};m.seq=-1;}
 r.game=Core.createMatch(r.config,chosen);for(const m of r.members.values())r.game.players[m.slot].human=Boolean(m.stream);r.matchId=randomBytes(8).toString('hex');r.phase='playing';r.acc=0;
 broadcast(r);const initial=r.game.snapshot();for(const m of r.members.values())send(m.stream,'state',initial);
}
function settle(r,s){
 r.phase='result';
 if(r.config.mode==='tournament'){
   for(const [id,slot] of r.entrants){const win=!r.forfeits.has(id)&&s.winner===Math.floor(slot/3);ratings[id]=Math.max(0,(ratings[id]||0)+(win?25:-12));}
   const temp=dbPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(ratings));fs.renameSync(temp,dbPath);
 }
 broadcast(r);
}
async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>2048)fail(413,'Permintaan terlalu panjang.');parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString()||'{}')||{};}catch{fail(400,'Data tidak valid.');}}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');const endpoint=url.pathname;
  if(req.method==='GET'&&files.has(endpoint)){const [file,type]=files.get(endpoint);res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(__dirname,'public',file)));}
  if(req.method==='GET'&&endpoint==='/health')return json(res,{ok:true});
  if(!endpoint.startsWith('/api/'))fail(404,'Halaman tidak ada.');
  if(req.method==='POST'){
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail(403,'Asal permintaan berbeda.');
    if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Permintaan harus berupa JSON.');
  }
  const id=session(req,res),r=rooms.get(membership.get(id)),m=r?.members.get(id);
  if(req.method==='GET'&&endpoint==='/api/me')return json(res,{rp:ratings[id]||0,room:m?memberInfo(r,m):null});
  if(req.method==='GET'&&endpoint==='/api/events'){
    if(!m)fail(404,'Ruang sudah ditutup.');
    if(m.stream)m.stream.end();m.stream=res;m.seen=Date.now();m.seq=-1;
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 900\n\n');
    if(r.phase==='playing'){r.entrants.set(id,m.slot);r.game.players[m.slot].human=true;}
    broadcast(r);if(r.game)send(res,'state',r.game.snapshot());
    res.on('close',()=>{if(m.stream!==res)return;m.stream=null;m.seen=Date.now();m.input={x:0,z:0};if(r.game)r.game.players[m.slot].human=false;broadcast(r);});return;
  }
  if(req.method!=='POST')fail(405,'Metode tidak tersedia.');
  const data=await body(req);
  if(membership.get(id)!==r?.code)fail(409,'Keanggotaan ruang sudah berubah.');
  if(endpoint==='/api/create'||endpoint==='/api/join'){
    if(m)fail(409,'Kamu masih berada di satu ruang.');
    const addr=req.socket.remoteAddress,now=Date.now(),b=browsers.get(addr)||{time:now,count:0};if(now-b.time>60000){b.time=now;b.count=0;}browsers.set(addr,b);if(++b.count>80)fail(429,'Terlalu banyak percobaan. Tunggu sebentar.');
    let room;
    if(endpoint==='/api/create'){
      if(rooms.size>=150)fail(503,'Server penuh. Coba lagi sebentar.');
      const config=safeConfig(data);let code;
      do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(rooms.has(code));
      room={code,config,host:id,phase:'lobby',matchId:null,members:new Map(),game:null};rooms.set(code,room);
    }else{room=rooms.get(String(data.code||'').trim().toUpperCase());if(!room)fail(404,'Kode ruang tidak ditemukan.');}
    const person=join(room,id,data.name);return json(res,memberInfo(room,person));
  }
  if(!m)fail(404,'Kamu belum berada di ruang ini.');
  if(data.code!==r.code)fail(409,'Ruang sudah berubah.');
  if(endpoint==='/api/leave'){leave(r,m);return json(res,{ok:true});}
  if(endpoint==='/api/lobby'){if(r.host!==id||r.phase!=='result')fail(409,'Menunggu tuan rumah.');r.phase='lobby';r.game=null;r.matchId=null;broadcast(r);return json(res,{ok:true});}
  if(endpoint==='/api/start'){if(r.host!==id)fail(403,'Hanya pembuat ruang yang dapat memulai.');start(r);return json(res,{ok:true});}
  if(endpoint==='/api/input'){
    if(r.phase!=='playing'||data.matchId!==r.matchId)return json(res,{ok:true});
    const now=Date.now();if(now-m.rateAt>=1000){m.rateAt=now;m.rateCount=0;}if(++m.rateCount>55)fail(429,'Input terlalu cepat.');
    if(Number.isSafeInteger(data.seq)&&data.seq>m.seq&&Number.isFinite(data.x)&&Number.isFinite(data.z)){
      m.seq=data.seq;m.inputAt=now;m.input={x:Math.max(-1,Math.min(1,data.x)),z:Math.max(-1,Math.min(1,data.z)),analog:!!data.analog,sprint:!!data.sprint};
      if(r.entrants.has(id))for(const kind of (Array.isArray(data.actions)?data.actions:[]).slice(0,3))r.game.action(m.slot,kind);
    }
    return json(res,{ok:true});
  }
  fail(404,'Permintaan tidak dikenali.');
 }catch(e){if(!res.headersSent)json(res,{error:e.status?e.message:'Gagal memproses permintaan.'},e.status||500);else res.end();}
});
let previous=performance.now(),beat=0;
setInterval(()=>{
 const time=performance.now(),elapsed=Math.min(200,time-previous);previous=time;beat++;const now=Date.now();
 for(const r of rooms.values()){
  for(const m of r.members.values())if(!m.stream&&now-m.seen>30000)leave(r,m);
  if(!r.members.size)continue;
  if(r.phase==='playing'){
    r.acc+=elapsed;const inputs={};for(const m of r.members.values())if(m.stream&&now-m.inputAt<800)inputs[m.slot]=m.input;
    while(r.acc>=1000/60){r.game.step(inputs);r.acc-=1000/60;}
    if(beat%3===0){const snap=r.game.snapshot();for(const m of r.members.values())send(m.stream,'state',snap);if(snap.ended)settle(r,snap);}
  }else if(beat%600===0){for(const m of r.members.values())send(m.stream,'pulse',{});}
 }
 if(beat%3600===0)for(const [ip,d] of browsers)if(now-d.time>60000)browsers.delete(ip);
},1000/60).unref();
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log('Benteng Kampung berjalan di port '+server.address().port));
