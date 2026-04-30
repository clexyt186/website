/* ═══════════════════════════════════════════════════════
   CLEXYT — starfield.js
   Isolated star background. Magnetic pull, motion trails,
   gyroscope, burst on tap. Nothing else depends on this.
   ═══════════════════════════════════════════════════════ */
'use strict';

(function () {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;

  const ctx   = canvas.getContext('2d');
  const isMob = ('ontouchstart' in window);

  let W, H, stars = [], shooters = [];
  let tx, ty, cx, cy;

  /* ── INIT ─────────────────────────────────────────── */
  function init() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    tx = W / 2; ty = H / 2;
    cx = W / 2; cy = H / 2;
  }

  /* ── BUILD STARS ──────────────────────────────────── */
  function makeStars() {
    stars = [];
    const n = Math.min(Math.floor(W * H / 1400), 900);
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      stars.push({
        bx:  Math.random() * W,
        by:  Math.random() * H,
        r:   Math.random() * 2.1 + 0.35,
        a:   Math.random() * 0.45 + 0.55,
        tw:  Math.random() * Math.PI * 2,
        ts:  0.009 + Math.random() * 0.022,
        ddx: (Math.random() - 0.5) * 0.055,
        ddy: (Math.random() - 0.5) * 0.055,
        d:   Math.random() * 0.88 + 0.12, // depth — higher = stronger parallax
        hue: roll < 0.07 ? 'c' : roll < 0.13 ? 'a' : 'w',
        vx:  0, vy: 0                     // velocity for attraction + burst
      });
    }
  }

  /* ── SHOOTING STARS ───────────────────────────────── */
  function addShooter() {
    shooters.push({
      x:    Math.random() * W * 0.65,
      y:    Math.random() * H * 0.35,
      len:  90 + Math.random() * 160,
      spd:  13 + Math.random() * 10,
      ang:  Math.PI / 4 + (Math.random() - 0.5) * 0.55,
      life: 1,
      dec:  0.012 + Math.random() * 0.011
    });
  }
  addShooter();
  setInterval(addShooter, 2200 + Math.random() * 2000);

  /* ── MAIN DRAW LOOP ───────────────────────────────── */
  function draw() {
    /* Semi-transparent wipe → motion trails */
    ctx.fillStyle = 'rgba(10,10,16,0.18)';
    ctx.fillRect(0, 0, W, H);

    /* Lerp cursor target — faster on mobile */
    const lsp = isMob ? 0.20 : 0.10;
    cx += (tx - cx) * lsp;
    cy += (ty - cy) * lsp;

    const ox = cx - W / 2;
    const oy = cy - H / 2;

    /* ── STARS ── */
    for (const s of stars) {
      /* Drift */
      s.bx += s.ddx + s.vx;
      s.by += s.ddy + s.vy;
      s.vx *= 0.88;
      s.vy *= 0.88;
      s.tw += s.ts;

      if (s.bx < 0) s.bx = W;
      if (s.bx > W) s.bx = 0;
      if (s.by < 0) s.by = H;
      if (s.by > H) s.by = 0;

      /* Parallax draw position */
      const px = s.bx + ox * s.d * 0.58;
      const py = s.by + oy * s.d * 0.58;

      /* Magnetic attraction toward cursor */
      const ddx  = cx - px;
      const ddy  = cy - py;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const gr   = Math.min(W, H) * 0.40;
      if (dist < gr && dist > 0) {
        const force = (1 - dist / gr) * 0.075;
        s.vx += ddx * force * 0.05;
        s.vy += ddy * force * 0.05;
      }

      /* Final screen position */
      const fx = s.bx + ox * s.d * 0.58;
      const fy = s.by + oy * s.d * 0.58;

      const ta        = s.a * (0.5 + 0.5 * Math.sin(s.tw));
      const proximity = Math.max(0, 1 - dist / (Math.min(W, H) * 0.25));
      const boost     = 1 + proximity * 2.5;
      const drawR     = s.r * (1 + proximity * 1.0);

      ctx.beginPath();
      ctx.arc(fx, fy, drawR, 0, Math.PI * 2);

      if (s.hue === 'c') {
        ctx.fillStyle = `rgba(0,240,224,${Math.min(1, ta * boost)})`;
        if (s.r > 1.0 || proximity > 0.2) {
          ctx.shadowColor = 'rgba(0,240,224,0.95)';
          ctx.shadowBlur  = proximity > 0.2 ? 20 : 8;
        }
      } else if (s.hue === 'a') {
        ctx.fillStyle = `rgba(240,165,0,${Math.min(1, ta * boost)})`;
        if (s.r > 1.0) { ctx.shadowColor = 'rgba(240,165,0,0.85)'; ctx.shadowBlur = 8; }
      } else {
        ctx.fillStyle = `rgba(242,250,255,${Math.min(1, ta * boost * 0.9)})`;
        if (proximity > 0.28) { ctx.shadowColor = 'rgba(200,240,255,0.7)'; ctx.shadowBlur = 7; }
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* ── SHOOTING STARS ── */
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      s.x += Math.cos(s.ang) * s.spd;
      s.y += Math.sin(s.ang) * s.spd;
      s.life -= s.dec;
      if (s.life <= 0 || s.x > W + 300 || s.y > H + 300) { shooters.splice(i, 1); continue; }
      const g = ctx.createLinearGradient(
        s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len, s.x, s.y
      );
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(255,255,255,${s.life * 0.92})`);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = g;
      ctx.lineWidth   = 1.7 * s.life;
      ctx.stroke();
    }

    /* ── SOFT CURSOR GLOW ON CANVAS (PC) ── */
    if (!isMob) {
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
      cg.addColorStop(0, 'rgba(0,240,224,0.05)');
      cg.addColorStop(1, 'rgba(0,240,224,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
    }

    requestAnimationFrame(draw);
  }

  /* ── BURST — tap/click scatters nearby stars ──────── */
  function burst(bx, by) {
    stars.forEach(s => {
      const dx   = s.bx - bx;
      const dy   = s.by - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 240 && dist > 0) {
        const force = (1 - dist / 240) * 5.5;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
      }
    });
  }

  /* ── EVENTS ───────────────────────────────────────── */
  init();
  makeStars();
  draw();

  window.addEventListener('resize', () => { init(); makeStars(); }, { passive: true });

  /* PC mouse */
  window.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  window.addEventListener('click', e => {
    if (!e.target.closest('a,button')) burst(e.clientX, e.clientY);
  }, { passive: true });

  /* Mobile touch */
  function onTouch(e) {
    if (e.touches && e.touches.length > 0) {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
    }
  }
  document.addEventListener('touchstart',  onTouch, { passive: true });
  document.addEventListener('touchmove',   onTouch, { passive: true });
  document.addEventListener('touchend', e => {
    if (e.changedTouches.length > 0) {
      burst(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  }, { passive: true });

  /* ── GYROSCOPE (mobile tilt moves stars) ─────────── */
  if (isMob && window.DeviceOrientationEvent) {
    function enableGyro() {
      window.addEventListener('deviceorientation', e => {
        if (e.gamma == null) return;
        const gx = Math.max(-50, Math.min(50, e.gamma));
        const gy = Math.max(-40, Math.min(40, (e.beta || 0) - 20));
        tx = W / 2 + (gx / 50) * (W * 0.55);
        ty = H / 2 + (gy / 40) * (H * 0.44);
      }, { passive: true });
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      /* iOS 13+ needs a user gesture to grant permission */
      document.addEventListener('touchend', function askOnce() {
        DeviceOrientationEvent.requestPermission()
          .then(r => { if (r === 'granted') enableGyro(); })
          .catch(() => {});
        document.removeEventListener('touchend', askOnce);
      }, { once: true });
    } else {
      enableGyro();
    }
  }

})();
