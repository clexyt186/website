/* =============================================
   CLEXYT — Main Script v3
   ============================================= */
'use strict';

// === CURSOR (PC only — follows mouse with glow ring) ===
(function() {
  if ('ontouchstart' in window) return;
  const dot = document.querySelector('.c-dot');
  const ring = document.querySelector('.c-ring');
  if (!dot || !ring) return;
  let mx = window.innerWidth/2, my = window.innerHeight/2, rx = mx, ry = my;
  function tick() {
    rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
    dot.style.left=mx+'px'; dot.style.top=my+'px';
    ring.style.left=rx+'px'; ring.style.top=ry+'px';
    requestAnimationFrame(tick);
  }
  tick();
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
  document.addEventListener('mousedown', () => {
    dot.style.transform='translate(-50%,-50%) scale(2)';
    ring.style.transform='translate(-50%,-50%) scale(0.6)';
    ring.style.borderColor='var(--cyan)';
    ring.style.boxShadow='0 0 20px var(--cyan)';
  });
  document.addEventListener('mouseup', () => {
    dot.style.transform='translate(-50%,-50%) scale(1)';
    ring.style.transform='translate(-50%,-50%) scale(1)';
    ring.style.borderColor='';
    ring.style.boxShadow='';
  });
})();

// === TOUCH GLOW (mobile — glowing dot that follows your finger) ===
(function() {
  if (!('ontouchstart' in window)) return;
  document.querySelectorAll('.c-dot,.c-ring').forEach(el => el.style.display='none');
  const glow = document.createElement('div');
  glow.style.cssText='position:fixed;width:36px;height:36px;border-radius:50%;border:1.5px solid rgba(0,240,224,0.6);box-shadow:0 0 14px rgba(0,240,224,0.5),inset 0 0 8px rgba(0,240,224,0.2);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);transition:transform 0.1s,opacity 0.2s;opacity:0;top:0;left:0;';
  document.body.appendChild(glow);
  let glowX=0, glowY=0, curGX=0, curGY=0, visible=false, hideTimer;

  function tick() {
    curGX += (glowX-curGX)*0.18;
    curGY += (glowY-curGY)*0.18;
    glow.style.left=curGX+'px';
    glow.style.top=curGY+'px';
    requestAnimationFrame(tick);
  }
  tick();

  function onMove(e) {
    const t = e.touches[0];
    glowX = t.clientX; glowY = t.clientY;
    if (!visible) { glow.style.opacity='1'; visible=true; }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { glow.style.opacity='0'; visible=false; }, 1200);
  }
  document.addEventListener('touchstart', onMove, {passive:true});
  document.addEventListener('touchmove', onMove, {passive:true});
  document.addEventListener('touchend', () => {
    hideTimer = setTimeout(() => { glow.style.opacity='0'; visible=false; }, 400);
  });
})();

