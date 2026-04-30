'use strict';
/* ═══════════════════════════════════════════════════════
   CLEXYT — script.js  FINAL
   Self-contained. No external dependencies.
   ═══════════════════════════════════════════════════════ */

// ── 1. PC CURSOR ─────────────────────────────────────────
try {
  if (!('ontouchstart' in window)) {
    const dot = document.querySelector('.c-dot');
    const ring = document.querySelector('.c-ring');
    if (dot && ring) {
      dot.style.cssText  += ';width:7px;height:7px;background:#00f0e0;box-shadow:0 0 14px #00f0e0,0 0 28px rgba(0,240,224,.6);z-index:99999;';
      ring.style.cssText += ';width:48px;height:48px;border:2px solid rgba(0,240,224,.92);box-shadow:0 0 24px rgba(0,240,224,.6),0 0 8px rgba(0,240,224,.3);transition:width .18s,height .18s,border-color .18s,box-shadow .18s,transform .15s;z-index:99998;';
      let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
      (function tick(){ rx+=(mx-rx)*.12; ry+=(my-ry)*.12; dot.style.left=mx+'px'; dot.style.top=my+'px'; ring.style.left=rx+'px'; ring.style.top=ry+'px'; requestAnimationFrame(tick); })();
      window.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},{passive:true});
      document.addEventListener('mouseover',e=>{
        if(e.target.closest('a,button')){ring.style.width='64px';ring.style.height='64px';ring.style.borderColor='rgba(0,240,224,1)';ring.style.boxShadow='0 0 36px rgba(0,240,224,.9),0 0 14px rgba(0,240,224,.5)';}
      },{passive:true});
      document.addEventListener('mouseout',e=>{
        if(e.target.closest('a,button')){ring.style.width='48px';ring.style.height='48px';ring.style.borderColor='rgba(0,240,224,.92)';ring.style.boxShadow='0 0 24px rgba(0,240,224,.6),0 0 8px rgba(0,240,224,.3)';}
      },{passive:true});
      window.addEventListener('mousedown',()=>{dot.style.transform='translate(-50%,-50%) scale(2.5)';ring.style.transform='translate(-50%,-50%) scale(.5)';},{passive:true});
      window.addEventListener('mouseup',()=>{dot.style.transform='';ring.style.transform='';},{passive:true});
    }
  }
} catch(e){ console.warn('[CLX] cursor',e); }


// ── 2. MOBILE TOUCH GLOW ─────────────────────────────────
try {
  if ('ontouchstart' in window) {
    document.querySelectorAll('.c-dot,.c-ring').forEach(el=>el.style.display='none');
    const gl=document.createElement('div');
    gl.style.cssText='position:fixed;width:54px;height:54px;border-radius:50%;border:2px solid rgba(0,240,224,.88);box-shadow:0 0 26px rgba(0,240,224,.72),inset 0 0 14px rgba(0,240,224,.1);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0;transition:opacity .1s;top:0;left:0;will-change:left,top;';
    document.body.appendChild(gl);
    let gx=0,gy=0,cgx=0,cgy=0,hideT;
    (function t(){ cgx+=(gx-cgx)*.3; cgy+=(gy-cgy)*.3; gl.style.left=cgx+'px'; gl.style.top=cgy+'px'; requestAnimationFrame(t); })();
    function sg(e){ gx=e.touches[0].clientX; gy=e.touches[0].clientY; gl.style.opacity='1'; clearTimeout(hideT); hideT=setTimeout(()=>gl.style.opacity='0',800); }
    document.addEventListener('touchstart',sg,{passive:true});
    document.addEventListener('touchmove',sg,{passive:true});
    document.addEventListener('touchend',()=>{hideT=setTimeout(()=>gl.style.opacity='0',200);},{passive:true});
  }
} catch(e){ console.warn('[CLX] touch-glow',e); }


