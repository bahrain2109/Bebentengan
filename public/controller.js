'use strict';
(() => {
  const el = id => document.getElementById(id);
  const engine = window.BentengCore;
  const pitch = window.Pitch;
  const hosting = window.BentengHosting;
  const served = /^https?:$/.test(location.protocol);
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem('bk3.' + key)) ?? fallback; }
    catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('bk3.' + key, JSON.stringify(value)); } catch {}
  }
  let solo = null, soloTime = 0, soloSteps = 0, kind = '', tab = 'solo', room = null, stream = null;
  let match = null, dismissed = null, resultHandled = false, busy = false;
  let rank = 0, startingRank = 0, seq = 0, queued = [], lastSend = 0, lastKeys = '', inFlight = false;
  let lastConfig = null, lastBest = null;
  const modeDetails = {
    classic: 'Main 3 lawan 3. Sentuh tiang sendiri untuk memperbarui panas. Tawan lawan, bebaskan kawan, dan rebut 3 angka dalam 5 menit.',
    tournament: 'Menangi 2 set untuk naik peringkat. Tiap set sampai 2 angka atau 110 detik. Jika seri, angka berikutnya menentukan set. Ambil bonus dan gunakan poin untuk meningkatkan kemampuan.',
    magrib: 'Kejar waktu terbaik. Lewati tiga pos sesuai urutan lalu kembali ke tiang sendiri sebelum 120 detik. Semua pemain berlomba tanpa saling menawan.'
  };
  const mapDetails = {
    kampung: 'Kentongan pos ronda memulihkan energi dan menandai lawan di sekitarnya selama 3,5 detik. Satu kentongan bisa dipakai lagi setelah 15 detik.',
    sawah: 'Jalan tengah berlumpur menyisakan 58% kecepatan. Pilih jalan langsung atau putar lewat pematang dan jembatan samping.',
    pasar: 'Pedagang meracik baso di tepi gang. Dua gerobak melintas di tengah. Tunggu celah atau putar lewat deretan payung.'
  };
  const inputName = () => el('nickname').value.trim().slice(0,16) || 'Pemain';
  const config = () => ({mode:el('chooseMode').value,map:el('chooseMap').value,difficulty:el('chooseDifficulty').value});
  function page(name) {
    for (const sheet of document.querySelectorAll('[data-page]')) sheet.hidden = sheet.dataset.page !== name;
    const front = el('front'); front.hidden = false; front.scrollTop = 0;
  }
  function home() {
    el('netNotice').hidden=true;
    kind = ''; solo = null; match = null; pitch?.menuView(); page('home');
    el('frontRank').textContent = '';
  }
  function textOfSetup() {
    const c = config();
    el('modeCopy').textContent = modeDetails[c.mode];
    el('mapCopy').textContent = mapDetails[c.map];
    el('frontArena').textContent = engine.MAPS[c.map].name;
    const rp = tab === 'solo' ? read('soloRank', 0) : rank;
    el('frontRank').textContent = c.mode === 'tournament' ? (tab==='solo'?'Solo':'Ruang teman')+' · '+engine.tier(rp)+' · '+rp+' RP' : '';
    if (c.mode === 'magrib') {
      const best = read('best.'+c.map,null);
      el('frontRank').textContent = best==null?'':('Rekor pribadi · '+best.toFixed(2)+' dtk');
    }
  }
  function chooseTab(value) {
    tab = value;
    el('soloTab').setAttribute('aria-pressed',String(tab==='solo'));
    el('multiTab').setAttribute('aria-pressed',String(tab==='friends'));
    el('soloOptions').hidden = tab!=='solo'; el('multiOptions').hidden = tab==='solo';
    el('setupMessage').textContent = !served && tab==='friends'?'Untuk bermain bareng, buka alamat server Benteng Kampung. Mode komputer bisa dimainkan langsung dari berkas.':'';
    textOfSetup();
  }
  function setup() { pitch?.menuView(); page('setup'); chooseTab(tab); }
  function checkGraphics() {
    if (pitch) return true;
    el('setupMessage').textContent = 'Arena membutuhkan WebGL. Aktifkan akselerasi grafis di browser lalu muat ulang.';
    return false;
  }
  function beginSolo() {
    if (!checkGraphics()) return;
    const c = config(); lastConfig = c;
    save('name',inputName()); startingRank = read('soloRank',0);
    solo = engine.createMatch(c,{0:inputName()}); kind='solo'; soloTime=0;soloSteps=0;
    resultHandled=false;lastBest=null;
    pitch.enter(c,0,false,solo.snapshot());
  }
  function soloFrame(seconds) {
    if (!solo || kind!=='solo') return;
    soloTime += Math.min(seconds,1); const input=pitch.input(); let steps=0;
    while(soloTime>=1/60){solo.step({0:input});soloTime-=1/60;steps++;}
    soloSteps+=steps;
    if (soloSteps>=2) { soloSteps%=2;pitch.receive(solo.snapshot()); }
  }
  async function api(route, data) {
    const opts = data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
    const res=await fetch('/api/'+route,{...opts,cache:'no-store'});
    let body;
    try {body=await res.json();} catch {throw new Error('Server multiplayer belum tersedia di alamat ini.');}
    if(!res.ok) throw new Error(body.error||'Koneksi ke server terputus.');
    return body;
  }
  async function perform(status,run) {
    if(busy)return;
    busy=true;el(status).textContent='';
    try{await run();}catch(e){el(status).textContent=e.message;}finally{busy=false;}
  }
  function invite(code) {
    const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',code);return url.href;
  }
  function renderRoom() {
    if(!room)return;
    const r=room;const connected=r.roster.filter(m=>m.connected).length;
    el('roomCode').textContent=r.code;el('roomMode').textContent=engine.PLAY_MODES[r.config.mode].name+' · '+engine.MAPS[r.config.map].name;
    el('frontArena').textContent=engine.MAPS[r.config.map].name;
    el('frontRank').textContent=r.config.mode==='tournament'?engine.tier(r.rp)+' · '+r.rp+' RP':'';
    const list=el('roster');list.replaceChildren();
    for(let team=0;team<2;team++){
      const card=document.createElement('div'),title=document.createElement('b');title.textContent='RT 0'+(team+1);card.append(title);
      for(let i=0;i<3;i++){const slot=team*3+i,m=r.roster.find(p=>p.slot===slot);card.append(document.createTextNode('\n'+(m?m.name+(slot===r.slot?' · kamu':'')+(m.connected?'':' · menunggu koneksi'):'Komputer')));}
      list.append(card);
    }
    el('startRoom').hidden=!r.host;
    el('startRoom').textContent=r.phase==='result'?'Buka lobi lagi':'Mulai pertandingan →';
    el('startRoom').disabled=r.phase==='lobby'?connected<2:r.phase!=='result';
    el('lobbyNote').textContent=r.phase==='result'?'Pertandingan selesai. Tuan rumah dapat membuka lobi untuk bermain lagi.':
      connected<2?'Bagikan kode atau tautan. Pertandingan bisa dimulai setelah dua pemain tersambung.':
      (r.host?'Siap dimulai.':'Menunggu tuan rumah memulai pertandingan.')+' Komputer mengisi kursi kosong.';
  }
  function lobby() { kind='';pitch?.menuView();page('lobby');renderRoom(); }
  function detach() {
    if(stream)stream.close();stream=null;room=null;match=null;dismissed=null;queued=[];el('manualLink').hidden=true;
    const url=new URL(location.href);if(served&&url.searchParams.has('room')){url.searchParams.delete('room');history.replaceState(null,'',url);}
  }
  function attach(info) {
    if(stream)stream.close();
    room=info;dismissed=null;el('lobbyMessage').textContent='';lobby();
    const es=new EventSource('/api/events');stream=es;
    es.addEventListener('room',event=>{
      if(stream!==es)return;room=JSON.parse(event.data);rank=room.rp;renderRoom();
      if(room.phase==='lobby'&&(kind==='online'||match!==null)){match=null;dismissed=null;lobby();}
      el('lobbyMessage').textContent='';
    });
    es.addEventListener('state',event=>{
      if(stream!==es||!room||!room.matchId||dismissed===room.matchId)return;
      el('netNotice').hidden=true;const s=JSON.parse(event.data);
      if(match!==room.matchId){
        match=room.matchId;kind='online';lastConfig=room.config;resultHandled=false;lastBest=null;startingRank=room.rp;
        seq=0;queued=[];lastKeys='';lastSend=0;
        pitch.enter(room.config,room.slot,true,s);
      }else pitch.receive(s);
    });
    es.addEventListener('left',()=>{if(stream===es){detach();home();}});
    let retryAt=0;
    es.onerror=async()=>{
      if(stream!==es)return;
      el('lobbyMessage').textContent='Menyambungkan kembali…';
      if(kind==='online'){el('netNotice').textContent='Koneksi terputus. Menyambungkan kembali…';el('netNotice').hidden=false;}
      if(Date.now()-retryAt<900)return;retryAt=Date.now();
      try{const me=await api('me');if(stream===es&&!me.room){detach();setup();el('setupMessage').textContent='Ruang sudah ditutup. Buat ruang baru untuk bermain lagi.';}}catch{}
    };
  }
  const boot=served&&!hosting?api('me').then(info=>{
    rank=info.rp;if(info.room&&pitch)attach(info.room);else textOfSetup();return true;
  }).catch(()=>false):Promise.resolve(false);
  function makeOrJoin(join) {
    perform('setupMessage',async()=>{
      if(!checkGraphics())return;
      if(!served)throw new Error('Jalankan server Benteng Kampung lalu buka alamatnya untuk membuat atau bergabung ke ruang.');
      const code=el('joinCode').value.trim().toUpperCase();
      if(join&&!/^[A-Z2-9]{6}$/.test(code))throw new Error('Masukkan kode enam karakter dari tuan rumah.');
      await boot;save('name',inputName());
      const result=await api(join?'join':'create',join?{code,name:inputName()}:{...config(),name:inputName()});
      attach(result);
    });
  }
  async function leaveGame() {
    if(room) {
      try{await api('leave',{code:room.code});}
      catch(e){try{const me=await api('me');if(me.room){lobby();el('lobbyMessage').textContent=e.message;return;}}catch{lobby();el('lobbyMessage').textContent='Koneksi terputus. Coba keluar ruang lagi.';return;}}
      detach();
    }
    home();
  }
  function sendNow() {
    if(kind!=='online'||!room||room.phase!=='playing'||inFlight)return;
    const t=performance.now(),data=pitch.input(),signature=[data.x.toFixed(2),data.z.toFixed(2),!!data.sprint,!!data.analog].join('/');
    if((t-lastSend<36)||(!queued.length&&signature===lastKeys&&t-lastSend<245))return;
    lastSend=t;lastKeys=signature;const actions=queued.splice(0,3);
    const packet={...data,actions,seq:++seq,matchId:match,code:room.code};inFlight=true;
    api('input',packet).catch(()=>{lastKeys='';}).finally(()=>{inFlight=false;});
  }
  function action(command) {
    if(kind==='solo'){solo?.action(0,command);return;}
    if(kind==='online'&&queued.length<4){queued.push(command);sendNow();}
  }
  function result(s) {
    if(resultHandled)return;resultHandled=true;
    const slot=kind==='online'?room.slot:0;
    if(lastConfig.mode==='tournament'&&kind==='solo')save('soloRank',Math.max(0,startingRank+(s.winner===0?25:-12)));
    if(lastConfig.mode==='magrib'&&s.players[slot].time!=null){
      const key='best.'+lastConfig.map,time=s.players[slot].time;lastBest=read(key,null);
      if(lastBest===null||time<lastBest)save(key,time);
    }
  }
  function summary(s) {
    const slot=kind==='online'?room.slot:0,team=Math.floor(slot/3);
    if(lastConfig.mode==='magrib'){
      const p=s.players[slot],finish=s.players.filter(q=>q.time!==null).sort((a,b)=>a.time-b.time);
      const mine=p.time==null?'Waktu habis · '+Math.min(3,p.checkpoint)+'/3 pos.':'Waktumu '+p.time.toFixed(2)+' detik.'+(lastBest==null||p.time<lastBest?' Rekor pribadi baru!':'');
      return mine+(finish.length?' Tercepat: '+finish[0].name+' ('+finish[0].time.toFixed(2)+' detik).':'');
    }
    const won=s.winner===team;
    const lead=s.winner==null?'Kedua RT seri.':(won?'Tim kamu menang!':'Tim kamu kalah.');
    if(lastConfig.mode==='classic')return lead+' Skor RT 01–RT 02: '+s.scores.join('–')+'.';
    const after=kind==='online'&&room.phase==='result'?room.rp:Math.max(0,startingRank+(won?25:-12));
    return lead+' Set RT 01–RT 02: '+s.wins.join('–')+'. '+after+' RP · '+engine.tier(after)+'.';
  }
  function replay() {
    if(kind==='solo'){beginSolo();return;}
    if(!room){home();return;}
    dismissed=match;lobby();
    if(room.host)perform('lobbyMessage',async()=>{await api('lobby',{code:room.code});});
  }
  window.GameApp={soloFrame,action,sendNow,result,summary,replay,leaveGame};
  el('play').onclick=setup;
  el('returnHome').onclick=home;el('quit').onclick=()=>page('exit');
  el('settings').onclick=()=>page('settings');
  el('nickname').value=read('name','');
  el('cameraSetting').value=read('camera','wide');el('motionSetting').value=read('motion','auto');
  function settings(){pitch?.settings(el('cameraSetting').value,el('motionSetting').value);}
  settings();
  el('saveSettings').onclick=()=>{save('camera',el('cameraSetting').value);save('motion',el('motionSetting').value);settings();home();};
  document.querySelectorAll('[data-back]').forEach(b=>{b.onclick=home;});
  el('chooseMap').onchange=()=>{pitch?.previewMap(el('chooseMap').value);textOfSetup();};el('chooseMode').onchange=textOfSetup;
  el('soloTab').onclick=()=>chooseTab('solo');el('multiTab').onclick=()=>{
    if(!hosting){chooseTab('friends');return;}
    if(hosting.origin && hosting.origin!==location.origin){
      const next=new URL('/',hosting.origin);next.searchParams.set('play','friends');
      next.searchParams.set('mode',el('chooseMode').value);next.searchParams.set('arena',el('chooseMap').value);
      location.assign(next.href);return;
    }
    chooseTab('solo');el('setupMessage').textContent='Demo ini dapat dimainkan melawan komputer. Ruang teman belum dihubungkan.';
  };
  el('launchSolo').onclick=beginSolo;el('createRoom').onclick=()=>makeOrJoin(false);el('joinRoom').onclick=()=>makeOrJoin(true);
  el('joinCode').onkeydown=e=>{if(e.key==='Enter')makeOrJoin(true);};
  el('startRoom').onclick=()=>perform('lobbyMessage',()=>api(room.phase==='result'?'lobby':'start',{code:room.code}));
  el('leaveLobby').onclick=leaveGame;
  el('copyLink').onclick=async()=>{
    const url=invite(room.code);
    try{await navigator.clipboard.writeText(url);el('lobbyMessage').textContent='Tautan ruang disalin.';}
    catch{const i=el('manualLink');i.hidden=false;i.value=url;i.focus();i.select();el('lobbyMessage').textContent='Salin tautan yang ditampilkan.';}
  };
  setInterval(sendNow,40);
  const code=new URLSearchParams(location.search).get('room');
  home();
  const params=new URLSearchParams(location.search);
  if(hosting && code){
    if(hosting.origin && hosting.origin!==location.origin){
      const url=new URL('/',hosting.origin);url.searchParams.set('room',code);location.replace(url.href);
    }else{setup();el('setupMessage').textContent='Ruang teman belum dihubungkan. Pilih Lawan komputer untuk mencoba demo.';}
    return;
  }
  if(!hosting && params.get('play')==='friends' && !code){
    if(Object.hasOwn(engine.PLAY_MODES,params.get('mode')))el('chooseMode').value=params.get('mode');
    if(Object.hasOwn(engine.MAPS,params.get('arena'))){el('chooseMap').value=params.get('arena');pitch?.previewMap(params.get('arena'));}
    tab='friends';setup();
  }
  if(code){el('joinCode').value=code.toUpperCase().slice(0,6);tab='friends';setup();}
})();
