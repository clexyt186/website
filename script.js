'use strict';

/* ═══════════════════════════════════════════════════════════════
   CLEXYT — script.js  v4
   Every feature in its own try/catch.
   One failure cannot silence anything else.
   ═══════════════════════════════════════════════════════════════ */


// ── 1. PC CURSOR ─────────────────────────────────────────────────
try {
  if (!('ontouchstart' in window)) {
    const dot  = document.querySelector('.c-dot');
    const ring = document.querySelector('.c-ring');
    if (dot && ring) {
      // Much more visible — stronger glow
      ring.style.cssText += ';width:46px;height:46px;border:2px solid rgba(0,240,224,0.9);box-shadow:0 0 22px rgba(0,240,224,0.55),0 0 8px rgba(0,240,224,0.3),inset 0 0 12px rgba(0,240,224,0.1);transition:transform .15s,border-color .15s,box-shadow .15s,width .2s,height .2s;';
      dot.style.cssText  += ';width:6px;height:6px;background:rgba(0,240,224,1);box-shadow:0 0 12px rgba(0,240,224,1),0 0 24px rgba(0,240,224,0.5);';

      let mx = innerWidth/2, my = innerHeight/2, rx = mx, ry = my;
      function cursorTick() {
        rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
        dot.style.left  = mx + 'px'; dot.style.top  = my + 'px';
        ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
        requestAnimationFrame(cursorTick);
      }
      cursorTick();

      window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, {passive:true});

      // Ring expands on hover of anything clickable
      document.addEventListener('mouseover', e => {
        if (e.target.closest('a,button,[role="button"]')) {
          ring.style.width = '60px';
          ring.style.height = '60px';
          ring.style.borderColor = 'rgba(0,240,224,1)';
          ring.style.boxShadow = '0 0 32px rgba(0,240,224,0.8),0 0 12px rgba(0,240,224,0.5),inset 0 0 16px rgba(0,240,224,0.15)';
        }
      }, {passive:true});
      document.addEventListener('mouseout', e => {
        if (e.target.closest('a,button,[role="button"]')) {
          ring.style.width = '46px';
          ring.style.height = '46px';
          ring.style.borderColor = 'rgba(0,240,224,0.9)';
          ring.style.boxShadow = '0 0 22px rgba(0,240,224,0.55),0 0 8px rgba(0,240,224,0.3),inset 0 0 12px rgba(0,240,224,0.1)';
        }
      }, {passive:true});

      window.addEventListener('mousedown', () => {
        dot.style.transform  = 'translate(-50%,-50%) scale(2.5)';
        ring.style.transform = 'translate(-50%,-50%) scale(0.5)';
      }, {passive:true});
      window.addEventListener('mouseup', () => {
        dot.style.transform  = '';
        ring.style.transform = '';
      }, {passive:true});
    }
  }
} catch(err) { console.warn('[CLEXYT] cursor:', err); }


// ── 2. MOBILE TOUCH GLOW ────────────────────────────────────────
try {
  if ('ontouchstart' in window) {
    document.querySelectorAll('.c-dot,.c-ring').forEach(el => el.style.display = 'none');
    const glow = document.createElement('div');
    glow.style.cssText = 'position:fixed;width:52px;height:52px;border-radius:50%;border:2px solid rgba(0,240,224,0.85);box-shadow:0 0 24px rgba(0,240,224,0.7),inset 0 0 14px rgba(0,240,224,0.12);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0;transition:opacity 0.1s;top:0;left:0;will-change:left,top;';
    document.body.appendChild(glow);
    let gx=0, gy=0, cgx=0, cgy=0, hideT;
    (function glowTick(){
      cgx += (gx-cgx)*0.28; cgy += (gy-cgy)*0.28;
      glow.style.left = cgx+'px'; glow.style.top = cgy+'px';
      requestAnimationFrame(glowTick);
    })();
    function showGlow(e){
      gx=e.touches[0].clientX; gy=e.touches[0].clientY;
      glow.style.opacity='1'; clearTimeout(hideT);
      hideT=setTimeout(()=>{glow.style.opacity='0';},800);
    }
    document.addEventListener('touchstart',showGlow,{passive:true});
    document.addEventListener('touchmove',showGlow,{passive:true});
    document.addEventListener('touchend',()=>{hideT=setTimeout(()=>{glow.style.opacity='0';},200);},{passive:true});
  }
} catch(err) { console.warn('[CLEXYT] touch-glow:', err); }


