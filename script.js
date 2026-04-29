'use strict';

// === PC CURSOR ===
(function() {
  if ('ontouchstart' in window) return;
  const dot = document.querySelector('.c-dot');
  const ring = document.querySelector('.c-ring');
  if (!dot || !ring) return;
  let mx = window.innerWidth/2, my = window.innerHeight/2, rx = mx, ry = my;
  function tick() {
    rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
    dot.style.left = mx+'px'; dot.style.top = my+'px';
    ring.style.left = rx+'px'; ring.style.top = ry+'px';
    requestAnimationFrame(tick);
  }
  tick();
  window.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
  window.addEventListener('mousedown', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(2)';
    ring.style.transform = 'translate(-50%,-50%) scale(0.6)';
    ring.style.borderColor = 'var(--cyan)';
    ring.style.boxShadow = '0 0 20px var(--cyan)';
  });
  window.addEventListener('mouseup', () => {
    dot.style.transform = '';
    ring.style.transform = '';
    ring.style.borderColor = '';
    ring.style.boxShadow = '';
  });
})();

// === MOBILE TOUCH GLOW ===
(function() {
  if (!('ontouchstart' in window)) return;
  document.querySelectorAll('.c-dot,.c-ring').forEach(el => el.style.display='none');
  const glow = document.createElement('div');
  glow.style.cssText = 'position:fixed;width:44px;height:44px;border-radius:50%;border:1.5px solid rgba(0,240,224,0.75);box-shadow:0 0 18px rgba(0,240,224,0.65),inset 0 0 8px rgba(0,240,224,0.12);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0;transition:opacity 0.12s;top:0;left:0;will-change:left,top;';
  document.body.appendChild(glow);
  let gx=0, gy=0, cgx=0, cgy=0, hideT;
  function glowTick() {
    cgx += (gx-cgx)*0.25; cgy += (gy-cgy)*0.25;
    glow.style.left = cgx+'px'; glow.style.top = cgy+'px';
    requestAnimationFrame(glowTick);
  }
  glowTick();
  function show(e) {
    gx = e.touches[0].clientX; gy = e.touches[0].clientY;
    glow.style.opacity = '1';
    clearTimeout(hideT);
    hideT = setTimeout(() => { glow.style.opacity='0'; }, 900);
  }
  document.addEventListener('touchstart', show, {passive:true});
  document.addEventListener('touchmove', show, {passive:true});
  document.addEventListener('touchend', () => { hideT = setTimeout(() => { glow.style.opacity='0'; }, 250); });
})();

