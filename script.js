'use strict';
/* ═══════════════════════════════════════════════════════════════
   CLEXYT script.js — final
   Warp: fires on click, covers screen, CLEVITA shown, then navigates.
   Arrival: inline cover in every page <head> catches the landing.
   ═══════════════════════════════════════════════════════════════ */

// ── 1. PC CURSOR ─────────────────────────────────────────────────
try {
  if (!('ontouchstart' in window)) {
    const dot = document.querySelector('.c-dot');
    const ring = document.querySelector('.c-ring');
    if (dot && ring) {
      dot.style.cssText  += ';width:7px;height:7px;background:#00f0e0;box-shadow:0 0 14px #00f0e0,0 0 28px rgba(0,240,224,.5);z-index:99999;';
      ring.style.cssText += ';width:48px;height:48px;border:2px solid rgba(0,240,224,.9);box-shadow:0 0 22px rgba(0,240,224,.55);transition:width .18s,height .18s,border-color .18s,box-shadow .18s,transform .15s;z-index:99998;';
      let mx = innerWidth/2, my = innerHeight/2, rx = mx, ry = my;
      (function tick(){ rx+=(mx-rx)*.12; ry+=(my-ry)*.12; dot.style.left=mx+'px'; dot.style.top=my+'px'; ring.style.left=rx+'px'; ring.style.top=ry+'px'; requestAnimationFrame(tick); })();
      window.addEventListener('mousemove', e=>{ mx=e.clientX; my=e.clientY; }, {passive:true});
      document.addEventListener('mouseover', e=>{ if(e.target.closest('a,button')){ ring.style.width='64px'; ring.style.height='64px'; ring.style.borderColor='rgba(0,240,224,1)'; ring.style.boxShadow='0 0 34px rgba(0,240,224,.9)'; } }, {passive:true});
      document.addEventListener('mouseout',  e=>{ if(e.target.closest('a,button')){ ring.style.width='48px'; ring.style.height='48px'; ring.style.borderColor='rgba(0,240,224,.9)'; ring.style.boxShadow='0 0 22px rgba(0,240,224,.55)'; } }, {passive:true});
      window.addEventListener('mousedown', ()=>{ dot.style.transform='translate(-50%,-50%) scale(2.5)'; ring.style.transform='translate(-50%,-50%) scale(.5)'; }, {passive:true});
      window.addEventListener('mouseup',   ()=>{ dot.style.transform=''; ring.style.transform=''; }, {passive:true});
    }
  }
} catch(e){ console.warn('[CLX] cursor', e); }


// ── 2. MOBILE TOUCH GLOW ─────────────────────────────────────────
try {
  if ('ontouchstart' in window) {
    document.querySelectorAll('.c-dot,.c-ring').forEach(el => el.style.display = 'none');
    const gl = document.createElement('div');
    gl.style.cssText = 'position:fixed;width:52px;height:52px;border-radius:50%;border:2px solid rgba(0,240,224,.85);box-shadow:0 0 24px rgba(0,240,224,.7);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0;transition:opacity .1s;top:0;left:0;will-change:left,top;';
    document.body.appendChild(gl);
    let gx=0, gy=0, cgx=0, cgy=0, hideT;
    (function t(){ cgx+=(gx-cgx)*.3; cgy+=(gy-cgy)*.3; gl.style.left=cgx+'px'; gl.style.top=cgy+'px'; requestAnimationFrame(t); })();
    function sg(e){ gx=e.touches[0].clientX; gy=e.touches[0].clientY; gl.style.opacity='1'; clearTimeout(hideT); hideT=setTimeout(()=>gl.style.opacity='0',800); }
    document.addEventListener('touchstart', sg, {passive:true});
    document.addEventListener('touchmove',  sg, {passive:true});
    document.addEventListener('touchend', ()=>{ hideT=setTimeout(()=>gl.style.opacity='0',200); }, {passive:true});
  }
} catch(e){ console.warn('[CLX] touch-glow', e); }