// ── 3. STARFIELD — magnetic, trails, gyroscope, burst ───────────
try {
  const canvas = document.getElementById('starfield');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const isMob = 'ontouchstart' in window;
    let W, H, stars=[], shooters=[], tx, ty, cx, cy;

    function sfInit() {
      W = canvas.width  = innerWidth;
      H = canvas.height = innerHeight;
      tx=W/2; ty=H/2; cx=W/2; cy=H/2;
    }

    function makeStars() {
      stars = [];
      const n = Math.min(Math.floor(W*H/1600), 820);
      for (let i=0; i<n; i++) {
        const r = Math.random();
        stars.push({
          bx: Math.random()*W,
          by: Math.random()*H,
          r:  Math.random()*2.2+0.4,
          a:  Math.random()*0.5+0.5,
          tw: Math.random()*Math.PI*2,
          ts: 0.01+Math.random()*0.025,
          dx: (Math.random()-0.5)*0.06,
          dy: (Math.random()-0.5)*0.06,
          d:  Math.random()*0.9+0.1,  // depth — more = stronger parallax
          hue: r<0.07?'c':r<0.12?'a':'w',
          vx: 0, vy: 0               // velocity (for burst + attraction)
        });
      }
    }

    function addShooter() {
      shooters.push({
        x:Math.random()*W*0.7, y:Math.random()*H*0.3,
        len:100+Math.random()*160, spd:14+Math.random()*10,
        ang:Math.PI/4+(Math.random()-0.5)*0.5,
        life:1, dec:0.013+Math.random()*0.01
      });
    }
    addShooter();
    setInterval(addShooter, 2400+Math.random()*2000);

    function sfDraw() {
      // Semi-transparent fill instead of clearRect → motion trails
      ctx.fillStyle = 'rgba(10,10,16,0.20)';
      ctx.fillRect(0,0,W,H);

      // Lerp cursor position
      const lsp = isMob ? 0.22 : 0.11;
      cx += (tx-cx)*lsp;
      cy += (ty-cy)*lsp;

      const ox = cx - W/2;
      const oy = cy - H/2;

      for (const s of stars) {
        // Drift
        s.bx += s.dx; s.by += s.dy;
        if(s.bx<0)s.bx=W; if(s.bx>W)s.bx=0;
        if(s.by<0)s.by=H; if(s.by>H)s.by=0;
        s.tw += s.ts;

        // Parallax draw position
        const px = s.bx + ox*s.d*0.55;
        const py = s.by + oy*s.d*0.55;

        // Magnetic pull toward cursor — 2.5× stronger than before
        const ddx = cx-px, ddy = cy-py;
        const dist = Math.sqrt(ddx*ddx+ddy*ddy);
        const gr   = Math.min(W,H)*0.38;
        if (dist < gr) {
          const force = (1 - dist/gr) * 0.07;
          s.vx += ddx*force*0.055;
          s.vy += ddy*force*0.055;
        }
        // Velocity damping
        s.vx *= 0.87; s.vy *= 0.87;
        s.bx += s.vx; s.by += s.vy;

        // Final draw position
        const fx = s.bx + ox*s.d*0.55;
        const fy = s.by + oy*s.d*0.55;

        const ta = s.a*(0.5+0.5*Math.sin(s.tw));

        // Proximity boost — stars near cursor glow and grow
        const proximity = Math.max(0, 1 - dist/(Math.min(W,H)*0.22));
        const boost = 1 + proximity*2.2;
        const drawR = s.r*(1+proximity*0.9);

        ctx.beginPath();
        ctx.arc(fx, fy, drawR, 0, Math.PI*2);

        if (s.hue==='c') {
          ctx.fillStyle = `rgba(0,240,224,${Math.min(1,ta*boost)})`;
          if (s.r>1.1 || proximity>0.25) {
            ctx.shadowColor = 'rgba(0,240,224,0.95)';
            ctx.shadowBlur  = proximity>0.25 ? 18 : 8;
          }
        } else if (s.hue==='a') {
          ctx.fillStyle = `rgba(240,165,0,${Math.min(1,ta*boost)})`;
          if (s.r>1.1) { ctx.shadowColor='rgba(240,165,0,0.85)'; ctx.shadowBlur=8; }
        } else {
          ctx.fillStyle = `rgba(242,250,255,${Math.min(1,ta*boost*0.9)})`;
          ctx.shadowBlur = proximity>0.3 ? 6 : 0;
          if (proximity>0.3) ctx.shadowColor='rgba(255,255,255,0.6)';
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Shooting stars
      for (let i=shooters.length-1; i>=0; i--) {
        const s=shooters[i];
        s.x+=Math.cos(s.ang)*s.spd; s.y+=Math.sin(s.ang)*s.spd;
        s.life-=s.dec;
        if(s.life<=0||s.x>W+200||s.y>H+200){shooters.splice(i,1);continue;}
        const g=ctx.createLinearGradient(s.x-Math.cos(s.ang)*s.len,s.y-Math.sin(s.ang)*s.len,s.x,s.y);
        g.addColorStop(0,'rgba(255,255,255,0)');
        g.addColorStop(1,`rgba(255,255,255,${s.life*0.9})`);
        ctx.beginPath();
        ctx.moveTo(s.x-Math.cos(s.ang)*s.len,s.y-Math.sin(s.ang)*s.len);
        ctx.lineTo(s.x,s.y);
        ctx.strokeStyle=g; ctx.lineWidth=1.6*s.life; ctx.stroke();
      }

      // Soft cursor glow on canvas (PC only)
      if (!isMob) {
        const cg = ctx.createRadialGradient(cx,cy,0,cx,cy,160);
        cg.addColorStop(0,'rgba(0,240,224,0.045)');
        cg.addColorStop(1,'rgba(0,240,224,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(0,0,W,H);
      }

      requestAnimationFrame(sfDraw);
    }

    sfInit(); makeStars(); sfDraw();
    window.addEventListener('resize',()=>{sfInit();makeStars();},{passive:true});
    window.addEventListener('mousemove',e=>{tx=e.clientX;ty=e.clientY;},{passive:true});

    function onTouch(e){ if(e.touches.length>0){tx=e.touches[0].clientX;ty=e.touches[0].clientY;} }
    document.addEventListener('touchstart',onTouch,{passive:true});
    document.addEventListener('touchmove',onTouch,{passive:true});

    // GYROSCOPE — tilt phone to move stars (iOS 13+ needs permission, Android works freely)
    if (isMob && window.DeviceOrientationEvent) {
      function enableGyro() {
        window.addEventListener('deviceorientation', e => {
          if (e.gamma==null) return;
          const gx = Math.max(-50, Math.min(50, e.gamma));
          const gy = Math.max(-40, Math.min(40, (e.beta||0)-20));
          tx = W/2 + (gx/50)*(W*0.52);
          ty = H/2 + (gy/40)*(H*0.42);
        }, {passive:true});
      }
      // iOS 13 requires explicit permission
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        document.addEventListener('touchend', function askGyro() {
          DeviceOrientationEvent.requestPermission().then(r => { if(r==='granted') enableGyro(); });
          document.removeEventListener('touchend', askGyro);
        }, {once:true});
      } else {
        enableGyro();
      }
    }

    // BURST — click/tap scatters nearby stars outward
    function burst(bx,by) {
      stars.forEach(s=>{
        const dx=s.bx-bx, dy=s.by-by;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<220&&dist>0){
          const force=(1-dist/220)*4.5;
          s.vx+=(dx/dist)*force;
          s.vy+=(dy/dist)*force;
        }
      });
    }
    window.addEventListener('click',e=>{ if(!e.target.closest('a,button')) burst(e.clientX,e.clientY); },{passive:true});
    document.addEventListener('touchend',e=>{
      if(e.changedTouches.length>0) burst(e.changedTouches[0].clientX,e.changedTouches[0].clientY);
    },{passive:true});
  }
} catch(err) { console.warn('[CLEXYT] starfield:', err); }