// === STARFIELD — reacts to mouse AND touch dramatically ===
(function() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars=[], shooters=[];
  // Always init at centre — parallax works from frame 1
  let tx, ty, cx, cy;

  function init() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    tx = W/2; ty = H/2; cx = W/2; cy = H/2;
  }

  function makeStars() {
    stars = [];
    const n = Math.floor((W * H) / 1500);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      stars.push({
        x:  Math.random() * W,
        y:  Math.random() * H,
        r:  Math.random() * 2.4 + 0.4,
        a:  Math.random() * 0.4 + 0.6,
        tw: Math.random() * Math.PI * 2,
        ts: 0.012 + Math.random() * 0.028,
        dx: (Math.random() - 0.5) * 0.08,
        dy: (Math.random() - 0.5) * 0.08,
        // depth: deeper stars (higher d) move more with parallax
        d:  Math.random() * 0.85 + 0.15,
        hue: r < 0.08 ? 'c' : r < 0.13 ? 'a' : 'w'
      });
    }
  }

  function addShooter() {
    shooters.push({
      x: Math.random() * W * 0.7, y: Math.random() * H * 0.3,
      len: 120 + Math.random() * 160, spd: 12 + Math.random() * 10,
      ang: Math.PI / 4 + (Math.random() - 0.5) * 0.5,
      life: 1, dec: 0.012 + Math.random() * 0.01
    });
  }
  addShooter();
  setInterval(addShooter, 2500 + Math.random() * 2000);

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Lerp cursor — FASTER on mobile (0.18) so stars visibly chase finger
    const lerpSpeed = ('ontouchstart' in window) ? 0.18 : 0.10;
    cx += (tx - cx) * lerpSpeed;
    cy += (ty - cy) * lerpSpeed;

    // Parallax offset from centre
    const ox = cx - W / 2;
    const oy = cy - H / 2;

    for (const s of stars) {
      s.x  += s.dx; s.y += s.dy;
      s.tw += s.ts;
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;

      // Pull toward cursor when close
      const ddx = cx - s.x, ddy = cy - s.y;
      const dist = Math.sqrt(ddx*ddx + ddy*ddy);
      const gr   = Math.min(W, H) * 0.3;
      const pull = dist < gr ? (1 - dist/gr) * 0.028 : 0;

      const ta = s.a * (0.5 + 0.5 * Math.sin(s.tw));

      // Parallax: deeper stars (d near 1) shift more. 0.42 = dramatically visible
      const px = s.x + ox * s.d * 0.42 + ddx * pull;
      const py = s.y + oy * s.d * 0.42 + ddy * pull;

      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      if (s.hue === 'c') {
        ctx.fillStyle = 'rgba(0,240,224,' + ta + ')';
        if (s.r > 1.4) { ctx.shadowColor = 'rgba(0,240,224,0.9)'; ctx.shadowBlur = 8; }
      } else if (s.hue === 'a') {
        ctx.fillStyle = 'rgba(240,165,0,' + ta + ')';
        if (s.r > 1.4) { ctx.shadowColor = 'rgba(240,165,0,0.8)'; ctx.shadowBlur = 8; }
      } else {
        ctx.fillStyle = 'rgba(242,250,255,' + ta + ')';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      s.x += Math.cos(s.ang) * s.spd;
      s.y += Math.sin(s.ang) * s.spd;
      s.life -= s.dec;
      if (s.life <= 0) { shooters.splice(i, 1); continue; }
      const g = ctx.createLinearGradient(
        s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len, s.x, s.y
      );
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,' + (s.life * 0.95) + ')');
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = g; ctx.lineWidth = 1.8 * s.life; ctx.stroke();
    }

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.012)'; ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    requestAnimationFrame(draw);
  }

  init(); makeStars(); draw();
  window.addEventListener('resize', () => { init(); makeStars(); });

  // PC — listen on window (not just document)
  window.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; });

  // Mobile — use passive for touchstart (no scroll blocking), non-passive touchmove
  function onTouch(e) {
    if (e.touches.length > 0) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }
  }
  // touchstart: passive (don't interfere with scroll gestures)
  document.addEventListener('touchstart', onTouch, { passive: true });
  // touchmove: ALSO passive — we just read position, don't need to cancel
  document.addEventListener('touchmove', onTouch, { passive: true });
})();

// === BURGER MENU ===
(function() {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobNav = document.getElementById('mobNav');

  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  if (!burger || !mobNav) return;

  // Give burger highest z-index so overlay never blocks it
  burger.style.cssText += 'position:relative;z-index:999999;';

  function openMenu() {
    mobNav.classList.add('open');
    burger.classList.add('active');
  }
  function closeMenu() {
    mobNav.classList.remove('open');
    burger.classList.remove('active');
  }
  function toggleMenu() {
    mobNav.classList.contains('open') ? closeMenu() : openMenu();
  }

  // Click handles PC and Android
  burger.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    toggleMenu();
  });

  // touchend handles iOS (prevents ghost click + more reliable)
  burger.addEventListener('touchend', function(e) {
    e.stopPropagation();
    e.preventDefault();
    toggleMenu();
  }, { passive: false });

  // Close on any link tap inside mob-nav
  mobNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', closeMenu);
    a.addEventListener('touchend', closeMenu);
  });

  // Close on outside tap/click
  document.addEventListener('click', function(e) {
    if (mobNav.classList.contains('open') && !nav.contains(e.target) && !mobNav.contains(e.target)) {
      closeMenu();
    }
  });
  document.addEventListener('touchstart', function(e) {
    if (mobNav.classList.contains('open') && !nav.contains(e.target) && !mobNav.contains(e.target)) {
      closeMenu();
    }
  }, { passive: true });
})();

