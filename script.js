'use strict';
/* ═══════════════════════════════════════════════════════════════
   CLEXYT — script.js v7
   Starfield → starfield.js (not here)
   3D fold transition → REMOVED
   Warp → covers screen FIRST, then navigates
   ═══════════════════════════════════════════════════════════════ */


// ── 1. PC CURSOR ─────────────────────────────────────────────────
try {
  if (!('ontouchstart' in window)) {
    const dot  = document.querySelector('.c-dot');
    const ring = document.querySelector('.c-ring');
    if (dot && ring) {
      dot.style.cssText  += ';width:7px;height:7px;background:#00f0e0;box-shadow:0 0 14px #00f0e0,0 0 28px rgba(0,240,224,.6);z-index:99999;';
      ring.style.cssText += ';width:48px;height:48px;border:2px solid rgba(0,240,224,.92);box-shadow:0 0 24px rgba(0,240,224,.6);transition:width .18s,height .18s,border-color .18s,box-shadow .18s,transform .15s;z-index:99998;';
      let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
      (function tick(){ rx+=(mx-rx)*.12; ry+=(my-ry)*.12; dot.style.left=mx+'px'; dot.style.top=my+'px'; ring.style.left=rx+'px'; ring.style.top=ry+'px'; requestAnimationFrame(tick); })();
      window.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},{passive:true});
      document.addEventListener('mouseover',e=>{
        if(e.target.closest('a,button')){ring.style.width='64px';ring.style.height='64px';ring.style.borderColor='rgba(0,240,224,1)';ring.style.boxShadow='0 0 36px rgba(0,240,224,.9)';}
      },{passive:true});
      document.addEventListener('mouseout',e=>{
        if(e.target.closest('a,button')){ring.style.width='48px';ring.style.height='48px';ring.style.borderColor='rgba(0,240,224,.92)';ring.style.boxShadow='0 0 24px rgba(0,240,224,.6)';}
      },{passive:true});
      window.addEventListener('mousedown',()=>{dot.style.transform='translate(-50%,-50%) scale(2.5)';ring.style.transform='translate(-50%,-50%) scale(.5)';},{passive:true});
      window.addEventListener('mouseup',()=>{dot.style.transform='';ring.style.transform='';},{passive:true});
    }
  }
} catch(e){ console.warn('[CLX] cursor',e); }


// ── 2. MOBILE TOUCH GLOW ─────────────────────────────────────────
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


