// نقطة البداية: الراوتر، شريط التنقل، القفل، والـ Service Worker
import { seedIfEmpty, getMeta, normalizeTwoLevels } from './db.js';
import { onChange, changed } from './store.js';
import { startAutoSync, scheduleSync, setOnApplied, onSyncStatus } from './sync.js';
import { homeView, txListView, walletView, accountsView, settingsView, categoriesView, reportsView } from './views.js';
import { openTxForm } from './txform.js';
import { icon } from './ui.js';
import { t, setLang, sha256 } from './util.js';

const app = document.getElementById('app');
const view = document.createElement('main');
const nav = document.createElement('nav');
nav.className = 'bottom-nav';
app.append(view, nav);

function drawNav(route) {
  const item = (href, ic, label, key) => `<a href="${href}" class="${route === key ? 'on' : ''}">${icon(ic)}<span>${label}</span></a>`;
  nav.innerHTML = `
    ${item('#/', 'home', t('home'), 'home')}
    ${item('#/tx', 'list', t('transactions'), 'tx')}
    <button class="fab" id="fab" aria-label="${t('add')}">${icon('plus')}</button>
    ${item('#/reports', 'chart', t('reports'), 'reports')}
    ${item('#/settings', 'gear', t('settings'), 'settings')}`;
  nav.querySelector('#fab').onclick = () => openTxForm();
}

async function render() {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  const key = parts[0] || 'home';
  drawNav(key === 'wallet' ? 'home' : key === 'cats' || key === 'accounts' ? 'settings' : key);
  const scroll = view.dataset.route === location.hash ? window.scrollY : 0;
  view.dataset.route = location.hash;
  if (key === 'home') await homeView(view);
  else if (key === 'tx') await txListView(view, params);
  else if (key === 'wallet') await walletView(view, parts[1]);
  else if (key === 'accounts') await accountsView(view);
  else if (key === 'reports') await reportsView(view);
  else if (key === 'settings') await settingsView(view);
  else if (key === 'cats') await categoriesView(view, parts[1]);
  else location.hash = '#/';
  window.scrollTo(0, scroll);
}

// ---------- القفل بالرقم السري ----------
let hiddenAt = 0;
async function lockIfNeeded() {
  const hash = await getMeta('pinHash');
  if (!hash || document.querySelector('.lock')) return;
  const salt = await getMeta('pinSalt', '');
  const el = document.createElement('div');
  el.className = 'lock';
  let pin = '';
  const draw = (err = false) => {
    el.innerHTML = `
      <div class="lock-box">
        ${icon('lock')}
        <h2>${t('enterPin')}</h2>
        <div class="pin-dots ${err ? 'shake' : ''}">${[0, 1, 2, 3].map((i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join('')}${pin.length > 4 ? `<span class="on"></span>`.repeat(pin.length - 4) : ''}</div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => `<button ${k === '' ? 'disabled' : ''} data-k="${k}">${k}</button>`).join('')}</div>
        <button class="btn primary" data-ok>${t('unlock')}</button>
      </div>`;
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      const k = b.dataset.k;
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 8) pin += k;
      draw(); if (pin.length >= 4) tryUnlock(true);
    });
    el.querySelector('[data-ok]').onclick = () => tryUnlock(false);
  };
  const tryUnlock = async (silent) => {
    if ((await sha256(salt + pin)) === hash) { el.remove(); return; }
    if (!silent || pin.length >= 8) { pin = ''; draw(true); }
  };
  draw();
  document.body.appendChild(el);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 60_000) lockIfNeeded();
});

// ---------- البداية ----------
async function start() {
  await seedIfEmpty();
  await normalizeTwoLevels();
  setLang(await getMeta('lang', 'ar'));
  try { await navigator.storage?.persist?.(); } catch { /* اختياري */ }
  await lockIfNeeded();
  onChange(async ({ local }) => { await render(); if (local) scheduleSync(); });
  setOnApplied(() => changed({ local: false }));
  window.addEventListener('hashchange', render);
  await render();
  startAutoSync();
  onSyncStatus((st) => { document.documentElement.dataset.sync = st.state; const d = document.querySelector('.sync-dot'); if (d) d.dataset.state = st.state; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start().catch((e) => {
  console.error(e);
  app.innerHTML = `<p style="padding:24px">Error: ${String(e?.message || e)}</p>`;
});