// ── 3. STARFIELD — dramatic reactive parallax ─────────────
try {
  const canvas=document.getElementById('starfield');
  if (!canvas) throw new Error('no canvas');
  const ctx=canvas.getContext('2d');
  const isMob='ontouchstart' in window;
  let W,H,stars=[],shooters=[];

  // TARGET position (where cursor/finger is)
  let tx, ty;
  // CURRENT smoothed position
  let cx, cy;

  function init(){
    W=canvas.width=innerWidth;
    H=canvas.height=innerHeight;
    // Always start at centre
    tx=W/2; ty=H/2; cx=W/2; cy=H/2;
  }

  function makeStars(){
    stars=[];
    const n=Math.min(Math.floor(W*H/1400),900);
    for(let i=0;i<n;i++){
      const roll=Math.random();
      stars.push({
        // BASE position (where the star actually lives)
        bx: Math.random()*W,
        by: Math.random()*H,
        r:  Math.random()*2.1+0.4,
        a:  Math.random()*0.45+0.55,
        tw: Math.random()*Math.PI*2,
        ts: 0.009+Math.random()*0.022,
        // Slow autonomous drift
        ddx:(Math.random()-.5)*.055,
        ddy:(Math.random()-.5)*.055,
        // Depth 0.1–1.0: deeper = moves MORE with parallax (very visible)
        d:  Math.random()*.9+0.1,
        hue:roll<.07?'c':roll<.13?'a':'w',
        // Physics velocity for attraction + burst
        vx:0, vy:0
      });
    }
  }

  function addShooter(){
    shooters.push({
      x:Math.random()*W*.65, y:Math.random()*H*.3,
      len:90+Math.random()*160, spd:13+Math.random()*10,
      ang:Math.PI/4+(Math.random()-.5)*.55,
      life:1, dec:.012+Math.random()*.011
    });
  }
  addShooter();
  setInterval(addShooter, 2200+Math.random()*2000);

  function draw(){
    // Semi-transparent wipe → motion trails so movement is unmissable
    ctx.fillStyle='rgba(10,10,16,0.15)';
    ctx.fillRect(0,0,W,H);

    // FAST lerp — stars snap toward cursor quickly and visibly
    // On mobile even faster so finger drag is immediately obvious
    const lsp = isMob ? 0.35 : 0.18;
    cx += (tx-cx)*lsp;
    cy += (ty-cy)*lsp;

    // How far cursor is from centre — this IS the parallax offset
    const ox = cx - W/2;
    const oy = cy - H/2;

    for(const s of stars){
      // Autonomous drift + physics velocity
      s.bx += s.ddx + s.vx;
      s.by += s.ddy + s.vy;
      s.vx *= 0.88;
      s.vy *= 0.88;
      s.tw += s.ts;

      // Wrap around edges
      if(s.bx<0)s.bx=W; if(s.bx>W)s.bx=0;
      if(s.by<0)s.by=H; if(s.by>H)s.by=0;

      // PARALLAX: stars drawn offset from their base position.
      // Deep stars (d≈1) shift up to 65% of cursor offset — unmissable.
      // Shallow stars (d≈0.1) shift only 6.5% — creates real depth layers.
      const fx = s.bx + ox * s.d * 0.65;
      const fy = s.by + oy * s.d * 0.65;

      // Magnetic attraction toward cursor
      const ddx=cx-fx, ddy=cy-fy;
      const dist=Math.sqrt(ddx*ddx+ddy*ddy);
      const gr=Math.min(W,H)*.38;
      if(dist<gr && dist>0){
        const force=(1-dist/gr)*0.07;
        s.vx += ddx*force*0.05;
        s.vy += ddy*force*0.05;
      }

      const ta=s.a*(0.5+0.5*Math.sin(s.tw));
      const proximity=Math.max(0,1-dist/(Math.min(W,H)*.25));
      const boost=1+proximity*2.5;
      const drawR=s.r*(1+proximity*.9);

      ctx.beginPath();
      ctx.arc(fx,fy,drawR,0,Math.PI*2);
      if(s.hue==='c'){
        ctx.fillStyle=`rgba(0,240,224,${Math.min(1,ta*boost)})`;
        if(s.r>1||proximity>.2){ctx.shadowColor='rgba(0,240,224,.95)';ctx.shadowBlur=proximity>.2?20:8;}
      } else if(s.hue==='a'){
        ctx.fillStyle=`rgba(240,165,0,${Math.min(1,ta*boost)})`;
        if(s.r>1){ctx.shadowColor='rgba(240,165,0,.85)';ctx.shadowBlur=8;}
      } else {
        ctx.fillStyle=`rgba(242,250,255,${Math.min(1,ta*boost*.9)})`;
        if(proximity>.28){ctx.shadowColor='rgba(200,240,255,.7)';ctx.shadowBlur=7;}
      }
      ctx.fill();
      ctx.shadowBlur=0;
    }

    // Shooting stars
    for(let i=shooters.length-1;i>=0;i--){
      const s=shooters[i];
      s.x+=Math.cos(s.ang)*s.spd; s.y+=Math.sin(s.ang)*s.spd; s.life-=s.dec;
      if(s.life<=0||s.x>W+300||s.y>H+300){shooters.splice(i,1);continue;}
      const g=ctx.createLinearGradient(s.x-Math.cos(s.ang)*s.len,s.y-Math.sin(s.ang)*s.len,s.x,s.y);
      g.addColorStop(0,'rgba(255,255,255,0)');
      g.addColorStop(1,`rgba(255,255,255,${s.life*.92})`);
      ctx.beginPath();
      ctx.moveTo(s.x-Math.cos(s.ang)*s.len,s.y-Math.sin(s.ang)*s.len);
      ctx.lineTo(s.x,s.y);
      ctx.strokeStyle=g; ctx.lineWidth=1.7*s.life; ctx.stroke();
    }

    // Cursor glow on canvas
    if(!isMob){
      const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,200);
      cg.addColorStop(0,'rgba(0,240,224,0.06)');
      cg.addColorStop(1,'rgba(0,240,224,0)');
      ctx.fillStyle=cg; ctx.fillRect(0,0,W,H);
    }

    requestAnimationFrame(draw);
  }

  // BURST on tap/click — scatter nearby stars
  function burst(bx,by){
    stars.forEach(s=>{
      const dx=s.bx-bx, dy=s.by-by;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<240&&dist>0){
        const force=(1-dist/240)*5.5;
        s.vx+=(dx/dist)*force; s.vy+=(dy/dist)*force;
      }
    });
  }

  init(); makeStars(); draw();
  window.addEventListener('resize',()=>{init();makeStars();},{passive:true});

  // PC — mouse moves stars
  window.addEventListener('mousemove',e=>{tx=e.clientX;ty=e.clientY;},{passive:true});
  window.addEventListener('click',e=>{if(!e.target.closest('a,button'))burst(e.clientX,e.clientY);},{passive:true});

  // Mobile — finger moves stars
  function onTouch(e){
    if(e.touches&&e.touches.length>0){
      tx=e.touches[0].clientX;
      ty=e.touches[0].clientY;
    }
  }
  document.addEventListener('touchstart',onTouch,{passive:true});
  document.addEventListener('touchmove',onTouch,{passive:true});
  document.addEventListener('touchend',e=>{
    if(e.changedTouches.length>0) burst(e.changedTouches[0].clientX,e.changedTouches[0].clientY);
  },{passive:true});

  // GYROSCOPE — tilt phone tilts the whole starfield
  if(isMob && window.DeviceOrientationEvent){
    function enableGyro(){
      window.addEventListener('deviceorientation',e=>{
        if(e.gamma==null)return;
        const gx=Math.max(-50,Math.min(50,e.gamma));
        const gy=Math.max(-40,Math.min(40,(e.beta||0)-20));
        tx=W/2+(gx/50)*(W*.55);
        ty=H/2+(gy/40)*(H*.44);
      },{passive:true});
    }
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      document.addEventListener('touchend',function ask(){
        DeviceOrientationEvent.requestPermission().then(r=>{if(r==='granted')enableGyro();}).catch(()=>{});
        document.removeEventListener('touchend',ask);
      },{once:true});
    } else { enableGyro(); }
  }

} catch(e){ console.warn('[CLX] starfield',e); }