// ── 3. BURGER MENU ───────────────────────────────────────────────
try {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobNav = document.getElementById('mobNav');
  if (!burger || !mobNav) throw new Error('missing elements');
  burger.style.cssText += ';position:relative!important;z-index:2147483647!important;touch-action:manipulation;';
  let _lt = 0;
  function toggle() { const now=Date.now(); if(now-_lt<500)return; _lt=now; const open=mobNav.classList.toggle('open'); burger.classList.toggle('active',open); document.body.style.overflow=open?'hidden':''; }
  function close()  { mobNav.classList.remove('open'); burger.classList.remove('active'); document.body.style.overflow=''; }
  burger.addEventListener('click',   e=>{ e.preventDefault(); e.stopPropagation(); toggle(); });
  burger.addEventListener('touchend',e=>{ e.preventDefault(); e.stopPropagation(); toggle(); }, {passive:false});
  mobNav.querySelectorAll('a').forEach(a=>{ a.addEventListener('click',   ()=>setTimeout(close,80)); a.addEventListener('touchend',()=>setTimeout(close,80)); });
  document.addEventListener('touchstart', e=>{ if(mobNav.classList.contains('open')&&!burger.contains(e.target)&&!mobNav.contains(e.target)) close(); }, {passive:true});
  if (nav) window.addEventListener('scroll', ()=>nav.classList.toggle('scrolled', scrollY>50), {passive:true});
} catch(e){ console.warn('[CLX] burger', e); }


// ── 4. WARP ENGINE ───────────────────────────────────────────────
(function(){
  /* Canvas — full screen, above everything */
  const wc = document.createElement('canvas');
  wc.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483640;pointer-events:none;opacity:0;';
  document.body.appendChild(wc);
  const wctx = wc.getContext('2d');

  /* CLEVITA label — centred on top of warp */
  const label = document.createElement('div');
  label.style.cssText = [
    'position:fixed;top:50%;left:50%;z-index:2147483645;',
    'transform:translate(-50%,-50%);text-align:center;',
    'pointer-events:none;opacity:0;transition:opacity .4s;',
    'font-family:"Syne",sans-serif;font-weight:800;letter-spacing:.14em;',
    'font-size:clamp(2.4rem,10vw,6.5rem);color:#fff;',
    'text-shadow:0 0 30px rgba(0,240,224,1),0 0 80px rgba(0,240,224,.8),0 0 160px rgba(0,240,224,.35);',
  ].join('');
  document.body.appendChild(label);

  /* Sub-label (WELCOME etc.) */
  const sub = document.createElement('div');
  sub.style.cssText = [
    'position:fixed;top:calc(50% + clamp(3rem,8vw,5.5rem));left:50%;z-index:2147483645;',
    'transform:translateX(-50%);text-align:center;',
    'pointer-events:none;opacity:0;transition:opacity .5s;',
    'font-family:"Space Mono",monospace;font-size:.8rem;letter-spacing:.35em;',
    'color:rgba(0,240,224,.65);',
  ].join('');
  document.body.appendChild(sub);

  let wW, wH, wStars = [], wRunning = false, wId = null, wFrame = 0;

  function wInit() { wW = wc.width = innerWidth; wH = wc.height = innerHeight; }

  function wMake() {
    wStars = [];
    for (let i = 0; i < 260; i++) {
      wStars.push({ x:(Math.random()-.5)*2, y:(Math.random()-.5)*2, z:Math.random()*.9+.1, pz:0 });
    }
  }

  function wDraw() {
    if (!wRunning) return;
    wFrame++;
    const spd = Math.min(.024 + wFrame*.004, .10);
    wctx.fillStyle = 'rgba(6,6,9,.30)';
    wctx.fillRect(0, 0, wW, wH);
    const cx2 = wW/2, cy2 = wH/2;
    wStars.forEach(s => {
      s.pz = s.z; s.z -= spd;
      if (s.z <= 0) { s.z=1; s.pz=1; s.x=(Math.random()-.5)*2; s.y=(Math.random()-.5)*2; }
      const sx = (s.x/s.z)*wW*.55+cx2, sy = (s.y/s.z)*wH*.55+cy2;
      const px = (s.x/s.pz)*wW*.55+cx2, py = (s.y/s.pz)*wH*.55+cy2;
      const g = 1-s.z, al = Math.min(1,g*1.6), sz = Math.max(0,g*3.3);
      wctx.beginPath(); wctx.moveTo(px,py); wctx.lineTo(sx,sy);
      wctx.strokeStyle = `rgba(${Math.floor(60+g*185)},${Math.floor(200+g*55)},255,${al})`;
      wctx.lineWidth = sz; wctx.stroke();
    });
    wId = requestAnimationFrame(wDraw);
  }

  /* Public API — called with duration ms and optional callback fired near end */
  window.__clxWarp = function(ms, labelText, subText, onMidpoint) {
    if (wRunning) return;
    ms = ms || 1500;
    wInit(); wMake(); wFrame = 0; wRunning = true;

    /* Cover screen INSTANTLY — no fade-in delay, no flash of page behind */
    wc.style.transition = 'none';
    wc.style.opacity = '1';
    wDraw();

    /* Show main label after 180ms */
    label.textContent = labelText || 'CLEVITA';
    sub.textContent   = '';
    sub.style.opacity = '0';
    setTimeout(() => { label.style.opacity = '1'; }, 180);

    /* Show sub-label if provided */
    if (subText) {
      setTimeout(() => { sub.textContent = subText; sub.style.opacity = '1'; }, ms * 0.65);
    }

    /* Midpoint callback — fire at 80% so page loads under cover */
    if (onMidpoint) setTimeout(onMidpoint, Math.floor(ms * 0.80));

    /* Fade out warp after full duration */
    setTimeout(() => {
      label.style.opacity = '0';
      sub.style.opacity   = '0';
      wRunning = false;
      cancelAnimationFrame(wId);
      wc.style.transition = 'opacity .45s cubic-bezier(.4,0,.2,1)';
      wc.style.opacity = '0';
      setTimeout(() => wctx.clearRect(0,0,wW,wH), 500);
    }, ms);
  };

  wInit();
})();