// === ROBOT HEAD TRACKING ===
(function() {
  const head = document.getElementById('rbHead');
  if (!head) return;
  const promptEl = document.getElementById('promptText');
  const phrases = ['Choose your path','Photography or Tech?','What are we building?','Pick a side...','Both sides are good','I present two paths'];
  let idx = 0;
  setInterval(() => { idx = (idx+1) % phrases.length; if (promptEl) promptEl.textContent = phrases[idx]; }, 3000);
  window.addEventListener('mousemove', e => {
    const r = head.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width/2)  / window.innerWidth;
    const dy = (e.clientY - r.top  - r.height/2) / window.innerHeight;
    head.style.transform = 'rotateX(' + (dy*-14) + 'deg) rotateY(' + (dx*18) + 'deg)';
  });
  const lp = document.getElementById('choiceLeft');
  const rp = document.getElementById('choiceRight');
  if (lp) {
    lp.addEventListener('mouseenter', () => { if (promptEl) promptEl.textContent='Photography — a great choice'; head.style.transform='rotateY(-20deg)'; });
    lp.addEventListener('mouseleave', () => { if (promptEl) promptEl.textContent=phrases[idx]; });
  }
  if (rp) {
    rp.addEventListener('mouseenter', () => { if (promptEl) promptEl.textContent='Tech consulting — bold move'; head.style.transform='rotateY(20deg)'; });
    rp.addEventListener('mouseleave', () => { if (promptEl) promptEl.textContent=phrases[idx]; });
  }
  const pe = document.getElementById('roboParticles');
  if (pe) {
    setInterval(() => {
      const p  = document.createElement('div');
      const sz = Math.random() * 3 + 1;
      p.style.cssText = 'position:absolute;width:'+sz+'px;height:'+sz+'px;border-radius:50%;left:'+(40+Math.random()*180)+'px;top:'+(60+Math.random()*200)+'px;background:rgba(0,240,224,'+(Math.random()*0.4+0.1)+');box-shadow:0 0 6px rgba(0,240,224,0.4);pointer-events:none;transition:all '+(1.5+Math.random()*2)+'s ease-out;opacity:0;';
      pe.appendChild(p);
      setTimeout(() => { p.style.opacity='1'; p.style.transform='translateY(-'+(30+Math.random()*60)+'px) translateX('+((Math.random()-0.5)*40)+'px)'; }, 10);
      setTimeout(() => { p.style.opacity='0'; setTimeout(() => p.remove(), 600); }, 1500+Math.random()*1000);
    }, 400);
  }
})();

// === STATS COUNTER ===
(function() {
  function run() {
    const nums = document.querySelectorAll('.stat-n');
    if (!nums.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.dataset.counted) return;
        el.dataset.counted = '1';
        const target = parseInt(el.dataset.target);
        const start  = performance.now();
        function step(now) {
          const t    = Math.min((now - start) / 1800, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.floor(ease * target) + (target > 10 ? '+' : '');
          if (t < 1) requestAnimationFrame(step);
          else el.textContent = target + '+';
        }
        requestAnimationFrame(step);
        obs.unobserve(el);
      });
    }, { threshold: 0.2 });
    nums.forEach(n => obs.observe(n));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

// === NOTIFICATIONS ===
function showNotif(msg, type) {
  type = type || 'success';
  const n = document.createElement('div');
  n.className = 'notif ' + type; n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, 3200);
}
window.showNotif = showNotif;

// === ICS CALENDAR ===
async function loadICSCalendar() {
  try { const res = await fetch('calendar/merged_busy.ics?v='+Date.now()); if (!res.ok) return []; return parseICS(await res.text()); } catch(e) { return []; }
}
function parseICS(text) {
  const events = [];
  const u = text.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');
  u.split('BEGIN:VEVENT').slice(1).forEach(b => {
    const sm = b.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    const em = b.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    if (!sm) return;
    events.push({ start: parseICSDate(sm[1], sm[2]==='Z'), end: em ? parseICSDate(em[1], em[2]==='Z') : null });
  });
  return events;
}
function parseICSDate(str, isUTC) {
  const y=+str.substr(0,4), mo=+str.substr(4,2)-1, d=+str.substr(6,2), h=+str.substr(9,2), mi=+str.substr(11,2);
  if (isUTC) { const u = new Date(Date.UTC(y,mo,d,h,mi)); u.setHours(u.getHours()+2); return u; }
  return new Date(y,mo,d,h,mi);
}
function getBookedHoursForDate(events, dateStr) {
  const [tY,tM,tD] = dateStr.split('-').map((v,i) => i===1 ? +v-1 : +v);
  const booked = [];
  events.forEach(ev => {
    const s=ev.start, e=ev.end;
    if (s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD) return;
    const sh=s.getHours(), eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;
    for (let h=sh; h<eh; h++) { const slot=String(h).padStart(2,'0')+':00'; if (!booked.includes(slot)) booked.push(slot); }
  });
  return booked;
}
window.loadICSCalendar    = loadICSCalendar;
window.getBookedHoursForDate = getBookedHoursForDate;

