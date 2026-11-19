// Карточка Telegram (tglock). Подключается в index.html отдельным <script>,
// чтобы не трогать renderer.js и проще подтягивать обновления апстрима.
(() => {
  if (!window.api || !window.api.tglockSet) return;

  const card = document.getElementById('tgCard');
  const box = document.getElementById('tgToggle');
  const txt = document.getElementById('tgStatus');
  const open = document.getElementById('tgOpenBtn');
  if (!card || !box || !txt || !open) return;

  const LABEL = {
    stopped: 'Выключено',
    starting: 'Запуск…',
    running: 'Работает',
    error: 'Ошибка',
  };
  let autoOpen = false; // открыть ссылку в Telegram один раз после включения

  function render(s) {
    card.classList.toggle('on', s.state === 'running');
    card.classList.toggle('err', s.state === 'error');
    box.checked = s.state === 'running' || s.state === 'starting';

    const msg = s.state === 'error' && s.error ? s.error : (LABEL[s.state] || s.state);
    txt.textContent = msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
    txt.title = msg;

    open.style.display = s.link ? 'inline-block' : 'none';

    if (s.link && autoOpen) {
      autoOpen = false;
      window.api.tglockOpenLink().catch(() => {});
    }
  }

  window.api.onTglockState(render);
  window.api.tglockStatus().then(render).catch(() => {});

  box.addEventListener('change', async () => {
    box.disabled = true;
    autoOpen = box.checked;
    try {
      render(await window.api.tglockSet(box.checked));
    } catch (e) {
      render({ state: 'error', error: e.message || String(e) });
    }
    box.disabled = false;
  });

  open.addEventListener('click', () => {
    window.api.tglockOpenLink().catch(() => {});
  });
})();
