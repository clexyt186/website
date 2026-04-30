/* ═══════════════════════════════════════════════════════════════
   CLEXYT starfield.js — v6
   - Stars spread full page, slow random drift when idle
   - Only stars within ATTRACT_RADIUS flow toward cursor/touch
   - Outer stars do slow brownian drift
   - No movement until first cursor/touch interaction
   - Attractor resets to centre after 10s idle → stars drift back
   - Transparent canvas background — never disturbs page content
   - CLEXYT colours: cyan #00f0e0, amber #f0a500, white
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  let ctx = canvas.getContext('2d');

  /* ── CONFIG (40% slower than bakgorund.html) ─────────────────── */
  const STAR_COUNT          = 580;   // rich but sparse feeling — spread wide
  const IDLE_RESET_SECS     = 10;    // seconds before attractor returns to centre
  const OUTSIDE_DRIFT       = 0.17;

  // Mobile gets stronger attraction so stars visibly rush to touch point
  const isMob = ('ontouchstart' in window);
  const ATTRACT_RADIUS      = isMob ? 220  : 160;   // bigger radius on mobile
  const ATTRACTION_FORCE    = isMob ? 0.032 : 0.013; // faster pull on mobile
  const MAX_ATTRACT_STEP    = isMob ? 4.2  : 1.14;  // much faster on mobile
  const MIN_ATTRACT_STEP    = isMob ? 0.6  : 0.24;

  /* ── STATE ───────────────────────────────────────────────────── */
  let W = window.innerWidth;
  let H = window.innerHeight;
  let stars = [];
  let targetX = W / 2;
  let targetY = H / 2;
  let hasInteracted = false; // stars stay still until first move
  let idleTimer = null;
  let leaveTimer = null;

  /* ── STAR FACTORY ────────────────────────────────────────────── */
  function makeStar(w, h) {
    const brightness   = 0.55 + Math.random() * 0.35; // 0.55–0.90
    const glowIntensity = 0.3 + Math.random() * 0.5;
    const roll = Math.random();

    let color;
    if (roll < 0.07) {
      color = `rgba(0,240,224,${brightness})`;       // CLEXYT cyan
    } else if (roll < 0.13) {
      color = `rgba(240,165,0,${brightness * 0.85})`; // CLEXYT amber
    } else if (roll < 0.22) {
      color = `rgba(180,210,255,${brightness})`;     // cool blue-white
    } else {
      color = `rgba(255,255,250,${brightness})`;     // pure starlight
    }

    return {
      x:           Math.random() * w,
      y:           Math.random() * h,
      radius:      0.7 + Math.random() * 1.8,        // 0.7–2.5px — delicate
      speedFactor: 0.55 + Math.random() * 0.9,
      brightness,
      glowIntensity,
      color,
      // Twinkle
      tw:  Math.random() * Math.PI * 2,
      tws: 0.006 + Math.random() * 0.014,
    };
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) stars.push(makeStar(W, H));
  }

  /* ── RESIZE ─────────────────────────────────────────────────── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initStars();
    if (!hasInteracted) { targetX = W / 2; targetY = H / 2; }
  }

  /* ── IDLE RESET ──────────────────────────────────────────────── */
  function scheduleReset() {
    clearTimeout(idleTimer);
    clearTimeout(leaveTimer);
    idleTimer = setTimeout(() => {
      targetX = W / 2;
      targetY = H / 2;
    }, IDLE_RESET_SECS * 1000);
  }

  /* ── UPDATE ─────────────────────────────────────────────────── */
  function update() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.tw += s.tws;

      if (!hasInteracted) continue; // frozen until first interaction

      const dx   = targetX - s.x;
      const dy   = targetY - s.y;
      const dist = Math.hypot(dx, dy);

      if (dist < ATTRACT_RADIUS && dist > 0.5) {
        /* ── INSIDE RADIUS: gentle flow toward cursor ── */
        const dirX = dx / dist;
        const dirY = dy / dist;
        let step = MIN_ATTRACT_STEP + ATTRACTION_FORCE * dist;
        step = Math.min(MAX_ATTRACT_STEP, step) * s.speedFactor;
        step = Math.min(step, dist);
        s.x += dirX * step;
        s.y += dirY * step;

        // Singularity guard
        if (dist < 2) {
          s.x += (Math.random() - 0.5) * 3;
          s.y += (Math.random() - 0.5) * 3;
        }
      } else {
        /* ── OUTSIDE: very slow brownian drift ── */
        const angle = Math.random() * Math.PI * 2;
        const mag   = OUTSIDE_DRIFT * (0.4 + Math.random() * 0.9);
        s.x += Math.cos(angle) * mag;
        s.y += Math.sin(angle) * mag;
      }

      // Clamp to canvas
      s.x = Math.max(0, Math.min(W, s.x));
      s.y = Math.max(0, Math.min(H, s.y));
    }
  }

  /* ── DRAW ────────────────────────────────────────────────────── */
  function draw() {
    // Fully transparent — page background shows through
    ctx.clearRect(0, 0, W, H);

    for (const s of stars) {
      const twMod = 0.78 + 0.22 * Math.sin(s.tw);
      const alpha = s.brightness * twMod;

      /* Outer glow halo */
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 2.6, 0, Math.PI * 2);
      let glowStyle;
      if (s.color.startsWith('rgba(0,240,224')) {
        glowStyle = `rgba(0,240,224,${s.glowIntensity * 0.28})`;
      } else if (s.color.startsWith('rgba(240,165')) {
        glowStyle = `rgba(240,165,0,${s.glowIntensity * 0.25})`;
      } else if (s.color.startsWith('rgba(180,210')) {
        glowStyle = `rgba(140,170,240,${s.glowIntensity * 0.30})`;
      } else {
        glowStyle = `rgba(210,220,255,${s.glowIntensity * 0.22})`;
      }
      ctx.fillStyle = glowStyle;
      ctx.fill();

      /* Secondary soft halo */
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = s.brightness > 0.85
        ? `rgba(255,255,245,0.18)`
        : `rgba(200,210,250,0.14)`;
      ctx.fill();

      /* Crisp core */
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.88, 0, Math.PI * 2);
      // Reconstruct color with current twinkle alpha
      ctx.fillStyle = s.color.replace(/[\d.]+\)$/, alpha + ')');
      ctx.fill();

      /* Bright nucleus for larger stars */
      if (s.radius > 1.2) {
        ctx.beginPath();
        ctx.arc(s.x - 0.2, s.y - 0.2, s.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,250,240,0.80)';
        ctx.fill();
      }
    }

    /* Subtle attractor corona (very faint cyan ring) */
    if (hasInteracted) {
      const cg = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, ATTRACT_RADIUS * 0.55);
      cg.addColorStop(0,   'rgba(0,240,224,0.04)');
      cg.addColorStop(0.6, 'rgba(0,240,224,0.015)');
      cg.addColorStop(1,   'rgba(0,240,224,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ── LOOP ────────────────────────────────────────────────────── */
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  /* ── INPUT HANDLING ──────────────────────────────────────────── */
  function onMove(x, y) {
    hasInteracted = true;
    targetX = x;
    targetY = y;
    scheduleReset();
  }

  // PC mouse — listen on window so nav/content moves work too
  window.addEventListener('mousemove', e => {
    onMove(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      targetX = W / 2; targetY = H / 2;
    }, 600);
  }, { passive: true });

  // Mobile touch — document level so works everywhere on page
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 0) {
      const tx2 = e.touches[0].clientX;
      const ty2 = e.touches[0].clientY;
      onMove(tx2, ty2);
      // Burst: kick nearby stars toward tap point immediately
      if (isMob) {
        stars.forEach(s => {
          const dx = tx2 - s.x, dy = ty2 - s.y;
          const dist = Math.hypot(dx, dy);
          if (dist < ATTRACT_RADIUS && dist > 0) {
            const kick = (1 - dist / ATTRACT_RADIUS) * 5.5;
            s.x += (dx / dist) * kick;
            s.y += (dy / dist) * kick;
          }
        });
      }
    }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  document.addEventListener('touchend', () => {
    scheduleReset();
  }, { passive: true });

  // Gyroscope (mobile tilt)
  if (isMob && window.DeviceOrientationEvent) {
    function enableGyro() {
      window.addEventListener('deviceorientation', e => {
        if (e.gamma == null) return;
        const gx = Math.max(-45, Math.min(45, e.gamma));
        const gy = Math.max(-40, Math.min(40, (e.beta || 0) - 20));
        onMove(
          W / 2 + (gx / 45) * (W * 0.38),
          H / 2 + (gy / 40) * (H * 0.32)
        );
      }, { passive: true });
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      document.addEventListener('touchend', function ask() {
        DeviceOrientationEvent.requestPermission()
          .then(r => { if (r === 'granted') enableGyro(); })
          .catch(() => {});
        document.removeEventListener('touchend', ask);
      }, { once: true });
    } else {
      enableGyro();
    }
  }

  // Resize
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(resize, 100);
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(resize, 60);
  }, { passive: true });

  /* ── START ───────────────────────────────────────────────────── */
  resize();
  loop();

})();