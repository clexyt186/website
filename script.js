'use strict';
/* ═══════════════════════════════════════════════════════════════
   CLEXYT — script.js  v5
   Starfield lives in starfield.js — not here.
   Each feature in its own try/catch.
   ═══════════════════════════════════════════════════════════════ */

// ── 1. PC CURSOR ─────────────────────────────────────────────────
try {
  if (!('ontouchstart' in window)) {
    const dot  = document.querySelector('.c-dot');
    const ring = document.querySelector('.c-ring');
    if (dot && ring) {
      dot.style.cssText  += ';width:7px;height:7px;background:#00f0e0;box-shadow:0 0 14px #00f0e0,0 0 28px rgba(0,240,224,0.6);z-index:99999;';
      ring.style.cssText += ';width:46px;height:46px;border:2px solid rgba(0,240,224,0.92);box-shadow:0 0 22px rgba(0,240,224,0.55),0 0 8px rgba(0,240,224,0.3);transition:width .18s,height .18s,border-color .18s,box-shadow .18s,transform .15s;z-index:99998;';

      let mx = innerWidth/2, my = innerHeight/2, rx = mx, ry = my;
      (function tick(){
        rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
        dot.style.left  = mx+'px'; dot.style.top  = my+'px';
        ring.style.left = rx+'px'; ring.style.top = ry+'px';
        requestAnimationFrame(tick);
      })();

      window.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; }, {passive:true});

      document.addEventListener('mouseover', e => {
        if (e.target.closest('a,button,[role="button"]')) {
          ring.style.width='62px'; ring.style.height='62px';
          ring.style.borderColor='rgba(0,240,224,1)';
          ring.style.boxShadow='0 0 34px rgba(0,240,224,0.85),0 0 14px rgba(0,240,224,0.5)';
        }
      }, {passive:true});
      document.addEventListener('mouseout', e => {
        if (e.target.closest('a,button,[role="button"]')) {
          ring.style.width='46px'; ring.style.height='46px';
          ring.style.borderColor='rgba(0,240,224,0.92)';
          ring.style.boxShadow='0 0 22px rgba(0,240,224,0.55),0 0 8px rgba(0,240,224,0.3)';
        }
      }, {passive:true});
      window.addEventListener('mousedown', () => {
        dot.style.transform='translate(-50%,-50%) scale(2.5)';
        ring.style.transform='translate(-50%,-50%) scale(0.5)';
      }, {passive:true});
      window.addEventListener('mouseup', () => {
        dot.style.transform=''; ring.style.transform='';
      }, {passive:true});
    }
  }
} catch(e){ console.warn('[CLX] cursor',e); }


// ── 2. MOBILE TOUCH GLOW ─────────────────────────────────────────
try {
  if ('ontouchstart' in window) {
    document.querySelectorAll('.c-dot,.c-ring').forEach(el=>el.style.display='none');
    const gl = document.createElement('div');
    gl.style.cssText='position:fixed;width:54px;height:54px;border-radius:50%;border:2px solid rgba(0,240,224,0.88);box-shadow:0 0 26px rgba(0,240,224,0.72),inset 0 0 14px rgba(0,240,224,0.1);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0;transition:opacity .1s;top:0;left:0;will-change:left,top;';
    document.body.appendChild(gl);
    let gx=0,gy=0,cgx=0,cgy=0,hideT;
    (function glTick(){ cgx+=(gx-cgx)*0.28; cgy+=(gy-cgy)*0.28; gl.style.left=cgx+'px'; gl.style.top=cgy+'px'; requestAnimationFrame(glTick); })();
    function showGl(e){ gx=e.touches[0].clientX; gy=e.touches[0].clientY; gl.style.opacity='1'; clearTimeout(hideT); hideT=setTimeout(()=>gl.style.opacity='0',800); }
    document.addEventListener('touchstart',showGl,{passive:true});
    document.addEventListener('touchmove',showGl,{passive:true});
    document.addEventListener('touchend',()=>{ hideT=setTimeout(()=>gl.style.opacity='0',200); },{passive:true});
  }
} catch(e){ console.warn('[CLX] touch-glow',e); }