// ── 4. BURGER MENU ───────────────────────────────────────
try {
  const nav=document.getElementById('nav');
  const burger=document.getElementById('burger');
  const mobNav=document.getElementById('mobNav');
  if(!burger||!mobNav) throw new Error('missing');

  burger.style.cssText+='position:relative!important;z-index:2147483647!important;touch-action:manipulation;-webkit-tap-highlight-color:rgba(0,240,224,.15);';

  let _lt=0;
  function toggle(){
    const now=Date.now(); if(now-_lt<500)return; _lt=now;
    const open=mobNav.classList.toggle('open');
    burger.classList.toggle('active',open);
    document.body.style.overflow=open?'hidden':'';
  }
  function close(){
    mobNav.classList.remove('open'); burger.classList.remove('active');
    document.body.style.overflow='';
  }
  burger.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle();});
  burger.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();toggle();},{passive:false});
  mobNav.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click',()=>setTimeout(close,80));
    a.addEventListener('touchend',()=>setTimeout(close,80));
  });
  document.addEventListener('touchstart',e=>{
    if(mobNav.classList.contains('open')&&!burger.contains(e.target)&&!mobNav.contains(e.target))close();
  },{passive:true});
  if(nav) window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>50),{passive:true});
} catch(e){ console.warn('[CLX] burger',e); }


