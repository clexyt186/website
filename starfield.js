/* ═══════════════════════════════════════════════════════════════
   CLEXYT — starfield.js
   Stars travel toward cursor / touch. Attraction-based, not parallax.
   Based on user's background.html concept, adapted to CLEXYT theme.
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* ── CONFIG ─────────────────────────────────────────────────── */
  const STAR_COUNT        = 210;    // sparse — space between stars
  const RESET_DISTANCE    = 14;     // star resets when this close to cursor
  const ATTRACT_STRENGTH  = 0.013;  // 70% slower than original (was 0.042)
  const MIN_STEP          = 0.18;   // 70% slower (was 0.85)
  const MAX_STEP          = 1.55;   // 70% slower (was 5.2)

  /* ── STATE ───────────────────────────────────────────────────── */
  let W = window.innerWidth;
  let H = window.innerHeight;
  let stars = [];
  let targetX = W / 2;
  let targetY = H / 2;

  /* ── STAR FACTORY ────────────────────────────────────────────── */
  function makeStar(w, h) {
    const brightness = 0.28 + Math.random() * 0.27; // 0.28–0.55 (subtle)
    const roll = Math.random();
    let color;
    if (roll < 0.08) {
      // Cyan — CLEXYT brand
      color = `rgba(0,240,224,${brightness})`;
    } else if (roll < 0.13) {
      // Amber — CLEXYT accent
      color = `rgba(240,165,0,${brightness * 0.9})`;
    } else if (roll < 0.22) {
      // Cool blue-white
      color = `rgba(200,220,255,${brightness})`;
    } else {
      // Pure white
      color = `rgba(255,255,255,${brightness})`;
    }
    return {
      x:           Math.random() * w,
      y:           Math.random() * h,
      radius:      0.8 + Math.random() * 2.0,   // smaller — 0.8 to 2.8px
      speedFactor: 0.55 + Math.random() * 0.9,  // personal organic variance
      brightness,
      color,
      // Twinkle state
      twinkle:     Math.random() * Math.PI * 2,
      twinkleSpd:  0.008 + Math.random() * 0.018,
    };
  }

  function resetStar(s) {
    const fresh = makeStar(W, H);
    Object.assign(s, fresh);
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
    targetX = W / 2;
    targetY = H / 2;
  }

  /* ── UPDATE ─────────────────────────────────────────────────── */
  function update() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      const dx   = targetX - s.x;
      const dy   = targetY - s.y;
      const dist = Math.hypot(dx, dy);

      // Reset star that reached the attractor — keeps field populated
      if (dist < RESET_DISTANCE) {
        resetStar(s);
        continue;
      }

      if (dist < 0.01) { resetStar(s); continue; }

      const dirX = dx / dist;
      const dirY = dy / dist;

      // Farther stars also feel pull, but step capped at MAX_STEP
      let step = Math.min(MAX_STEP, MIN_STEP + ATTRACT_STRENGTH * dist);
      step *= s.speedFactor;
      step  = Math.min(step, dist); // never overshoot

      s.x += dirX * step;
      s.y += dirY * step;

      // Twinkle
      s.twinkle += s.twinkleSpd;
    }
  }

  /* ── DRAW ────────────────────────────────────────────────────── */
  function draw() {
    // Fully transparent clear — content sits on top, we are just the background
    ctx.clearRect(0, 0, W, H);

    for (const s of stars) {
      const twinkleMod = 0.75 + 0.25 * Math.sin(s.twinkle);
      const alpha      = s.brightness * twinkleMod;

      // Main star circle
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = s.color.replace(/[\d.]+\)$/, alpha + ')');
      ctx.fill();

      // Inner bright core for larger stars (depth effect)
      if (s.radius > 1.6) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,245,${alpha * 0.65})`;
        ctx.fill();
      }

      // Cyan glow for cyan stars near cursor
      if (s.color.startsWith('rgba(0,240')) {
        const distToCursor = Math.hypot(targetX - s.x, targetY - s.y);
        if (distToCursor < 180) {
          const glowAlpha = (1 - distToCursor / 180) * 0.45;
          ctx.shadowColor = 'rgba(0,240,224,0.9)';
          ctx.shadowBlur  = 10;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * 1.1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,240,224,${glowAlpha})`;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    // Subtle attractor corona at cursor — cyan tint, very faint
    const cg = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, 90);
    cg.addColorStop(0,   'rgba(0,240,224,0.055)');
    cg.addColorStop(0.5, 'rgba(0,240,224,0.018)');
    cg.addColorStop(1,   'rgba(0,240,224,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── LOOP ────────────────────────────────────────────────────── */
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  /* ── EVENTS ─────────────────────────────────────────────────── */
  const isMob = 'ontouchstart' in window;

  // PC mouse
  if (!isMob) {
    canvas.addEventListener('mousemove', e => {
      targetX = e.clientX;
      targetY = e.clientY;
    });
    // Return to centre when mouse leaves — elegant drift back
    canvas.addEventListener('mouseleave', () => {
      targetX = W / 2;
      targetY = H / 2;
    });
  }

  // Mobile touch — also works on document so nav/content touches work too
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 0) {
      targetX = e.touches[0].clientX;
      targetY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (e.touches.length > 0) {
      targetX = e.touches[0].clientX;
      targetY = e.touches[0].clientY;
    }
  }, { passive: true });

  // Return to centre when finger lifts — stars drift back gently
  document.addEventListener('touchend', () => {
    targetX = W / 2;
    targetY = H / 2;
  }, { passive: true });

  // Gyroscope for phone tilt
  if (isMob && window.DeviceOrientationEvent) {
    function enableGyro() {
      window.addEventListener('deviceorientation', e => {
        if (e.gamma == null) return;
        const gx = Math.max(-45, Math.min(45, e.gamma));
        const gy = Math.max(-40, Math.min(40, (e.beta || 0) - 20));
        targetX = W / 2 + (gx / 45) * (W * 0.42);
        targetY = H / 2 + (gy / 40) * (H * 0.38);
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

  window.addEventListener('resize', resize, { passive: true });

  /* ── START ───────────────────────────────────────────────────── */
  resize();
  loop();

})();