// ── 4. BURGER MENU ──────────────────────────────────────────────
try {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobNav = document.getElementById('mobNav');

  if (!burger || !mobNav) throw new Error('burger/mobNav not in DOM');

  // Highest possible z-index. touch-action prevents iOS double-tap zoom.
  burger.style.cssText = (burger.getAttribute('style')||'')
    + ';position:relative!important;z-index:2147483647!important;'
    + 'cursor:pointer!important;pointer-events:all!important;'
    + '-webkit-tap-highlight-color:rgba(0,240,224,0.15);'
    + 'touch-action:manipulation;';

  let _lt = 0;
  function toggleBurger() {
    const now = Date.now();
    if (now - _lt < 500) return; // debounce: touchend + ghost click
    _lt = now;
    const isOpen = mobNav.classList.toggle('open');
    burger.classList.toggle('active', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
  function closeBurger() {
    mobNav.classList.remove('open');
    burger.classList.remove('active');
    document.body.style.overflow = '';
  }

  burger.addEventListener('click',  e => { e.preventDefault(); e.stopPropagation(); toggleBurger(); });
  burger.addEventListener('touchend',e => { e.preventDefault(); e.stopPropagation(); toggleBurger(); }, {passive:false});

  // Close when a nav link is tapped
  mobNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click',   () => setTimeout(closeBurger, 60));
    a.addEventListener('touchend',() => setTimeout(closeBurger, 60));
  });

  // Close on outside tap
  document.addEventListener('touchstart', e => {
    if (mobNav.classList.contains('open')
        && !burger.contains(e.target)
        && !mobNav.contains(e.target)) closeBurger();
  }, {passive:true});

  if (nav) {
    window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>50),{passive:true});
  }

} catch(err) { console.warn('[CLEXYT] burger:', err); }