// ── 3. BURGER MENU ───────────────────────────────────────────────
try {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobNav = document.getElementById('mobNav');
  if (!burger || !mobNav) throw new Error('missing');
  burger.style.cssText += ';position:relative!important;z-index:2147483647!important;touch-action:manipulation;';
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


// ── 4. WARP CANVAS ───────────────────────────────────────────────
// Sits at z-index 99999. Covers screen BEFORE navigation fires.
(function(){
  const wc = document.createElement('canvas');
  wc.style.cssText = [
    'position:fixed;inset:0;width:100%;height:100%;',
    'z-index:99999;pointer-events:none;',
    'opacity:0;background:#0a0a10;',
    'transition:none;',
  ].join('');
  document.body.appendChild(wc);
  const wctx = wc.getContext('2d');
  let wW,wH,wS=[],wRun=false,wId=null,wFr=0;

  function wInit(){
    wW=wc.width=innerWidth;
    wH=wc.height=innerHeight;
  }
  function wMake(){
    wS=[];
    for(let i=0;i<240;i++) wS.push({
      x:(Math.random()-.5)*2, y:(Math.random()-.5)*2,
      z:Math.random()*0.9+0.1, pz:0
    });
  }
  function wDraw(){
    if(!wRun)return;
    wFr++;
    const spd=Math.min(0.028+wFr*.0045,.11);
    wctx.fillStyle='rgba(10,10,16,0.32)';
    wctx.fillRect(0,0,wW,wH);
    const cx2=wW/2, cy2=wH/2;
    wS.forEach(s=>{
      s.pz=s.z; s.z-=spd;
      if(s.z<=0){s.z=1;s.pz=1;s.x=(Math.random()-.5)*2;s.y=(Math.random()-.5)*2;}
      const sx=(s.x/s.z)*wW*.55+cx2, sy=(s.y/s.z)*wH*.55+cy2;
      const px=(s.x/s.pz)*wW*.55+cx2, py=(s.y/s.pz)*wH*.55+cy2;
      const g=1-s.z, al=Math.min(1,g*1.6), sz=Math.max(0,g*3.2);
      wctx.beginPath(); wctx.moveTo(px,py); wctx.lineTo(sx,sy);
      wctx.strokeStyle=`rgba(${Math.floor(80+g*165)},${Math.floor(210+g*44)},255,${al})`;
      wctx.lineWidth=sz; wctx.stroke();
    });
    wId=requestAnimationFrame(wDraw);
  }

  // Called with duration (ms). Canvas fades in INSTANTLY, warp plays, THEN page navigates.
  window.__clxWarp = function(ms, onComplete) {
    if(wRun) return;
    ms = ms || 900;
    wInit(); wMake(); wFr=0; wRun=true;
    // Instant full opacity — no fade-in delay
    wc.style.transition='none';
    wc.style.opacity='1';
    wDraw();
    setTimeout(()=>{
      if(onComplete) onComplete(); // navigate NOW while warp still showing
      setTimeout(()=>{
        wRun=false; cancelAnimationFrame(wId);
        wc.style.transition='opacity .35s';
        wc.style.opacity='0';
        setTimeout(()=>{ wctx.clearRect(0,0,wW,wH); },380);
      }, 400); // fade out warp after new page has loaded
    }, ms - 80);
  };

  wInit();

  // ── ARRIVAL COVER — runs on every page load ──
  // If we arrived via warp, the screen is already dark on the old page.
  // We need to keep it dark on the new page until it's ready, then reveal.
  (function(){
    let arriving = false;
    try{ arriving = sessionStorage.getItem('clxArriving') === '1'; }catch(e){}
    if(!arriving) return;
    try{ sessionStorage.removeItem('clxArriving'); }catch(e){}

    // Cover immediately with same dark colour — no flash
    const cover = document.createElement('div');
    cover.style.cssText = [
      'position:fixed;inset:0;z-index:99998;',
      'background:#0a0a10;',
      'pointer-events:none;',
      'opacity:1;',
      'transition:opacity 0.55s cubic-bezier(0.4,0,0.2,1);',
    ].join('');
    document.body.appendChild(cover);

    // Reveal once page is painted
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      cover.style.opacity = '0';
      setTimeout(()=>cover.remove(), 620);
    }));
  })();
})();


// ── 5. PAGE NAVIGATION WITH WARP ─────────────────────────────────
try {
  let _navLock=false;
  document.addEventListener('click', function(e){
    const a=e.target.closest('a[href]');
    if(!a) return;
    if(e.target.closest('#burger')) return;
    if(_navLock) return;

    const href=a.getAttribute('href');
    if(!href||href==='#'||href.startsWith('#')) return;
    if(a.target==='_blank') return;
    if(/^(https?:|mailto:|tel:|javascript:)/.test(href)) return;
    if(href.includes('wa.me')) return;

    e.preventDefault();
    _navLock=true;

    // Warp fires, THEN navigate. Page never seen before warp.
    if(typeof window.__clxWarp==='function'){
      window.__clxWarp(850, ()=>{
        try{ sessionStorage.setItem('clxArriving','1'); }catch(e){}
        window.location.href=href;
      });
    } else {
      try{ sessionStorage.setItem('clxArriving','1'); }catch(e){}
      window.location.href=href;
    }
  }, true);
} catch(e){ console.warn('[CLX] page-nav',e); }