// ── 5. PAGE NAVIGATION — warp fires first, then navigate ─────────
try {
  let _navLock = false;

  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (e.target.closest('#burger')) return;
    if (_navLock) return;

    const href = a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#')) return;
    if (a.target === '_blank') return;
    if (/^(https?:|mailto:|tel:|javascript:)/.test(href)) return;
    if (href.includes('wa.me')) return;

    e.preventDefault();
    _navLock = true;

    /* Flag for the arriving page — it covers itself immediately */
    try { sessionStorage.setItem('clxArriving', '1'); } catch(err) {}

    /* Warp for 1.5s, navigate at 80% through (≈1200ms) */
    window.__clxWarp(1500, 'CLEVITA', null, () => {
      window.location.href = href;
    });

  }, true); /* capture phase — intercepts before other handlers */

} catch(e){ console.warn('[CLX] nav', e); }


// ── 6. ROBOT HEAD TRACKING ───────────────────────────────────────
try {
  const head = document.getElementById('rbHead');
  if (head) {
    const pEl = document.getElementById('promptText');
    const phrases = ['Choose your path','Photography or Tech?','What are we building?','Pick a side...','Both sides are good','I present two paths'];
    let idx = 0;
    setInterval(() => { idx=(idx+1)%phrases.length; if(pEl) pEl.textContent=phrases[idx]; }, 3000);
    window.addEventListener('mousemove', e => {
      const r = head.getBoundingClientRect();
      head.style.transform = `rotateX(${((e.clientY-r.top-r.height/2)/innerHeight)*-14}deg) rotateY(${((e.clientX-r.left-r.width/2)/innerWidth)*18}deg)`;
    }, {passive:true});
    const lp=document.getElementById('choiceLeft'), rp=document.getElementById('choiceRight');
    if(lp){ lp.addEventListener('mouseenter',()=>{ if(pEl)pEl.textContent='Photography — a great choice'; head.style.transform='rotateY(-20deg)'; }); lp.addEventListener('mouseleave',()=>{ if(pEl)pEl.textContent=phrases[idx]; }); }
    if(rp){ rp.addEventListener('mouseenter',()=>{ if(pEl)pEl.textContent='Tech consulting — bold move'; head.style.transform='rotateY(20deg)'; }); rp.addEventListener('mouseleave',()=>{ if(pEl)pEl.textContent=phrases[idx]; }); }
    const pe = document.getElementById('roboParticles');
    if (pe) { setInterval(() => {
      const p=document.createElement('div'), sz=Math.random()*3+1;
      p.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;border-radius:50%;left:${40+Math.random()*180}px;top:${60+Math.random()*200}px;background:rgba(0,240,224,${Math.random()*.4+.1});box-shadow:0 0 6px rgba(0,240,224,.4);pointer-events:none;transition:all ${1.5+Math.random()*2}s ease-out;opacity:0;`;
      pe.appendChild(p);
      setTimeout(()=>{ p.style.opacity='1'; p.style.transform=`translateY(-${30+Math.random()*60}px) translateX(${(Math.random()-.5)*40}px)`; },10);
      setTimeout(()=>{ p.style.opacity='0'; setTimeout(()=>p.remove(),600); },1500+Math.random()*1000);
    }, 400); }
  }
} catch(e){ console.warn('[CLX] robot', e); }


// ── 7. STATS COUNTER ─────────────────────────────────────────────
try {
  const nums = document.querySelectorAll('.stat-n');
  if (nums.length) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el=en.target; if(el.dataset.counted) return; el.dataset.counted='1';
        const target=parseInt(el.dataset.target), t0=performance.now();
        function step(now){ const t=Math.min((now-t0)/1800,1),ease=1-Math.pow(1-t,3); el.textContent=Math.floor(ease*target)+(target>10?'+':''); if(t<1)requestAnimationFrame(step); else el.textContent=target+'+'; }
        requestAnimationFrame(step); obs.unobserve(el);
      });
    }, {threshold:.2});
    nums.forEach(n => obs.observe(n));
  }
} catch(e){ console.warn('[CLX] stats', e); }


// ── 8. NOTIFICATIONS ─────────────────────────────────────────────
function showNotif(msg, type) {
  try {
    const n = document.createElement('div');
    n.className = 'notif '+(type||'success'); n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(()=>n.classList.add('show'),10);
    setTimeout(()=>{ n.classList.remove('show'); setTimeout(()=>n.remove(),400); },3200);
  } catch(e){}
}
window.showNotif = showNotif;


// ── 9. ICS CALENDAR ──────────────────────────────────────────────
async function loadICSCalendar(){try{const r=await fetch('calendar/merged_busy.ics?v='+Date.now());if(!r.ok)return[];return parseICS(await r.text());}catch(e){return[];}}
function parseICS(t){const ev=[];const u=t.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');u.split('BEGIN:VEVENT').slice(1).forEach(b=>{const sm=b.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);const em=b.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);if(!sm)return;ev.push({start:pID(sm[1],sm[2]==='Z'),end:em?pID(em[1],em[2]==='Z'):null});});return ev;}
function pID(s,u){const y=+s.substr(0,4),mo=+s.substr(4,2)-1,d=+s.substr(6,2),h=+s.substr(9,2),mi=+s.substr(11,2);if(u){const x=new Date(Date.UTC(y,mo,d,h,mi));x.setHours(x.getHours()+2);return x;}return new Date(y,mo,d,h,mi);}
function getBookedHoursForDate(events,ds){const[tY,tM,tD]=ds.split('-').map((v,i)=>i===1?+v-1:+v);const b=[];events.forEach(ev=>{const s=ev.start,e=ev.end;if(s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD)return;const sh=s.getHours(),eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;for(let h=sh;h<eh;h++){const sl=String(h).padStart(2,'0')+':00';if(!b.includes(sl))b.push(sl);}});return b;}
window.loadICSCalendar=loadICSCalendar; window.getBookedHoursForDate=getBookedHoursForDate;


// ── 10. SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}


// ── 11. OFFLINE BANNER ───────────────────────────────────────────
try {
  let _b = null;
  function mkB(){ const b=document.createElement('div'); b.style.cssText='position:fixed;bottom:1.2rem;left:1.2rem;z-index:9990;max-width:290px;background:rgba(6,6,9,.97);border:1px solid rgba(0,240,224,.2);border-radius:4px;padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;font-family:"Space Mono",monospace;font-size:.68rem;color:rgba(255,255,255,.4);transform:translateY(140%);transition:transform .4s;'; b.innerHTML='<span style="color:rgba(240,165,0,.8)">◎</span><span>No signal. <a href="games.html" style="color:rgba(0,240,224,.75);text-decoration:none">Play a game?</a></span><button style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.85rem;padding:0;margin-left:auto">✕</button>'; b.querySelector('button').addEventListener('click',()=>b.style.transform='translateY(140%)'); document.body.appendChild(b); return b; }
  function showB(){ if(!_b)_b=mkB(); setTimeout(()=>_b.style.transform='translateY(0)',50); }
  function hideB(){ if(_b)_b.style.transform='translateY(140%)'; }
  window.addEventListener('offline', showB); window.addEventListener('online', hideB);
  if (!navigator.onLine) window.addEventListener('load', ()=>setTimeout(showB,1000));
} catch(e){ console.warn('[CLX] offline', e); }


// ── 12. PINCH HINTS ──────────────────────────────────────────────
try {
  document.querySelectorAll('.pinch-hint').forEach(h => {
    setTimeout(()=>{ h.style.transition='opacity .5s'; h.style.opacity='0'; setTimeout(()=>h.style.display='none',500); }, 4000);
  });
} catch(e){}