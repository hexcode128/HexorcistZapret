'use strict';
/**
 * tglock-manager.js — запуск и остановка tglock-cli из Electron (main process).
 *
 * Бинарник лежит в:
 *   dev:      <корень проекта>/tglock-bin/tglock-cli.exe
 *   сборка:   <resources>/tglock-bin/tglock-cli.exe   (через extraResources в electron-builder)
 *
 * Использование в main-файле:
 *   const { setupTglock } = require('./tglock-manager');
 *   app.whenReady().then(() => { setupTglock(); });
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { app, shell, ipcMain, BrowserWindow } = require('electron');

const EXE = process.platform === 'win32' ? 'tglock-cli.exe' : 'tglock-cli';
const LINK_RE = /tg:\/\/proxy\?[^\s"'<>]+/i;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
const MAX_LOGS = 200;

class TglockManager extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.port = 10800; // не 1080: на macOS этот порт занимает tpws из UnblockPro
    this.lan = false; // true => --lan (слушать 0.0.0.0, только адреса Telegram)
    this.worker = null; // необязательный резервный Cloudflare Worker
    this.configure(opts);

    this.child = null;
    this.state = 'stopped'; // stopped | starting | running | error
    this.link = null;
    this.lastError = null;
    this.logs = [];
    this._stopping = false;
    this._readyTimer = null;
  }

  /** Меняет настройки (применяются при следующем запуске). */
  configure({ port, lan, worker } = {}) {
    if (port !== undefined) {
      const p = Number(port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        throw new Error('Порт должен быть целым числом от 1 до 65535');
      }
      this.port = p;
    }
    if (lan !== undefined) this.lan = Boolean(lan);
    if (worker !== undefined) {
      if (worker === null || worker === '') {
        this.worker = null;
      } else if (typeof worker === 'string' && HOST_RE.test(worker)) {
        this.worker = worker;
      } else {
        throw new Error('Некорректное имя хоста для Worker');
      }
    }
  }

  get binPath() {
    // Отдельная папка, не bin/: runtime-integrity.js следит за bin/ и может счесть чужой файл подменой.
    const dir = app.isPackaged
      ? path.join(process.resourcesPath, 'tglock-bin')
      : path.join(app.getAppPath(), 'tglock-bin');
    return path.join(dir, EXE);
  }

  get secretFile() {
    // Секрет закреплён, чтобы ссылка tg://proxy не менялась между запусками.
    return path.join(app.getPath('userData'), 'tglock-secret');
  }

  snapshot() {
    return {
      state: this.state,
      link: this.link,
      port: this.port,
      lan: this.lan,
      worker: this.worker,
      error: this.lastError,
      logs: this.logs.slice(-50),
    };
  }

  start() {
    if (this.child) return this.snapshot();

    if (!fs.existsSync(this.binPath)) {
      this.lastError = `Не найден ${EXE}. Положи его сюда: ${this.binPath}`;
      this._setState('error');
      return this.snapshot();
    }

    const args = ['--port', String(this.port), '--secret-file', this.secretFile];
    if (this.lan) args.push('--lan');
    if (this.worker) args.push('--worker', this.worker);

    this.lastError = null;
    this.link = null;
    this.logs = [];
    this._stopping = false;
    this._setState('starting');

    // spawn с массивом аргументов, без shell: инъекций через настройки нет.
    const child = spawn(this.binPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    this._pipe(child.stdout);
    this._pipe(child.stderr);

    child.on('error', (err) => {
      this.child = null;
      this.lastError = `Не удалось запустить tglock-cli: ${err.message}`;
      this._setState('error');
    });

    child.on('exit', (code, signal) => {
      clearTimeout(this._readyTimer);
      const wasStopping = this._stopping;
      this.child = null;
      this._stopping = false;
      this.link = null;
      if (wasStopping || code === 0) {
        this._setState('stopped');
      } else {
        const tail = this.logs.slice(-3).join(' | ');
        this.lastError = `tglock-cli завершился (${code ?? signal}). ${tail}`;
        this._setState('error');
      }
      this.emit('exit');
    });

    // Если ссылку не напечатал, но процесс жив — считаем, что запустился.
    this._readyTimer = setTimeout(() => {
      if (this.child && this.state === 'starting') this._setState('running');
    }, 2500);

    return this.snapshot();
  }

  stop() {
    if (!this.child) return Promise.resolve();
    return new Promise((resolve) => {
      this._stopping = true;
      this.once('exit', resolve);
      this.child.kill();
      setTimeout(() => {
        if (this.child) this.child.kill('SIGKILL');
      }, 3000).unref();
    });
  }

  openLink() {
    if (this.link) return shell.openExternal(this.link);
    return Promise.resolve();
  }

  _pipe(stream) {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        this._onLine(buf.slice(0, i).replace(/\r$/, ''));
        buf = buf.slice(i + 1);
      }
    });
  }

  _onLine(raw) {
    const line = raw.replace(ANSI_RE, '').trim();
    if (!line) return;
    this.logs.push(line);
    if (this.logs.length > MAX_LOGS) this.logs.shift();

    const m = line.match(LINK_RE);
    if (m && !this.link) {
      this.link = m[0];
      this._setState('running');
    } else {
      this.emit('state', this.snapshot());
    }
  }

  _setState(state) {
    this.state = state;
    this.emit('state', this.snapshot());
  }
}

/**
 * Создаёт менеджер и регистрирует IPC-каналы:
 *   tglock:status      -> snapshot
 *   tglock:set(bool)   -> включить/выключить, вернёт snapshot
 *   tglock:configure   -> {port, lan, worker}, применится при следующем запуске
 *   tglock:open-link   -> открыть ссылку в Telegram
 *   tglock:state (событие в окна) -> snapshot при каждом изменении
 */
function setupTglock(options = {}) {
  const manager = new TglockManager(options);

  manager.on('state', (snap) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('tglock:state', snap);
    }
  });

  ipcMain.handle('tglock:status', () => manager.snapshot());

  ipcMain.handle('tglock:set', async (_e, enabled) => {
    if (enabled) manager.start();
    else await manager.stop();
    return manager.snapshot();
  });

  ipcMain.handle('tglock:configure', (_e, cfg) => {
    if (manager.child) throw new Error('Сначала выключи Telegram-обход');
    manager.configure(cfg && typeof cfg === 'object' ? cfg : {});
    return manager.snapshot();
  });

  ipcMain.handle('tglock:open-link', () => manager.openLink());

  // will-quit, а не before-quit: main.js отменяет before-quit ради своей очистки.
  const killChild = () => { if (manager.child) manager.child.kill(); };
  app.on('will-quit', killChild);
  process.on('exit', killChild);

  return manager;
}

module.exports = { TglockManager, setupTglock };