// ── 6. DATA-SCROLL NAV (single-page anchor links) ────────────────
try {
  document.querySelectorAll('[data-scroll]').forEach(el=>{
    el.addEventListener('click',function(e){
      const target=document.getElementById(this.dataset.scroll);
      if(!target) return;
      e.preventDefault(); e.stopPropagation();
      const mn=document.getElementById('mobNav'),bg=document.getElementById('burger');
      if(mn){mn.classList.remove('open');document.body.style.overflow='';}
      if(bg) bg.classList.remove('active');
      target.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
} catch(e){ console.warn('[CLX] scroll-nav',e); }


// ── 7. SCROLL-SNAP SECTION WARP (index.html only) ─────────────────
try {
  const sc=document.getElementById('siteScroll');
  if(sc){
    let lastIdx=-1, snapT, lastWarpT=0;
    sc.addEventListener('scroll',()=>{
      clearTimeout(snapT);
      snapT=setTimeout(()=>{
        const idx=Math.round(sc.scrollTop/sc.clientHeight);
        const now=Date.now();
        if(idx!==lastIdx && now-lastWarpT>1500){
          lastIdx=idx; lastWarpT=now;
          if(typeof window.__clxWarp==='function') window.__clxWarp(500);
        } else {
          lastIdx=idx;
        }
      },160);
    },{passive:true});
  }
} catch(e){ console.warn('[CLX] scroll-warp',e); }


// ── 8. ROBOT HEAD TRACKING ───────────────────────────────────────
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


// ── 9. STATS COUNTER ─────────────────────────────────────────────
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


// ── 10. NOTIFICATIONS ────────────────────────────────────────────
function showNotif(msg,type){
  try{const n=document.createElement('div');n.className='notif '+(type||'success');n.textContent=msg;document.body.appendChild(n);setTimeout(()=>n.classList.add('show'),10);setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),400);},3200);}catch(e){}
}
window.showNotif=showNotif;


// ── 11. ICS CALENDAR ─────────────────────────────────────────────
async function loadICSCalendar(){try{const r=await fetch('calendar/merged_busy.ics?v='+Date.now());if(!r.ok)return[];return parseICS(await r.text());}catch(e){return[];}}
function parseICS(t){const ev=[];const u=t.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');u.split('BEGIN:VEVENT').slice(1).forEach(b=>{const sm=b.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);const em=b.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);if(!sm)return;ev.push({start:pID(sm[1],sm[2]==='Z'),end:em?pID(em[1],em[2]==='Z'):null});});return ev;}
function pID(s,u){const y=+s.substr(0,4),mo=+s.substr(4,2)-1,d=+s.substr(6,2),h=+s.substr(9,2),mi=+s.substr(11,2);if(u){const x=new Date(Date.UTC(y,mo,d,h,mi));x.setHours(x.getHours()+2);return x;}return new Date(y,mo,d,h,mi);}
function getBookedHoursForDate(events,ds){const[tY,tM,tD]=ds.split('-').map((v,i)=>i===1?+v-1:+v);const b=[];events.forEach(ev=>{const s=ev.start,e=ev.end;if(s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD)return;const sh=s.getHours(),eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;for(let h=sh;h<eh;h++){const sl=String(h).padStart(2,'0')+':00';if(!b.includes(sl))b.push(sl);}});return b;}
window.loadICSCalendar=loadICSCalendar; window.getBookedHoursForDate=getBookedHoursForDate;


// ── 12. SERVICE WORKER ───────────────────────────────────────────
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}


// ── 13. OFFLINE BANNER ───────────────────────────────────────────
try{
  let _b=null;
  function mkB(){const b=document.createElement('div');b.style.cssText='position:fixed;bottom:1.2rem;left:1.2rem;z-index:9990;max-width:290px;background:rgba(10,10,16,.97);border:1px solid rgba(0,240,224,.2);border-radius:4px;padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;font-family:"Space Mono",monospace;font-size:.68rem;letter-spacing:.05em;color:rgba(255,255,255,.4);transform:translateY(140%);transition:transform .4s;';b.innerHTML='<span style="color:rgba(240,165,0,.8);font-size:.95rem">◎</span><span>No signal. <a href="games.html" style="color:rgba(0,240,224,.75);text-decoration:none">Play a game?</a></span><button style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.85rem;padding:0;margin-left:auto" aria-label="close">✕</button>';b.querySelector('button').addEventListener('click',()=>b.style.transform='translateY(140%)');document.body.appendChild(b);return b;}
  function showB(){if(!_b)_b=mkB();setTimeout(()=>_b.style.transform='translateY(0)',50);}
  function hideB(){if(_b)_b.style.transform='translateY(140%)';}
  window.addEventListener('offline',showB);window.addEventListener('online',hideB);
  if(!navigator.onLine)window.addEventListener('load',()=>setTimeout(showB,1000));
}catch(e){console.warn('[CLX] offline',e);}


// ── 14. PINCH HINTS ──────────────────────────────────────────────
try{
  document.querySelectorAll('.pinch-hint').forEach(h=>{
    setTimeout(()=>{h.style.transition='opacity .5s';h.style.opacity='0';setTimeout(()=>h.style.display='none',500);},4000);
  });
}catch(e){}