// ── 5. WARP CANVAS — reusable across whole site ───────────
(function(){
  const wc=document.createElement('canvas');
  wc.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:89999;pointer-events:none;opacity:0;';
  document.body.appendChild(wc);
  const ctx2=wc.getContext('2d');
  let wW,wH,wS=[],wRun=false,wId=null,wFr=0;

  function wInit(){wW=wc.width=innerWidth;wH=wc.height=innerHeight;}
  function wMake(){wS=[];for(let i=0;i<240;i++) wS.push({x:(Math.random()-.5)*2,y:(Math.random()-.5)*2,z:Math.random(),pz:Math.random()});}

  function wDraw(){
    if(!wRun)return;
    wFr++;
    const spd=Math.min(0.03+wFr*.004,.13);
    ctx2.fillStyle='rgba(10,10,16,0.3)';
    ctx2.fillRect(0,0,wW,wH);
    const cx2=wW/2,cy2=wH/2;
    wS.forEach(s=>{
      s.pz=s.z; s.z-=spd;
      if(s.z<=0){s.z=1;s.pz=1;s.x=(Math.random()-.5)*2;s.y=(Math.random()-.5)*2;}
      const sx=(s.x/s.z)*wW*.58+cx2, sy=(s.y/s.z)*wH*.58+cy2;
      const px=(s.x/s.pz)*wW*.58+cx2, py=(s.y/s.pz)*wH*.58+cy2;
      const g=1-s.z, al=Math.min(1,g*1.5), sz=Math.max(0,g*3.5);
      ctx2.beginPath(); ctx2.moveTo(px,py); ctx2.lineTo(sx,sy);
      ctx2.strokeStyle=`rgba(${Math.floor(80+g*162)},${Math.floor(210+g*45)},255,${al})`;
      ctx2.lineWidth=sz; ctx2.stroke();
    });
    wId=requestAnimationFrame(wDraw);
  }

  // Duration: default 1000ms for nav transitions
  window.__clxWarp=function(ms){
    if(wRun)return;
    ms=ms||1000;
    wInit(); wMake(); wFr=0; wRun=true;
    wc.style.transition='opacity .08s';
    wc.style.opacity='1';
    wDraw();
    setTimeout(()=>{
      wRun=false; cancelAnimationFrame(wId);
      wc.style.transition='opacity .25s';
      wc.style.opacity='0';
      setTimeout(()=>ctx2.clearRect(0,0,wW,wH),280);
    }, ms);
  };
  wInit();
})();


// ── 6. WARP ON ALL PAGE NAVIGATION ───────────────────────
try {
  // Intercept every internal link click — show warp then navigate
  document.addEventListener('click',function(e){
    const a=e.target.closest('a[href]');
    if(!a)return;
    if(e.target.closest('#burger'))return;

    const href=a.getAttribute('href');
    if(!href||href==='#'||href.startsWith('#'))return;
    if(a.target==='_blank')return;
    if(/^(https?:|mailto:|tel:|javascript:)/.test(href))return;
    if(href.includes('wa.me'))return;

    e.preventDefault();
    if(typeof window.__clxWarp==='function') window.__clxWarp(900);
    setTimeout(()=>{ window.location.href=href; }, 820);
  },true);
} catch(e){ console.warn('[CLX] page-warp',e); }


// ── 7. SCROLL-SNAP WARP ───────────────────────────────────
try {
  const sc=document.getElementById('siteScroll');
  if(sc){
    let lastIdx=-1,snapT;
    sc.addEventListener('scroll',()=>{
      clearTimeout(snapT);
      snapT=setTimeout(()=>{
        const idx=Math.round(sc.scrollTop/sc.clientHeight);
        if(idx!==lastIdx){ lastIdx=idx; if(typeof window.__clxWarp==='function') window.__clxWarp(600); }
      },80);
    },{passive:true});
  }
} catch(e){ console.warn('[CLX] scroll-warp',e); }


