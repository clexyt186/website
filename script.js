/* =============================================
   CLEXYT — Main Script
   Starfield · Cursor · Robot · Stats · Nav · ICS
   ============================================= */

'use strict';

// === CURSOR (hidden on touch devices) ===
(function() {
  if ('ontouchstart' in window) return;
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

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  document.addEventListener('mousedown', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(1.8)';
    ring.style.transform = 'translate(-50%,-50%) scale(0.7)';
  });
  document.addEventListener('mouseup', () => {
    dot.style.transform = 'translate(-50%,-50%) scale(1)';
    ring.style.transform = 'translate(-50%,-50%) scale(1)';
  });
})();


// === STARFIELD (brighter, denser, shooting stars, touch parallax) ===
(function() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, stars = [], shooters = [];
  let targetX = 0, targetY = 0, curX = 0, curY = 0;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    const count = Math.floor((W * H) / 2500);
    for (let i = 0; i < count; i++) {
      const rnd = Math.random();
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        a: Math.random() * 0.6 + 0.4,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        dx: (Math.random() - 0.5) * 0.12,
        dy: (Math.random() - 0.5) * 0.12,
        hue: rnd < 0.08 ? 'cyan' : rnd < 0.13 ? 'amber' : 'white'
      });
    }
  }

  function spawnShooter() {
    shooters.push({
      x: Math.random() * W * 0.6,
      y: Math.random() * H * 0.4,
      len: 90 + Math.random() * 130,
      speed: 9 + Math.random() * 7,
      angle: Math.PI / 4 + (Math.random() - 0.5) * 0.4,
      life: 1,
      decay: 0.016 + Math.random() * 0.014
    });
  }

  spawnShooter();
  setInterval(spawnShooter, 2500 + Math.random() * 2000);

  function draw() {
    ctx.clearRect(0, 0, W, H);

    curX += (targetX - curX) * 0.05;
    curY += (targetY - curY) * 0.05;
    const px = (curX / W - 0.5) * 28;
    const py = (curY / H - 0.5) * 28;

    for (const s of stars) {
      s.x += s.dx;
      s.y += s.dy;
      s.twinkle += s.twinkleSpeed;
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;

      const ta = s.a * (0.55 + 0.45 * Math.sin(s.twinkle));
      const ox = s.x + px * s.r * 0.35;
      const oy = s.y + py * s.r * 0.35;

      ctx.beginPath();
      ctx.arc(ox, oy, s.r, 0, Math.PI * 2);

      if (s.hue === 'cyan') {
        ctx.fillStyle = 'rgba(0,240,224,' + ta + ')';
        if (s.r > 1.2) { ctx.shadowColor = 'rgba(0,240,224,0.7)'; ctx.shadowBlur = 5; }
      } else if (s.hue === 'amber') {
        ctx.fillStyle = 'rgba(240,165,0,' + ta + ')';
        if (s.r > 1.2) { ctx.shadowColor = 'rgba(240,165,0,0.6)'; ctx.shadowBlur = 5; }
      } else {
        ctx.fillStyle = 'rgba(225,238,255,' + ta + ')';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      s.x += Math.cos(s.angle) * s.speed;
      s.y += Math.sin(s.angle) * s.speed;
      s.life -= s.decay;
      if (s.life <= 0) { shooters.splice(i, 1); continue; }
      const g = ctx.createLinearGradient(
        s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len,
        s.x, s.y
      );
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,' + (s.life * 0.9) + ')');
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5 * s.life;
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.012)';
    ctx.lineWidth = 0.5;
    const step = 80;
    for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    requestAnimationFrame(draw);
  }

  resize(); initStars(); draw();
  window.addEventListener('resize', () => { resize(); initStars(); });
  document.addEventListener('mousemove', e => { targetX = e.clientX; targetY = e.clientY; });
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 0) { targetX = e.touches[0].clientX; targetY = e.touches[0].clientY; }
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

  setInterval(() => {
    phraseIdx = (phraseIdx + 1) % phrases.length;
    if (promptEl) promptEl.textContent = phrases[phraseIdx];
  }, 3000);

  document.addEventListener('mousemove', e => {
    const rect = head.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / window.innerWidth;
    const dy = (e.clientY - cy) / window.innerHeight;
    head.style.transform = 'rotateX(' + (dy * -14) + 'deg) rotateY(' + (dx * 18) + 'deg)';
  });

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

  const particleEl = document.getElementById('roboParticles');
  if (particleEl) {
    function spawnParticle() {
      const p = document.createElement('div');
      const size = Math.random() * 3 + 1;
      p.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;border-radius:50%;left:' + (40 + Math.random() * 180) + 'px;top:' + (60 + Math.random() * 200) + 'px;background:rgba(0,240,224,' + (Math.random() * 0.4 + 0.1) + ');box-shadow:0 0 6px rgba(0,240,224,0.4);pointer-events:none;transition:all ' + (1.5 + Math.random() * 2) + 's ease-out;opacity:0;';
      particleEl.appendChild(p);
      setTimeout(() => { p.style.opacity = '1'; p.style.transform = 'translateY(-' + (30 + Math.random() * 60) + 'px) translateX(' + ((Math.random() - 0.5) * 40) + 'px)'; }, 10);
      setTimeout(() => { p.style.opacity = '0'; setTimeout(() => p.remove(), 600); }, 1500 + Math.random() * 1000);
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
  }, { threshold: 0.5 });

  nums.forEach(n => observer.observe(n));
})();