// === STARFIELD — stars gather near cursor/touch, parallax, shooting stars ===
(function() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars=[], shooters=[];
  let targetX, targetY, curX, curY;

  function center() {
    targetX = W/2; targetY = H/2; curX = W/2; curY = H/2;
  }
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    center();
  }
  function initStars() {
    stars = [];
    const count = Math.floor((W*H)/1600);
    for (let i=0; i<count; i++) {
      const rnd = Math.random();
      stars.push({
        x: Math.random()*W, y: Math.random()*H,
        bx: 0, by: 0,  // base position (before gather effect)
        r: Math.random()*2.3+0.4,
        a: Math.random()*0.45+0.55,
        twinkle: Math.random()*Math.PI*2,
        tSpeed: 0.015+Math.random()*0.03,
        dx: (Math.random()-0.5)*0.1,
        dy: (Math.random()-0.5)*0.1,
        depth: Math.random()*0.9+0.1,
        hue: rnd<0.08?'cyan':rnd<0.13?'amber':'white'
      });
    }
  }
  function spawnShooter() {
    shooters.push({
      x:Math.random()*W*0.7, y:Math.random()*H*0.35,
      len:110+Math.random()*150, speed:11+Math.random()*9,
      angle:Math.PI/4+(Math.random()-0.5)*0.5,
      life:1, decay:0.013+Math.random()*0.011
    });
  }
  spawnShooter();
  setInterval(spawnShooter, 2200+Math.random()*1800);

  function draw() {
    ctx.clearRect(0,0,W,H);
    curX += (targetX-curX)*0.07;
    curY += (targetY-curY)*0.07;
    // Offset from center — drives parallax
    const offX = curX - W/2;
    const offY = curY - H/2;

    for (const s of stars) {
      s.x += s.dx; s.y += s.dy;
      s.twinkle += s.tSpeed;
      if(s.x<0)s.x=W; if(s.x>W)s.x=0;
      if(s.y<0)s.y=H; if(s.y>H)s.y=0;

      // Gather effect — stars near cursor drift toward it slightly
      const distX = curX - s.x;
      const distY = curY - s.y;
      const dist = Math.sqrt(distX*distX+distY*distY);
      const gatherRadius = Math.min(W,H)*0.28;
      let gx=0, gy=0;
      if (dist < gatherRadius) {
        const pull = (1-(dist/gatherRadius))*0.012;
        gx = distX * pull;
        gy = distY * pull;
      }

      const ta = s.a*(0.5+0.5*Math.sin(s.twinkle));
      // Parallax: deeper stars move more with cursor
      const px = s.x + offX*s.depth*0.055 + gx;
      const py = s.y + offY*s.depth*0.055 + gy;

      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI*2);
      if (s.hue==='cyan') {
        ctx.fillStyle='rgba(0,240,224,'+ta+')';
        if(s.r>1.3){ctx.shadowColor='rgba(0,240,224,0.8)';ctx.shadowBlur=7;}
      } else if (s.hue==='amber') {
        ctx.fillStyle='rgba(240,165,0,'+ta+')';
        if(s.r>1.3){ctx.shadowColor='rgba(240,165,0,0.7)';ctx.shadowBlur=7;}
      } else {
        ctx.fillStyle='rgba(240,248,255,'+ta+')';
        ctx.shadowBlur=0;
      }
      ctx.fill();
      ctx.shadowBlur=0;
    }

    // Shooting stars
    for (let i=shooters.length-1; i>=0; i--) {
      const s=shooters[i];
      s.x+=Math.cos(s.angle)*s.speed; s.y+=Math.sin(s.angle)*s.speed;
      s.life-=s.decay;
      if(s.life<=0){shooters.splice(i,1);continue;}
      const g=ctx.createLinearGradient(s.x-Math.cos(s.angle)*s.len,s.y-Math.sin(s.angle)*s.len,s.x,s.y);
      g.addColorStop(0,'rgba(255,255,255,0)');
      g.addColorStop(1,'rgba(255,255,255,'+(s.life*0.95)+')');
      ctx.beginPath();
      ctx.moveTo(s.x-Math.cos(s.angle)*s.len,s.y-Math.sin(s.angle)*s.len);
      ctx.lineTo(s.x,s.y);
      ctx.strokeStyle=g; ctx.lineWidth=1.8*s.life; ctx.stroke();
    }

    // Subtle grid
    ctx.strokeStyle='rgba(255,255,255,0.01)'; ctx.lineWidth=0.5;
    for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    requestAnimationFrame(draw);
  }

  resize(); initStars(); draw();
  window.addEventListener('resize', ()=>{resize();initStars();});
  document.addEventListener('mousemove', e=>{targetX=e.clientX;targetY=e.clientY;});
  function onTouch(e){if(e.touches.length>0){targetX=e.touches[0].clientX;targetY=e.touches[0].clientY;}}
  document.addEventListener('touchstart',onTouch,{passive:true});
  document.addEventListener('touchmove',onTouch,{passive:true});
})();

// === NAV + BURGER ===
(function() {
  const nav=document.getElementById('nav');
  const burger=document.getElementById('burger');
  const mobNav=document.getElementById('mobNav');
  if(nav) window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>50));
  if(burger&&mobNav) {
    burger.addEventListener('click',()=>{
      mobNav.classList.toggle('open');
      // Animate burger to X
      burger.classList.toggle('active');
    });
    // Close when a link is clicked
    mobNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
      mobNav.classList.remove('open');
      burger.classList.remove('active');
    }));
  }
})();