// ── 3. BURGER MENU ───────────────────────────────────────────────
try {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobNav = document.getElementById('mobNav');
  if (!burger || !mobNav) throw new Error('Missing burger/mobNav');

  burger.style.cssText += ';position:relative!important;z-index:2147483647!important;touch-action:manipulation;-webkit-tap-highlight-color:rgba(0,240,224,0.15);';

  let _lt = 0;
  function toggle() {
    const now = Date.now();
    if (now - _lt < 500) return;
    _lt = now;
    const open = mobNav.classList.toggle('open');
    burger.classList.toggle('active', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  function close() {
    mobNav.classList.remove('open');
    burger.classList.remove('active');
    document.body.style.overflow = '';
  }

  burger.addEventListener('click',   e=>{ e.preventDefault(); e.stopPropagation(); toggle(); });
  burger.addEventListener('touchend',e=>{ e.preventDefault(); e.stopPropagation(); toggle(); },{passive:false});

  mobNav.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click',   ()=>setTimeout(close,80));
    a.addEventListener('touchend',()=>setTimeout(close,80));
  });
  document.addEventListener('touchstart',e=>{
    if (mobNav.classList.contains('open')&&!burger.contains(e.target)&&!mobNav.contains(e.target)) close();
  },{passive:true});

  if (nav) window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>50),{passive:true});

} catch(e){ console.warn('[CLX] burger',e); }


// ── 4. WARP TRANSITION — plays on section enter ──────────────────
// Small reusable warp flash between sections / pages
(function(){
  const warpEl = document.createElement('canvas');
  warpEl.id = 'sectionWarp';
  warpEl.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:89999;pointer-events:none;opacity:0;transition:opacity .12s;';
  document.body.appendChild(warpEl);
  const wctx = warpEl.getContext('2d');
  let wW, wH, wStars=[], wRunning=false, wAnimId=null;

  function wInit(){
    wW = warpEl.width  = window.innerWidth;
    wH = warpEl.height = window.innerHeight;
  }
  function wMake(){
    wStars=[];
    for(let i=0;i<220;i++){
      wStars.push({
        x:(Math.random()-.5)*2, y:(Math.random()-.5)*2,
        z:Math.random(), pz:Math.random()
      });
    }
  }

  let wFrame=0;
  function wDraw(){
    if(!wRunning) return;
    wFrame++;
    const speed = Math.min(0.03 + wFrame*0.004, 0.12);
    wctx.fillStyle = 'rgba(10,10,16,0.35)';
    wctx.fillRect(0,0,wW,wH);
    const cx2=wW/2, cy2=wH/2;
    wStars.forEach(s=>{
      s.pz=s.z; s.z-=speed;
      if(s.z<=0){s.z=1;s.pz=1;s.x=(Math.random()-.5)*2;s.y=(Math.random()-.5)*2;}
      const sx=(s.x/s.z)*wW*0.55+cx2, sy=(s.y/s.z)*wH*0.55+cy2;
      const px=(s.x/s.pz)*wW*0.55+cx2, py=(s.y/s.pz)*wH*0.55+cy2;
      const size=Math.max(0,(1-s.z)*3.5);
      const alpha=Math.min(1,(1-s.z)*1.6);
      const g=(1-s.z);
      wctx.beginPath();
      wctx.moveTo(px,py); wctx.lineTo(sx,sy);
      wctx.strokeStyle=`rgba(${Math.floor(100+g*142)},${Math.floor(220+g*30)},255,${alpha})`;
      wctx.lineWidth=size; wctx.stroke();
    });
    wAnimId=requestAnimationFrame(wDraw);
  }

  // Public: flash warp for ~600ms
  window.__clxWarp = function() {
    if(wRunning) return;
    wInit(); wMake(); wFrame=0; wRunning=true;
    warpEl.style.opacity='1';
    wDraw();
    setTimeout(()=>{
      wRunning=false;
      cancelAnimationFrame(wAnimId);
      warpEl.style.opacity='0';
      setTimeout(()=>{ wctx.clearRect(0,0,wW,wH); },140);
    }, 580);
  };
  wInit();
})();