// === NOTIFICATION SYSTEM ===
function showNotif(msg, type) {
  type = type || 'success';
  const n = document.createElement('div');
  n.className = 'notif ' + type;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, 3200);
}
window.showNotif = showNotif;


// === TOUCH DEVICE — hide cursor elements ===
(function() {
  if ('ontouchstart' in window) {
    document.querySelectorAll('.c-dot,.c-ring').forEach(el => el.style.display = 'none');
  }
})();


// === BOOKING PAGE — ICS CALENDAR PARSER ===
// Reads calendar/merged_busy.ics — pre-built by update_calendar.py
async function loadICSCalendar() {
  try {
    const res = await fetch('calendar/merged_busy.ics?v=' + Date.now());
    if (!res.ok) return [];
    const text = await res.text();
    return parseICS(text);
  } catch (e) {
    return [];
  }
}

function parseICS(text) {
  const events = [];
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n');
  const blocks = unfolded.split('BEGIN:VEVENT');

  blocks.slice(1).forEach(function(block) {
    var sm = block.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    var em = block.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    if (!sm) return;
    events.push({
      start: parseICSDate(sm[1], sm[2] === 'Z'),
      end:   em ? parseICSDate(em[1], em[2] === 'Z') : null
    });
  });
  return events;
}

function parseICSDate(str, isUTC) {
  var y = +str.substr(0,4), mo = +str.substr(4,2)-1, d = +str.substr(6,2);
  var h = +str.substr(9,2), mi = +str.substr(11,2);
  if (isUTC) {
    var utc = new Date(Date.UTC(y, mo, d, h, mi));
    utc.setHours(utc.getHours() + 2);
    return utc;
  }
  return new Date(y, mo, d, h, mi);
}

function getBookedHoursForDate(events, dateStr) {
  var parts = dateStr.split('-');
  var tY = +parts[0], tM = +parts[1]-1, tD = +parts[2];
  var booked = [];

  events.forEach(function(ev) {
    var s = ev.start, e = ev.end;
    if (s.getFullYear() !== tY || s.getMonth() !== tM || s.getDate() !== tD) return;
    var startH = s.getHours();
    var endH = e ? e.getHours() + (e.getMinutes() > 0 ? 1 : 0) : startH + 1;
    for (var h = startH; h < endH; h++) {
      var slot = String(h).padStart(2,'0') + ':00';
      if (!booked.includes(slot)) booked.push(slot);
    }
  });
  return booked;
}

window.loadICSCalendar = loadICSCalendar;
window.getBookedHoursForDate = getBookedHoursForDate;