// ── 5. ROBOT HEAD TRACKING ──────────────────────────────────────
try {
  const head = document.getElementById('rbHead');
  if (head) {
    const promptEl = document.getElementById('promptText');
    const phrases  = ['Choose your path','Photography or Tech?','What are we building?','Pick a side...','Both sides are good','I present two paths'];
    let idx = 0;
    setInterval(()=>{ idx=(idx+1)%phrases.length; if(promptEl)promptEl.textContent=phrases[idx]; },3000);
    window.addEventListener('mousemove',e=>{
      const r=head.getBoundingClientRect();
      const dx=(e.clientX-r.left-r.width/2)/innerWidth;
      const dy=(e.clientY-r.top-r.height/2)/innerHeight;
      head.style.transform=`rotateX(${dy*-14}deg) rotateY(${dx*18}deg)`;
    },{passive:true});
    const lp=document.getElementById('choiceLeft'),rp=document.getElementById('choiceRight');
    if(lp){lp.addEventListener('mouseenter',()=>{if(promptEl)promptEl.textContent='Photography — a great choice';head.style.transform='rotateY(-20deg)';});lp.addEventListener('mouseleave',()=>{if(promptEl)promptEl.textContent=phrases[idx];});}
    if(rp){rp.addEventListener('mouseenter',()=>{if(promptEl)promptEl.textContent='Tech consulting — bold move';head.style.transform='rotateY(20deg)';});rp.addEventListener('mouseleave',()=>{if(promptEl)promptEl.textContent=phrases[idx];});}
    const pe=document.getElementById('roboParticles');
    if(pe){setInterval(()=>{
      const p=document.createElement('div'),sz=Math.random()*3+1;
      p.style.cssText=`position:absolute;width:${sz}px;height:${sz}px;border-radius:50%;left:${40+Math.random()*180}px;top:${60+Math.random()*200}px;background:rgba(0,240,224,${Math.random()*0.4+0.1});box-shadow:0 0 6px rgba(0,240,224,0.4);pointer-events:none;transition:all ${1.5+Math.random()*2}s ease-out;opacity:0;`;
      pe.appendChild(p);
      setTimeout(()=>{p.style.opacity='1';p.style.transform=`translateY(-${30+Math.random()*60}px) translateX(${(Math.random()-.5)*40}px)`;},10);
      setTimeout(()=>{p.style.opacity='0';setTimeout(()=>p.remove(),600);},1500+Math.random()*1000);
    },400);}
  }
} catch(err) { console.warn('[CLEXYT] robot:', err); }


// ── 6. STATS COUNTER ────────────────────────────────────────────
try {
  const nums=document.querySelectorAll('.stat-n');
  if(nums.length){
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        const el=entry.target; if(el.dataset.counted)return; el.dataset.counted='1';
        const target=parseInt(el.dataset.target), start=performance.now();
        function step(now){
          const t=Math.min((now-start)/1800,1), ease=1-Math.pow(1-t,3);
          el.textContent=Math.floor(ease*target)+(target>10?'+':'');
          if(t<1)requestAnimationFrame(step); else el.textContent=target+'+';
        }
        requestAnimationFrame(step); obs.unobserve(el);
      });
    },{threshold:0.2});
    nums.forEach(n=>obs.observe(n));
  }
} catch(err) { console.warn('[CLEXYT] stats:', err); }


