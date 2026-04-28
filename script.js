/* =============================================
   CLEXYT — Main Script
   Starfield · Cursor · Robot · Stats · Nav
   ============================================= */

'use strict';

// === CURSOR ===
(function() {
  const dot = document.querySelector('.c-dot');
  const ring = document.querySelector('.c-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  function tick() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    requestAnimationFrame(tick);
  }
  tick();

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
  });

  document.addEventListener('mousedown', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(1.8)';
    ring.style.transform = 'translate(-50%,-50%) scale(0.7)';
  });
  document.addEventListener('mouseup', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(1)';
    ring.style.transform = 'translate(-50%,-50%) scale(1)';
  });
})();


// === STARFIELD (with touch + shooting stars) ===
(function() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, stars = [], shooters = [];
  let mx = 0, my = 0;
  let targetMx = 0, targetMy = 0;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    const count = Math.floor((W * H) / 6000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        a: Math.random() * 0.8 + 0.2,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.03,
        dx: (Math.random() - .5) * 0.12,
        dy: (Math.random() - .5) * 0.12,
        // Some stars get a cyan or amber tint
        hue: Math.random() < 0.08 ? 'cyan' : Math.random() < 0.05 ? 'amber' : 'white'
      });
    }
  }

  function spawnShooter() {
    shooters.push({
      x: Math.random() * W * 0.7,
      y: Math.random() * H * 0.4,
      len: 80 + Math.random() * 120,
      speed: 8 + Math.random() * 6,
      angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
      life: 1,
      decay: 0.018 + Math.random() * 0.015
    });
  }
  // Spawn shooting star every 4-8 seconds
  setInterval(spawnShooter, 4000 + Math.random() * 4000);

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Smooth mouse follow
    mx += (targetMx - mx) * 0.06;
    my += (targetMy - my) * 0.06;

    const px = (mx / W - .5) * 24;
    const py = (my / H - .5) * 24;

    // Draw stars
    for (const s of stars) {
      s.x += s.dx;
      s.y += s.dy;
      s.twinkle += s.twinkleSpeed;
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;

      const twinkleA = s.a * (0.6 + 0.4 * Math.sin(s.twinkle));
      const ox = s.x + px * s.r * 0.4;
      const oy = s.y + py * s.r * 0.4;

      ctx.beginPath();
      ctx.arc(ox, oy, s.r, 0, Math.PI * 2);

      if (s.hue === 'cyan') {
        ctx.fillStyle = `rgba(0,240,224,${twinkleA})`;
        if (s.r > 1) {
          ctx.shadowColor = 'rgba(0,240,224,0.6)';
          ctx.shadowBlur = 4;
        }
      } else if (s.hue === 'amber') {
        ctx.fillStyle = `rgba(240,165,0,${twinkleA})`;
        if (s.r > 1) {
          ctx.shadowColor = 'rgba(240,165,0,0.5)';
          ctx.shadowBlur = 4;
        }
      } else {
        ctx.fillStyle = `rgba(200,220,255,${twinkleA})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw shooting stars
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      s.x += Math.cos(s.angle) * s.speed;
      s.y += Math.sin(s.angle) * s.speed;
      s.life -= s.decay;
      if (s.life <= 0) { shooters.splice(i, 1); continue; }

      const grad = ctx.createLinearGradient(
        s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len,
        s.x, s.y
      );
      grad.addColorStop(0, `rgba(255,255,255,0)`);
      grad.addColorStop(1, `rgba(255,255,255,${s.life * 0.8})`);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5 * s.life;
      ctx.stroke();
    }

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.012)';
    ctx.lineWidth = .5;
    const step = 80;
    for (let x = 0; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  resize();
  initStars();
  draw();
  window.addEventListener('resize', () => { resize(); initStars(); });

  // Mouse support
  document.addEventListener('mousemove', e => { targetMx = e.clientX; targetMy = e.clientY; });

  // Touch support for mobile parallax
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 0) {
      targetMx = e.touches[0].clientX;
      targetMy = e.touches[0].clientY;
    }
  }, { passive: true });
})();


// === NAV ===
(function() {
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobNav = document.getElementById('mobNav');
  if (!nav) return;

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });

  if (burger && mobNav) {
    burger.addEventListener('click', () => {
      mobNav.classList.toggle('open');
    });
  }
})();


// === ROBOT HEAD MOUSE TRACKING (index only) ===
(function() {
  const head = document.getElementById('rbHead');
  if (!head) return;

  const stage = document.getElementById('robotStage');
  const promptEl = document.getElementById('promptText');

  const phrases = [
    'Choose your path',
    'Photography or Tech?',
    'What are we building?',
    'Pick a side...',
    'Both sides are good',
    'I present two paths'
  ];
  let phraseIdx = 0;

  // Cycle phrases
  setInterval(() => {
    phraseIdx = (phraseIdx + 1) % phrases.length;
    if (promptEl) promptEl.textContent = phrases[phraseIdx];
  }, 3000);

  // Mouse tracking for head tilt
  document.addEventListener('mousemove', e => {
    if (!head) return;
    const rect = head.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / window.innerWidth;
    const dy = (e.clientY - cy) / window.innerHeight;
    const rx = dy * -14;
    const ry = dx * 18;
    head.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  });

  // Panel hover: prompt update
  const leftPanel = document.getElementById('choiceLeft');
  const rightPanel = document.getElementById('choiceRight');

  if (leftPanel) {
    leftPanel.addEventListener('mouseenter', () => {
      if (promptEl) promptEl.textContent = 'Photography — a great choice';
      head.style.transform = 'rotateY(-20deg)';
    });
    leftPanel.addEventListener('mouseleave', () => {
      if (promptEl) promptEl.textContent = phrases[phraseIdx];
    });
  }
  if (rightPanel) {
    rightPanel.addEventListener('mouseenter', () => {
      if (promptEl) promptEl.textContent = 'Tech consulting — bold move';
      head.style.transform = 'rotateY(20deg)';
    });
    rightPanel.addEventListener('mouseleave', () => {
      if (promptEl) promptEl.textContent = phrases[phraseIdx];
    });
  }

  // Ambient robot particles
  const particleEl = document.getElementById('roboParticles');
  if (particleEl) {
    function spawnParticle() {
      const p = document.createElement('div');
      const size = Math.random() * 3 + 1;
      const startX = 40 + Math.random() * 180;
      const startY = 60 + Math.random() * 200;
      p.style.cssText = `
        position:absolute;
        width:${size}px;height:${size}px;
        border-radius:50%;
        left:${startX}px;top:${startY}px;
        background:rgba(0,240,224,${Math.random() * 0.4 + 0.1});
        box-shadow:0 0 6px rgba(0,240,224,0.4);
        pointer-events:none;
        transition:all ${1.5 + Math.random() * 2}s ease-out;
        opacity:0;
      `;
      particleEl.appendChild(p);
      setTimeout(() => {
        p.style.opacity = '1';
        p.style.transform = `translateY(-${30 + Math.random() * 60}px) translateX(${(Math.random()-0.5)*40}px)`;
      }, 10);
      setTimeout(() => {
        p.style.opacity = '0';
        setTimeout(() => p.remove(), 600);
      }, 1500 + Math.random() * 1000);
    }
    setInterval(spawnParticle, 400);
  }
})();


// === STATS COUNTER ===
(function() {
  const nums = document.querySelectorAll('.stat-n');
  if (!nums.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target);
      const duration = 1600;
      const start = performance.now();
      function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(ease * target) + (target > 10 ? '+' : '');
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = target + '+';
      }
      requestAnimationFrame(step);
      observer.unobserve(el);
    });
  }, { threshold: .5 });

  nums.forEach(n => observer.observe(n));
})();


// === NOTIFICATION SYSTEM (global) ===
function showNotif(msg, type = 'success') {
  const n = document.createElement('div');
  n.className = 'notif ' + type;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => {
    n.classList.remove('show');
    setTimeout(() => n.remove(), 400);
  }, 3200);
}
window.showNotif = showNotif;


// === FOLD CARD ACCESSIBILITY (prevent cursor:none weirdness on touch) ===
(function() {
  if ('ontouchstart' in window) {
    document.body.style.cursor = 'auto';
    document.querySelectorAll('.c-dot,.c-ring').forEach(el => el.style.display = 'none');
  }
})();


// === BOOKING PAGE — ICS CALENDAR PARSER ===
// Reads /calendar/calendar.ics and marks booked times
async function loadICSCalendar() {
  try {
    const res = await fetch('calendar/calendar.ics');
    if (!res.ok) return null;
    const text = await res.text();
    return parseICS(text);
  } catch (e) {
    return null;
  }
}

function parseICS(text) {
  const events = [];
  // Unfold lines (ICS wraps long lines with CRLF + space)
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n');
  const blocks = unfolded.split('BEGIN:VEVENT');

  blocks.slice(1).forEach(block => {
    // Match TZID format: DTSTART;TZID=...:20260428T080000
    // Match UTC format:  DTSTART:20260428T080000Z
    // Match plain format:DTSTART:20260428T080000
    const dtStartMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    const dtEndMatch   = block.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    if (!dtStartMatch) return;

    // Check if it has TZID (local SAST time) or Z (UTC) or plain (assume local)
    const startIsUTC = dtStartMatch[2] === 'Z';
    const endIsUTC   = dtEndMatch ? dtEndMatch[2] === 'Z' : startIsUTC;

    const start = parseICSDate(dtStartMatch[1], startIsUTC);
    const end   = dtEndMatch ? parseICSDate(dtEndMatch[1], endIsUTC) : null;

    events.push({ start, end });
  });
  return events;
}

function parseICSDate(str, isUTC) {
  const y  = str.substr(0,4), mo = str.substr(4,2), d  = str.substr(6,2);
  const h  = str.substr(9,2), mi = str.substr(11,2);
  if (isUTC) {
    // UTC time — convert to SAST (UTC+2) by adding 2 hours
    const utc = new Date(Date.UTC(+y, +mo-1, +d, +h, +mi));
    utc.setHours(utc.getHours() + 2);
    return utc;
  }
  // Local SAST time — treat as-is
  return new Date(+y, +mo-1, +d, +h, +mi);
}

function getBookedHoursForDate(events, dateStr) {
  const parts = dateStr.split('-');
  const targetY = parseInt(parts[0]);
  const targetM = parseInt(parts[1]) - 1;
  const targetD = parseInt(parts[2]);
  const booked = [];

  events.forEach(ev => {
    const s = ev.start;
    const e = ev.end;

    // Check if event falls on this date
    if (s.getFullYear() !== targetY ||
        s.getMonth()    !== targetM ||
        s.getDate()     !== targetD) return;

    // Grey out every hour the event covers
    const startH = s.getHours();
    const endH   = e
      ? e.getHours() + (e.getMinutes() > 0 ? 1 : 0)
      : startH + 1;

    for (let h = startH; h < endH; h++) {
      const slot = String(h).padStart(2,'0') + ':00';
      if (!booked.includes(slot)) booked.push(slot);
    }
  });

  return booked;
}

window.loadICSCalendar = loadICSCalendar;
window.getBookedHoursForDate = getBookedHoursForDate;