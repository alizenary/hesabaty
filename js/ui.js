// عناصر واجهة عامة: الشيت السفلي، رسائل التأكيد، والتنبيهات
import { t, esc } from './util.js';

let sheetStack = [];

// يفتح شيت من تحت. render(el, close) بيرسم المحتوى.
export function openSheet(render, { tall = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${tall ? 'tall' : ''}" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="sheet-body"></div></div>`;
  document.body.appendChild(wrap);
  const body = wrap.querySelector('.sheet-body');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    sheetStack = sheetStack.filter((s) => s !== close);
    setTimeout(() => wrap.remove(), 200);
  };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', close);
  sheetStack.push(close);
  render(body, close);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

export function closeTopSheet() {
  const c = sheetStack[sheetStack.length - 1];
  if (c) { c(); return true; }
  return false;
}

export function confirmBox(message, { danger = false, okText } = {}) {
  return new Promise((resolve) => {
    openSheet((el, close) => {
      el.innerHTML = `
        <p class="confirm-msg">${esc(message)}</p>
        <div class="row gap">
          <button class="btn ${danger ? 'danger' : 'primary'} grow" data-ok>${esc(okText || t('confirm'))}</button>
          <button class="btn ghost grow" data-cancel>${t('cancel')}</button>
        </div>`;
      el.querySelector('[data-ok]').onclick = () => { close(); resolve(true); };
      el.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
    });
  });
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

export function icon(name) {
  const p = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    chev: '<path d="M9 18l6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
    excel: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13l4 5M13 13l-4 5"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    warn: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-7 0-11-7-11-7a19 19 0 0 1 5.1-5.9M9.9 4.2A10 10 0 0 1 12 4c7 0 11 7 11 7a19 19 0 0 1-2.2 3.2M1 1l22 22"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10.5a4.3 4.3 0 0 1-1.5 8.5z"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  }[name] || '';
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