// === ROBOT HEAD TRACKING ===
(function() {
  const head=document.getElementById('rbHead');
  if(!head) return;
  const promptEl=document.getElementById('promptText');
  const phrases=['Choose your path','Photography or Tech?','What are we building?','Pick a side...','Both sides are good','I present two paths'];
  let idx=0;
  setInterval(()=>{idx=(idx+1)%phrases.length;if(promptEl)promptEl.textContent=phrases[idx];},3000);
  document.addEventListener('mousemove',e=>{
    const r=head.getBoundingClientRect();
    const dx=(e.clientX-r.left-r.width/2)/window.innerWidth;
    const dy=(e.clientY-r.top-r.height/2)/window.innerHeight;
    head.style.transform='rotateX('+(dy*-14)+'deg) rotateY('+(dx*18)+'deg)';
  });
  const lp=document.getElementById('choiceLeft'),rp=document.getElementById('choiceRight');
  if(lp){lp.addEventListener('mouseenter',()=>{if(promptEl)promptEl.textContent='Photography — a great choice';head.style.transform='rotateY(-20deg)';});lp.addEventListener('mouseleave',()=>{if(promptEl)promptEl.textContent=phrases[idx];});}
  if(rp){rp.addEventListener('mouseenter',()=>{if(promptEl)promptEl.textContent='Tech consulting — bold move';head.style.transform='rotateY(20deg)';});rp.addEventListener('mouseleave',()=>{if(promptEl)promptEl.textContent=phrases[idx];});}
  const pe=document.getElementById('roboParticles');
  if(pe) setInterval(()=>{
    const p=document.createElement('div'),sz=Math.random()*3+1;
    p.style.cssText='position:absolute;width:'+sz+'px;height:'+sz+'px;border-radius:50%;left:'+(40+Math.random()*180)+'px;top:'+(60+Math.random()*200)+'px;background:rgba(0,240,224,'+(Math.random()*0.4+0.1)+');box-shadow:0 0 6px rgba(0,240,224,0.4);pointer-events:none;transition:all '+(1.5+Math.random()*2)+'s ease-out;opacity:0;';
    pe.appendChild(p);
    setTimeout(()=>{p.style.opacity='1';p.style.transform='translateY(-'+(30+Math.random()*60)+'px) translateX('+((Math.random()-0.5)*40)+'px)';},10);
    setTimeout(()=>{p.style.opacity='0';setTimeout(()=>p.remove(),600);},1500+Math.random()*1000);
  },400);
})();

// === STATS COUNTER ===
(function() {
  function run() {
    const nums=document.querySelectorAll('.stat-n');
    if(!nums.length) return;
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting) return;
        const el=entry.target;
        if(el.dataset.counted) return;
        el.dataset.counted='1';
        const target=parseInt(el.dataset.target);
        const start=performance.now();
        function step(now){
          const t=Math.min((now-start)/1800,1);
          const ease=1-Math.pow(1-t,3);
          el.textContent=Math.floor(ease*target)+(target>10?'+':'');
          if(t<1) requestAnimationFrame(step);
          else el.textContent=target+'+';
        }
        requestAnimationFrame(step);
        obs.unobserve(el);
      });
    },{threshold:0.2});
    nums.forEach(n=>obs.observe(n));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run);
  else run();
})();

// === NOTIFICATIONS ===
function showNotif(msg,type){
  type=type||'success';
  const n=document.createElement('div');
  n.className='notif '+type; n.textContent=msg;
  document.body.appendChild(n);
  setTimeout(()=>n.classList.add('show'),10);
  setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),400);},3200);
}
window.showNotif=showNotif;

// === ICS CALENDAR ===
async function loadICSCalendar(){
  try{
    const res=await fetch('calendar/merged_busy.ics?v='+Date.now());
    if(!res.ok) return [];
    return parseICS(await res.text());
  }catch(e){return [];}
}
function parseICS(text){
  const events=[];
  const unfolded=text.replace(/\r\n[ \t]/g,'').replace(/\r\n/g,'\n');
  unfolded.split('BEGIN:VEVENT').slice(1).forEach(block=>{
    const sm=block.match(/DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    const em=block.match(/DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)/);
    if(!sm) return;
    events.push({start:parseICSDate(sm[1],sm[2]==='Z'),end:em?parseICSDate(em[1],em[2]==='Z'):null});
  });
  return events;
}
function parseICSDate(str,isUTC){
  const y=+str.substr(0,4),mo=+str.substr(4,2)-1,d=+str.substr(6,2),h=+str.substr(9,2),mi=+str.substr(11,2);
  if(isUTC){const u=new Date(Date.UTC(y,mo,d,h,mi));u.setHours(u.getHours()+2);return u;}
  return new Date(y,mo,d,h,mi);
}
function getBookedHoursForDate(events,dateStr){
  const[tY,tM,tD]=dateStr.split('-').map((v,i)=>i===1?+v-1:+v);
  const booked=[];
  events.forEach(ev=>{
    const s=ev.start,e=ev.end;
    if(s.getFullYear()!==tY||s.getMonth()!==tM||s.getDate()!==tD) return;
    const sh=s.getHours(),eh=e?e.getHours()+(e.getMinutes()>0?1:0):sh+1;
    for(let h=sh;h<eh;h++){const slot=String(h).padStart(2,'0')+':00';if(!booked.includes(slot))booked.push(slot);}
  });
  return booked;
}
window.loadICSCalendar=loadICSCalendar;
window.getBookedHoursForDate=getBookedHoursForDate;