// ── 8. DATA-SCROLL NAV (anchor links in single-page) ─────
try {
  document.querySelectorAll('[data-scroll]').forEach(el=>{
    el.addEventListener('click',function(e){
      const target=document.getElementById(this.dataset.scroll);
      if(!target)return;
      e.preventDefault(); e.stopPropagation();
      const mn=document.getElementById('mobNav'),bg=document.getElementById('burger');
      if(mn){mn.classList.remove('open');document.body.style.overflow='';}
      if(bg)bg.classList.remove('active');
      if(typeof window.__clxWarp==='function') window.__clxWarp(600);
      setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),120);
    });
  });
} catch(e){ console.warn('[CLX] scroll-nav',e); }


// ── 9. ROBOT HEAD ────────────────────────────────────────
try {
  const head=document.getElementById('rbHead');
  if(head){
    const pEl=document.getElementById('promptText');
    const phrases=['Choose your path','Photography or Tech?','What are we building?','Pick a side...','Both sides are good','I present two paths'];
    let idx=0;
    setInterval(()=>{idx=(idx+1)%phrases.length;if(pEl)pEl.textContent=phrases[idx];},3000);
    window.addEventListener('mousemove',e=>{
      const r=head.getBoundingClientRect();
      head.style.transform=`rotateX(${((e.clientY-r.top-r.height/2)/innerHeight)*-14}deg) rotateY(${((e.clientX-r.left-r.width/2)/innerWidth)*18}deg)`;
    },{passive:true});
    const lp=document.getElementById('choiceLeft'),rp=document.getElementById('choiceRight');
    if(lp){lp.addEventListener('mouseenter',()=>{if(pEl)pEl.textContent='Photography — a great choice';head.style.transform='rotateY(-20deg)';});lp.addEventListener('mouseleave',()=>{if(pEl)pEl.textContent=phrases[idx];});}
    if(rp){rp.addEventListener('mouseenter',()=>{if(pEl)pEl.textContent='Tech consulting — bold move';head.style.transform='rotateY(20deg)';});rp.addEventListener('mouseleave',()=>{if(pEl)pEl.textContent=phrases[idx];});}
    const pe=document.getElementById('roboParticles');
    if(pe){setInterval(()=>{
      const p=document.createElement('div'),sz=Math.random()*3+1;
      p.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;border-radius:50%;left:${40+Math.random()*180}px;top:${60+Math.random()*200}px;background:rgba(0,240,224,${Math.random()*.4+.1});box-shadow:0 0 6px rgba(0,240,224,.4);pointer-events:none;transition:all ${1.5+Math.random()*2}s ease-out;opacity:0;`;
      pe.appendChild(p);
      setTimeout(()=>{p.style.opacity='1';p.style.transform=`translateY(-${30+Math.random()*60}px) translateX(${(Math.random()-.5)*40}px)`;},10);
      setTimeout(()=>{p.style.opacity='0';setTimeout(()=>p.remove(),600);},1500+Math.random()*1000);
    },400);}
  }
} catch(e){ console.warn('[CLX] robot',e); }


// ── 10. STATS COUNTER ────────────────────────────────────
try {
  const nums=document.querySelectorAll('.stat-n');
  if(nums.length){
    const obs=new IntersectionObserver(entries=>{entries.forEach(en=>{
      if(!en.isIntersecting)return;
      const el=en.target;if(el.dataset.counted)return;el.dataset.counted='1';
      const target=parseInt(el.dataset.target),t0=performance.now();
      function step(now){const t=Math.min((now-t0)/1800,1),ease=1-Math.pow(1-t,3);el.textContent=Math.floor(ease*target)+(target>10?'+':'');if(t<1)requestAnimationFrame(step);else el.textContent=target+'+';}
      requestAnimationFrame(step);obs.unobserve(el);
    });},{threshold:.2});
    nums.forEach(n=>obs.observe(n));
  }
} catch(e){ console.warn('[CLX] stats',e); }


// ── 11. NOTIFICATIONS ────────────────────────────────────
function showNotif(msg,type){
  try{const n=document.createElement('div');n.className='notif '+(type||'success');n.textContent=msg;document.body.appendChild(n);setTimeout(()=>n.classList.add('show'),10);setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),400);},3200);}catch(e){}
}
window.showNotif=showNotif;


// ── 12. ICS CALENDAR ─────────────────────────────────────
async function loadICSCalendar(){try{const r=await fetch('calendar/merged_busy.ics?v='+Date.now());if(!r.ok)return[];return parseICS(await r.text());}catch(e){return[];}}
function parseICS(t){const ev=[];const u=t.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');u.split('BEGIN:VEVENT').slice(1).forEach(b=>{const sm=b.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);const em=b.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);if(!sm)return;ev.push({start:pID(sm[1],sm[2]==='Z'),end:em?pID(em[1],em[2]==='Z'):null});});return ev;}
function pID(s,u){const y=+s.substr(0,4),mo=+s.substr(4,2)-1,d=+s.substr(6,2),h=+s.substr(9,2),mi=+s.substr(11,2);if(u){const x=new Date(Date.UTC(y,mo,d,h,mi));x.setHours(x.getHours()+2);return x;}return new Date(y,mo,d,h,mi);}
function getBookedHoursForDate(events,ds){const[tY,tM,tD]=ds.split('-').map((v,i)=>i===1?+v-1:+v);const b=[];events.forEach(ev=>{const s=ev.start,e=ev.end;if(s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD)return;const sh=s.getHours(),eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;for(let h=sh;h<eh;h++){const sl=String(h).padStart(2,'0')+':00';if(!b.includes(sl))b.push(sl);}});return b;}
window.loadICSCalendar=loadICSCalendar; window.getBookedHoursForDate=getBookedHoursForDate;


// ── 13. SERVICE WORKER ───────────────────────────────────
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}


// ── 14. OFFLINE BANNER ───────────────────────────────────
try{
  let _b=null;
  function mkB(){const b=document.createElement('div');b.style.cssText='position:fixed;bottom:1.2rem;left:1.2rem;z-index:99990;max-width:290px;background:rgba(10,10,16,.97);border:1px solid rgba(0,240,224,.2);border-radius:4px;padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;font-family:"Space Mono",monospace;font-size:.68rem;letter-spacing:.05em;color:rgba(255,255,255,.4);transform:translateY(140%);transition:transform .4s;';b.innerHTML='<span style="color:rgba(240,165,0,.8);font-size:.95rem">◎</span><span>No signal. <a href="games.html" style="color:rgba(0,240,224,.75);text-decoration:none">Play a game?</a></span><button style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.85rem;padding:0;margin-left:auto" aria-label="close">✕</button>';b.querySelector('button').addEventListener('click',()=>b.style.transform='translateY(140%)');document.body.appendChild(b);return b;}
  function showB(){if(!_b)_b=mkB();setTimeout(()=>_b.style.transform='translateY(0)',50);}
  function hideB(){if(_b)_b.style.transform='translateY(140%)';}
  window.addEventListener('offline',showB);window.addEventListener('online',hideB);
  if(!navigator.onLine)window.addEventListener('load',()=>setTimeout(showB,1000));
}catch(e){console.warn('[CLX] offline',e);}


// ── 15. PINCH HINTS ──────────────────────────────────────
try{
  document.querySelectorAll('.pinch-hint').forEach(h=>{
    setTimeout(()=>{h.style.transition='opacity .5s';h.style.opacity='0';setTimeout(()=>h.style.display='none',500);},4000);
  });
}catch(e){}


// ── 16. SCROLL-DRIVEN 3D FOLD ─────────────────────────────
try{
  const sc=document.getElementById('siteScroll');
  const panels=document.querySelectorAll('.panel');
  if(sc&&panels.length){
    function easeOut(t){return 1-(1-t)*(1-t);}
    function updateFolds(){
      const sy=sc.scrollTop,vh=sc.clientHeight;
      panels.forEach((p,i)=>{
        if(i===0)return;
        const face=p.querySelector('.fold-face');
        if(!face)return;
        const raw=(sy-(p.offsetTop-vh))/(vh*.88);
        const prog=Math.max(0,Math.min(1,raw));
        face.style.setProperty('--rx',(1-easeOut(prog))*75+'deg');
      });
    }
    sc.addEventListener('scroll',updateFolds,{passive:true});
    updateFolds();
    window.addEventListener('resize',updateFolds,{passive:true});
  }
}catch(e){console.warn('[CLX] fold',e);}