// ── 7. NOTIFICATIONS ────────────────────────────────────────────
function showNotif(msg,type){
  try{
    const n=document.createElement('div');
    n.className='notif '+(type||'success'); n.textContent=msg;
    document.body.appendChild(n);
    setTimeout(()=>n.classList.add('show'),10);
    setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),400);},3200);
  }catch(e){}
}
window.showNotif=showNotif;


// ── 8. ICS CALENDAR ─────────────────────────────────────────────
async function loadICSCalendar(){try{const r=await fetch('calendar/merged_busy.ics?v='+Date.now());if(!r.ok)return[];return parseICS(await r.text());}catch(e){return[];}}
function parseICS(text){const events=[];const u=text.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');u.split('BEGIN:VEVENT').slice(1).forEach(b=>{const sm=b.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);const em=b.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);if(!sm)return;events.push({start:parseICSDate(sm[1],sm[2]==='Z'),end:em?parseICSDate(em[1],em[2]==='Z'):null});});return events;}
function parseICSDate(str,isUTC){const y=+str.substr(0,4),mo=+str.substr(4,2)-1,d=+str.substr(6,2),h=+str.substr(9,2),mi=+str.substr(11,2);if(isUTC){const u=new Date(Date.UTC(y,mo,d,h,mi));u.setHours(u.getHours()+2);return u;}return new Date(y,mo,d,h,mi);}
function getBookedHoursForDate(events,dateStr){const[tY,tM,tD]=dateStr.split('-').map((v,i)=>i===1?+v-1:+v);const booked=[];events.forEach(ev=>{const s=ev.start,e=ev.end;if(s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD)return;const sh=s.getHours(),eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;for(let h=sh;h<eh;h++){const slot=String(h).padStart(2,'0')+':00';if(!booked.includes(slot))booked.push(slot);}});return booked;}
window.loadICSCalendar=loadICSCalendar;
window.getBookedHoursForDate=getBookedHoursForDate;


// ── 9. PAGE TRANSITIONS — 3D page fold ──────────────────────────
try {
  // Container holds perspective for 3D depth
  const ptWrap = document.createElement('div');
  ptWrap.id = 'ptWrap';
  ptWrap.style.cssText = 'position:fixed;inset:0;z-index:90000;pointer-events:none;perspective:1400px;perspective-origin:50% 50%;display:none;';

  // The page panel that folds in/out
  const ptPanel = document.createElement('div');
  ptPanel.style.cssText = [
    'position:absolute;inset:0;',
    'background:linear-gradient(108deg,#07070f 0%,#0a0a14 45%,#0c1420 100%);',
    'transform-style:preserve-3d;',
    'backface-visibility:hidden;',
    'will-change:transform;',
  ].join('');

  // Cyan fold crease — the "spine" of the pamphlet
  const ptCrease = document.createElement('div');
  ptCrease.id = 'ptCrease';
  ptCrease.style.cssText = [
    'position:absolute;top:0;bottom:0;right:0;width:3px;',
    'background:linear-gradient(to bottom,',
    '  transparent 0%,rgba(0,240,224,0.3) 15%,',
    '  rgba(0,240,224,0.7) 50%,',
    '  rgba(0,240,224,0.3) 85%,transparent 100%);',
    'box-shadow:-6px 0 40px rgba(0,0,0,0.95),3px 0 18px rgba(0,240,224,0.35);',
  ].join('');
  ptPanel.appendChild(ptCrease);

  // Paper surface shine
  const ptShine = document.createElement('div');
  ptShine.style.cssText = 'position:absolute;inset:0;background:linear-gradient(to right,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.01) 35%,rgba(0,0,0,0.12) 100%);pointer-events:none;';
  ptPanel.appendChild(ptShine);

  ptWrap.appendChild(ptPanel);
  document.body.appendChild(ptWrap);

  // Safe sessionStorage read
  let arriving = null;
  try { arriving = sessionStorage.getItem('ptDest'); } catch(e){}

  if (arriving) {
    // New page loaded — panel covers screen, now unfold it away to the LEFT
    try { sessionStorage.removeItem('ptDest'); } catch(e){}
    ptWrap.style.display       = 'block';
    ptWrap.style.pointerEvents = 'all';
    ptCrease.style.right = 'auto';
    ptCrease.style.left  = '0';
    ptPanel.style.transformOrigin = 'left center';
    ptPanel.style.transition = 'none';
    ptPanel.style.transform  = 'rotateY(0deg)'; // flat = fully covering screen

    setTimeout(() => {
      ptPanel.style.transition = 'transform 0.62s cubic-bezier(0.4,0,0.2,1)';
      ptPanel.style.transform  = 'rotateY(-90deg)'; // fold away left, revealing page
      ptWrap.style.pointerEvents = 'none';
    }, 55);

    setTimeout(() => { ptWrap.style.display = 'none'; }, 780);

  } else {
    ptWrap.style.display = 'none';
  }

  // Intercept all internal link clicks
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (e.target.closest('#burger')) return; // never intercept burger

    const href = a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#')) return;
    if (a.target === '_blank') return;
    if (/^(https?:|mailto:|tel:|javascript:)/.test(href)) return;
    if (href.includes('wa.me')) return;

    e.preventDefault();

    // Panel folds IN from the RIGHT, covering the current page
    ptCrease.style.left  = 'auto';
    ptCrease.style.right = '0';
    ptWrap.style.display       = 'block';
    ptWrap.style.pointerEvents = 'all';
    ptPanel.style.transformOrigin = 'right center';
    ptPanel.style.transition = 'none';
    ptPanel.style.transform  = 'rotateY(90deg)'; // hidden to the right

    setTimeout(() => {
      ptPanel.style.transition = 'transform 0.48s cubic-bezier(0.4,0,0.6,1)';
      ptPanel.style.transform  = 'rotateY(0deg)'; // fold flat, covering page
      try { sessionStorage.setItem('ptDest','1'); } catch(err){}
      setTimeout(() => { window.location.href = href; }, 460);
    }, 20);

  }, true); // capture phase — fires before any other click handler

} catch(err) { console.warn('[CLEXYT] transitions:', err); }


