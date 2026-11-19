// Тумблер Telegram (tglock). Подключается отдельным <script> в index.html.
(() => {
  const card = document.getElementById('tgCard');
  const box = document.getElementById('tgToggle');
  const txt = document.getElementById('tgStatus');
  const open = document.getElementById('tgOpenBtn');
  if (!card || !box || !txt || !open) {
    console.error('[tglock-ui] в index.html нет карточки Telegram (tgCard, tgToggle, tgStatus, tgOpenBtn)');
    return;
  }

  const fail = (msg) => {
    card.classList.remove('on');
    card.classList.add('err');
    txt.textContent = msg;
    txt.title = msg;
    console.error('[tglock-ui]', msg);
  };

  if (!window.api || typeof window.api.tglockSet !== 'function') {
    box.disabled = true;
    fail('Нет связи с модулем: добавь tglock* в preload.js и перезапусти приложение');
    return;
  }

  const LABEL = { stopped: 'Выключено', starting: 'Запуск…', running: 'Работает', error: 'Ошибка' };
  let autoOpen = false;

  function render(s) {
    card.classList.toggle('on', s.state === 'running');
    card.classList.toggle('busy', s.state === 'starting');
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
  window.api.tglockStatus().then(render).catch((e) => {
    const m = String((e && e.message) || e);
    fail(m.includes('No handler registered')
      ? 'В main.js не вызван setupTglock()'
      : m);
  });

  box.addEventListener('change', async () => {
    box.disabled = true;
    autoOpen = box.checked;
    try {
      render(await window.api.tglockSet(box.checked));
    } catch (e) {
      const m = String((e && e.message) || e);
      box.checked = false;
      fail(m.includes('No handler registered') ? 'В main.js не вызван setupTglock()' : m);
    }
    box.disabled = false;
  });

  open.addEventListener('click', () => window.api.tglockOpenLink().catch(() => {}));
})();