// === PAGE TRANSITIONS — iris wipe, bulletproof cross-browser ===
(function() {
  // Dark overlay for the iris wipe
  const ov = document.createElement('div');
  ov.id = 'ptOv';
  // CRITICAL: z-index BELOW nav/burger but above page content
  // This way burger (z:999999) always stays clickable
  ov.style.cssText = [
    'position:fixed;inset:0;',
    'z-index:9000;',                       // below burger (999999) and nav (1001+)
    'background:#0a0a10;',
    'pointer-events:none;',
    'clip-path:circle(0% at 50% 50%);',
  ].join('');

  const arriving = sessionStorage.getItem('ptDest');

  if (arriving) {
    // ── ARRIVING on a new page via transition ──
    sessionStorage.removeItem('ptDest');
    ov.style.clipPath      = 'circle(150% at 50% 50%)';
    ov.style.pointerEvents = 'none';
    document.body.appendChild(ov);

    // Use setTimeout instead of double-rAF — more reliable on mobile Chrome & Safari
    setTimeout(() => {
      ov.style.transition = 'clip-path 0.65s cubic-bezier(0.35, 0, 0.2, 1)';
      ov.style.clipPath   = 'circle(0% at 50% 50%)';
    }, 60);

    // After iris-in completes, fully remove overlay from interaction
    setTimeout(() => {
      ov.style.display = 'none';
    }, 800);

  } else {
    // Normal load (no transition) — overlay is invisible, remove from flow quickly
    document.body.appendChild(ov);
    setTimeout(() => { ov.style.display = 'none'; }, 100);
  }

  // ── LEAVING: intercept link clicks ──
  document.addEventListener('click', function(e) {
    // Only fire for anchor clicks
    const a = e.target.closest('a[href]');
    if (!a) return;

    // Skip: burger, mob-nav, hash, external, blank target
    if (e.target.closest('#burger') || e.target.closest('#mobNav')) return;

    const href = a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#')) return;
    if (a.target === '_blank') return;
    if (/^(https?:|mailto:|tel:|javascript:)/.test(href)) return;
    if (href.includes('wa.me')) return;

    e.preventDefault();

    // Iris out from click point
    const cx  = (e.clientX / window.innerWidth  * 100).toFixed(2);
    const cy  = (e.clientY / window.innerHeight * 100).toFixed(2);

    ov.style.display       = 'block';
    ov.style.pointerEvents = 'all';
    ov.style.transition    = 'none';
    ov.style.clipPath      = 'circle(0% at ' + cx + '% ' + cy + '%)';

    // setTimeout gives the browser one frame to paint the starting state
    setTimeout(() => {
      ov.style.transition = 'clip-path 0.48s cubic-bezier(0.76, 0, 0.97, 0.94)';
      ov.style.clipPath   = 'circle(150% at ' + cx + '% ' + cy + '%)';
      sessionStorage.setItem('ptDest', '1');
      setTimeout(() => { window.location.href = href; }, 460);
    }, 20);

  }, true); // capture:true so we intercept before other handlers
})();

// === SERVICE WORKER ===
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// === OFFLINE BANNER ===
(function() {
  let banner = null;
  function buildBanner() {
    const b = document.createElement('div');
    b.style.cssText = [
      'position:fixed;bottom:1.2rem;left:1.2rem;z-index:9990;max-width:290px;',
      'background:rgba(10,10,16,0.97);border:1px solid rgba(0,240,224,0.2);border-radius:4px;',
      'padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;',
      'font-family:"Space Mono",monospace;font-size:.68rem;letter-spacing:.05em;color:rgba(255,255,255,.4);',
      'box-shadow:0 4px 28px rgba(0,0,0,.55),0 0 18px rgba(0,240,224,.05);',
      'transform:translateY(140%);transition:transform .4s cubic-bezier(.4,0,.2,1);'
    ].join('');
    b.innerHTML = '<span style="color:rgba(240,165,0,.8);font-size:.95rem;flex-shrink:0">◎</span>'
      + '<span>No signal. <a href="games.html" style="color:rgba(0,240,224,.75);text-decoration:none">Play a game?</a></span>'
      + '<button style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.85rem;padding:0;margin-left:auto;flex-shrink:0" aria-label="close">✕</button>';
    b.querySelector('button').addEventListener('click', () => { b.style.transform='translateY(140%)'; });
    document.body.appendChild(b);
    return b;
  }
  function show() {
    if (!banner) banner = buildBanner();
    setTimeout(() => { banner.style.transform='translateY(0)'; }, 50);
  }
  function hide() { if (banner) banner.style.transform='translateY(140%)'; }
  window.addEventListener('offline', show);
  window.addEventListener('online',  hide);
  if (!navigator.onLine) window.addEventListener('load', () => setTimeout(show, 1000));
})();

// === PINCH HINT auto-dismiss after 4 s ===
(function() {
  const hint = document.getElementById('pinchHint');
  if (!hint) return;
  setTimeout(() => {
    hint.style.opacity = '0';
    hint.style.transition = 'opacity .5s';
    setTimeout(() => { hint.style.display = 'none'; }, 500);
  }, 4000);
})();