// ── 5. SCROLL-SNAP WARP — fires when new panel snaps into view ───
try {
  const sc = document.getElementById('siteScroll');
  if (sc) {
    let lastSnap = -1, snapT;
    sc.addEventListener('scroll', ()=>{
      clearTimeout(snapT);
      snapT = setTimeout(()=>{
        const idx = Math.round(sc.scrollTop / sc.clientHeight);
        if (idx !== lastSnap) {
          lastSnap = idx;
          if (typeof window.__clxWarp === 'function') window.__clxWarp();
        }
      }, 80);
    }, {passive:true});
  }
} catch(e){ console.warn('[CLX] scroll-warp',e); }


// ── 6. DATA-SCROLL NAV LINKS — anchor scroll + warp ─────────────
try {
  document.querySelectorAll('[data-scroll]').forEach(el=>{
    el.addEventListener('click', function(e){
      const target = document.getElementById(this.dataset.scroll);
      if (!target) return;
      e.preventDefault(); e.stopPropagation();
      // Close burger
      const mn=document.getElementById('mobNav'), bg=document.getElementById('burger');
      if(mn){ mn.classList.remove('open'); document.body.style.overflow=''; }
      if(bg) bg.classList.remove('active');
      // Warp flash then scroll
      if (typeof window.__clxWarp === 'function') window.__clxWarp();
      setTimeout(()=>{ target.scrollIntoView({behavior:'smooth',block:'start'}); }, 120);
    });
  });
} catch(e){ console.warn('[CLX] scroll-nav',e); }