// ── 10. SERVICE WORKER ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}


// ── 11. OFFLINE BANNER ──────────────────────────────────────────
try {
  let _banner=null;
  function buildBanner(){
    const b=document.createElement('div');
    b.style.cssText='position:fixed;bottom:1.2rem;left:1.2rem;z-index:9990;max-width:290px;background:rgba(10,10,16,0.97);border:1px solid rgba(0,240,224,0.2);border-radius:4px;padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;font-family:"Space Mono",monospace;font-size:.68rem;letter-spacing:.05em;color:rgba(255,255,255,.4);box-shadow:0 4px 28px rgba(0,0,0,.55);transform:translateY(140%);transition:transform .4s cubic-bezier(.4,0,.2,1);';
    b.innerHTML='<span style="color:rgba(240,165,0,.8);font-size:.95rem;flex-shrink:0">◎</span><span>No signal. <a href="games.html" style="color:rgba(0,240,224,.75);text-decoration:none">Play a game?</a></span><button style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.85rem;padding:0;margin-left:auto;flex-shrink:0" aria-label="close">✕</button>';
    b.querySelector('button').addEventListener('click',()=>{b.style.transform='translateY(140%)';});
    document.body.appendChild(b); return b;
  }
  function showBanner(){if(!_banner)_banner=buildBanner();setTimeout(()=>{_banner.style.transform='translateY(0)';},50);}
  function hideBanner(){if(_banner)_banner.style.transform='translateY(140%)';}
  window.addEventListener('offline',showBanner);
  window.addEventListener('online',hideBanner);
  if(!navigator.onLine) window.addEventListener('load',()=>setTimeout(showBanner,1000));
} catch(err) { console.warn('[CLEXYT] offline:', err); }


// ── 12. PINCH HINT ──────────────────────────────────────────────
try {
  const hint=document.getElementById('pinchHint');
  if(hint) setTimeout(()=>{hint.style.transition='opacity .5s';hint.style.opacity='0';setTimeout(()=>{hint.style.display='none';},500);},4000);
} catch(err) { console.warn('[CLEXYT] pinch-hint:', err); }