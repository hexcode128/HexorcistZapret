// Размер окна HexorcistZapret. Вызывать до создания окна (в самом начале main.js).
const { app } = require('electron');

function applyWindowLayout({ width = 940, height = 640 } = {}) {
  app.on('browser-window-created', (_event, win) => {
    win.setResizable(true);
    win.setMaximumSize(0, 0); // 0 = без ограничения
    win.setMinimumSize(820, 560);
    win.setSize(width, height);
    win.center();
  });
}

module.exports = { applyWindowLayout };
