// HexorcistZapret: звёздное небо + тумблер zapret, зеркалящий старую кнопку «Подключить».
(() => {
  // ---------- звёздное небо ----------
  const cv = document.createElement('canvas');
  cv.id = 'hxStars';
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, stars = [], shoot = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((w * h) / 6500);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.1 + 0.25,
      a: Math.random() * Math.PI * 2,
      s: Math.random() * 0.02 + 0.006,
      v: Math.random() * 0.05 + 0.008,
      tint: Math.random() < 0.18,
    }));
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      if (!reduce) {
        s.a += s.s; s.y -= s.v;
        if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w; }
      }
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(s.a));
      ctx.fillStyle = s.tint ? '#8f7bff' : '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduce) {
      if (!shoot && Math.random() < 0.003) shoot = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.35, t: 0 };
      if (shoot) {
        const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - 80, shoot.y - 34);
        g.addColorStop(0, 'rgba(200,188,255,.95)'); g.addColorStop(1, 'rgba(200,188,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - 80, shoot.y - 34); ctx.stroke();
        shoot.x += 10; shoot.y += 4.2; shoot.t++;
        if (shoot.t > 45 || shoot.x > w + 90) shoot = null;
      }
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  // ---------- тумблер zapret (зеркалит старую кнопку) ----------
  const btn = document.getElementById('connectBtn');
  const box = document.getElementById('zapretToggle');
  const card = document.getElementById('zapretCard');
  const out = document.getElementById('zapretStatus');
  const st = document.getElementById('statusText');
  const strat = document.getElementById('strategyText');
  if (!btn || !box || !card || !out || !st) {
    console.error('[hexorcist-ui] не найдены элементы карточки zapret в index.html');
    return;
  }

  const sync = () => {
    const c = btn.classList;
    const on = c.contains('connected');
    const busy = c.contains('connecting') || c.contains('downloading');
    box.checked = on || busy;
    card.classList.toggle('on', on);
    card.classList.toggle('busy', busy);
    card.classList.toggle('err', st.classList.contains('error-text'));
    const extra = strat ? strat.textContent.trim() : '';
    out.textContent = st.textContent.trim() + (extra ? ' · ' + extra : '');
  };

  const mo = new MutationObserver(sync);
  mo.observe(btn, { attributes: true, attributeFilter: ['class'] });
  mo.observe(st, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  if (strat) mo.observe(strat, { childList: true, characterData: true, subtree: true });

  box.addEventListener('change', () => { btn.click(); setTimeout(sync, 80); });
  sync();
})();