// ── 7. ROBOT HEAD TRACKING ───────────────────────────────────────
try {
  const head = document.getElementById('rbHead');
  if (head) {
    const pEl    = document.getElementById('promptText');
    const phrases= ['Choose your path','Photography or Tech?','What are we building?','Pick a side...','Both sides are good','I present two paths'];
    let idx=0;
    setInterval(()=>{ idx=(idx+1)%phrases.length; if(pEl) pEl.textContent=phrases[idx]; },3000);
    window.addEventListener('mousemove',e=>{
      const r=head.getBoundingClientRect();
      const dx=(e.clientX-r.left-r.width/2)/innerWidth;
      const dy=(e.clientY-r.top-r.height/2)/innerHeight;
      head.style.transform=`rotateX(${dy*-14}deg) rotateY(${dx*18}deg)`;
    },{passive:true});
    const lp=document.getElementById('choiceLeft'),rp=document.getElementById('choiceRight');
    if(lp){ lp.addEventListener('mouseenter',()=>{ if(pEl) pEl.textContent='Photography — a great choice'; head.style.transform='rotateY(-20deg)'; }); lp.addEventListener('mouseleave',()=>{ if(pEl) pEl.textContent=phrases[idx]; }); }
    if(rp){ rp.addEventListener('mouseenter',()=>{ if(pEl) pEl.textContent='Tech consulting — bold move'; head.style.transform='rotateY(20deg)'; }); rp.addEventListener('mouseleave',()=>{ if(pEl) pEl.textContent=phrases[idx]; }); }
    const pe=document.getElementById('roboParticles');
    if(pe){ setInterval(()=>{
      const p=document.createElement('div'),sz=Math.random()*3+1;
      p.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;border-radius:50%;left:${40+Math.random()*180}px;top:${60+Math.random()*200}px;background:rgba(0,240,224,${Math.random()*.4+.1});box-shadow:0 0 6px rgba(0,240,224,.4);pointer-events:none;transition:all ${1.5+Math.random()*2}s ease-out;opacity:0;`;
      pe.appendChild(p);
      setTimeout(()=>{ p.style.opacity='1'; p.style.transform=`translateY(-${30+Math.random()*60}px) translateX(${(Math.random()-.5)*40}px)`; },10);
      setTimeout(()=>{ p.style.opacity='0'; setTimeout(()=>p.remove(),600); },1500+Math.random()*1000);
    },400); }
  }
} catch(e){ console.warn('[CLX] robot',e); }


// ── 8. STATS COUNTER ─────────────────────────────────────────────
try {
  const nums=document.querySelectorAll('.stat-n');
  if(nums.length){
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(!en.isIntersecting) return;
        const el=en.target; if(el.dataset.counted) return; el.dataset.counted='1';
        const target=parseInt(el.dataset.target), t0=performance.now();
        function step(now){ const t=Math.min((now-t0)/1800,1),ease=1-Math.pow(1-t,3); el.textContent=Math.floor(ease*target)+(target>10?'+':''); if(t<1) requestAnimationFrame(step); else el.textContent=target+'+'; }
        requestAnimationFrame(step); obs.unobserve(el);
      });
    },{threshold:.2});
    nums.forEach(n=>obs.observe(n));
  }
} catch(e){ console.warn('[CLX] stats',e); }


// ── 9. NOTIFICATIONS ─────────────────────────────────────────────
function showNotif(msg,type){
  try{
    const n=document.createElement('div');
    n.className='notif '+(type||'success'); n.textContent=msg;
    document.body.appendChild(n);
    setTimeout(()=>n.classList.add('show'),10);
    setTimeout(()=>{ n.classList.remove('show'); setTimeout(()=>n.remove(),400); },3200);
  }catch(e){}
}
window.showNotif=showNotif;


// ── 10. ICS CALENDAR ─────────────────────────────────────────────
async function loadICSCalendar(){try{const r=await fetch('calendar/merged_busy.ics?v='+Date.now());if(!r.ok)return[];return parseICS(await r.text());}catch(e){return[];}}
function parseICS(t){const ev=[];const u=t.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');u.split('BEGIN:VEVENT').slice(1).forEach(b=>{const sm=b.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);const em=b.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);if(!sm)return;ev.push({start:pID(sm[1],sm[2]==='Z'),end:em?pID(em[1],em[2]==='Z'):null});});return ev;}
function pID(s,u){const y=+s.substr(0,4),mo=+s.substr(4,2)-1,d=+s.substr(6,2),h=+s.substr(9,2),mi=+s.substr(11,2);if(u){const x=new Date(Date.UTC(y,mo,d,h,mi));x.setHours(x.getHours()+2);return x;}return new Date(y,mo,d,h,mi);}
function getBookedHoursForDate(events,ds){const[tY,tM,tD]=ds.split('-').map((v,i)=>i===1?+v-1:+v);const b=[];events.forEach(ev=>{const s=ev.start,e=ev.end;if(s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD)return;const sh=s.getHours(),eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;for(let h=sh;h<eh;h++){const sl=String(h).padStart(2,'0')+':00';if(!b.includes(sl))b.push(sl);}});return b;}
window.loadICSCalendar=loadICSCalendar; window.getBookedHoursForDate=getBookedHoursForDate;


// ── 11. SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}


// ── 12. OFFLINE BANNER ───────────────────────────────────────────
try {
  let _b=null;
  function mkBanner(){
    const b=document.createElement('div');
    b.style.cssText='position:fixed;bottom:1.2rem;left:1.2rem;z-index:99990;max-width:290px;background:rgba(10,10,16,.97);border:1px solid rgba(0,240,224,.2);border-radius:4px;padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;font-family:"Space Mono",monospace;font-size:.68rem;letter-spacing:.05em;color:rgba(255,255,255,.4);transform:translateY(140%);transition:transform .4s;';
    b.innerHTML='<span style="color:rgba(240,165,0,.8);font-size:.95rem">◎</span><span>No signal. <a href="games.html" style="color:rgba(0,240,224,.75);text-decoration:none">Play a game?</a></span><button style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.85rem;padding:0;margin-left:auto" aria-label="close">✕</button>';
    b.querySelector('button').addEventListener('click',()=>b.style.transform='translateY(140%)');
    document.body.appendChild(b); return b;
  }
  function showB(){ if(!_b)_b=mkBanner(); setTimeout(()=>_b.style.transform='translateY(0)',50); }
  function hideB(){ if(_b)_b.style.transform='translateY(140%)'; }
  window.addEventListener('offline',showB); window.addEventListener('online',hideB);
  if(!navigator.onLine) window.addEventListener('load',()=>setTimeout(showB,1000));
} catch(e){ console.warn('[CLX] offline',e); }


// ── 13. PINCH HINT ───────────────────────────────────────────────
try {
  document.querySelectorAll('.pinch-hint').forEach(h=>{
    setTimeout(()=>{ h.style.transition='opacity .5s'; h.style.opacity='0'; setTimeout(()=>h.style.display='none',500); },4000);
  });
} catch(e){ console.warn('[CLX] pinch-hint',e); }