// المزامنة مع Supabase عن طريق REST مباشرة (من غير مكتبات)
//
// كل صف محلي (محفظة، حساب، بند، عملية) بيتخزن في جدول records كـ JSON.
// - الرفع: أي صف updatedAt بتاعه أحدث من آخر رفع بيترفع (upsert).
// - التنزيل: أي صف server_updated_at بتاعه أحدث من آخر تنزيل بيتنزل،
//   وبيتكتب محلياً بس لو أحدث من النسخة المحلية (آخر تعديل يكسب).
import { db, getMeta, setMeta } from './db.js';

const TABLES = ['wallets', 'accounts', 'categories', 'transactions'];
const PAGE = 1000;

let running = null;
let timer = null;
let statusListeners = new Set();
let status = { state: 'idle', at: null, error: null };

export function onSyncStatus(fn) { statusListeners.add(fn); fn(status); }
function setStatus(s) { status = { ...status, ...s }; statusListeners.forEach((fn) => fn(status)); }
export const getSyncStatus = () => status;

export async function getConfig() {
  return { url: await getMeta('supaUrl', ''), key: await getMeta('supaKey', ''), session: await getMeta('supaSession', null) };
}
export async function isSignedIn() {
  const c = await getConfig();
  return !!(c.url && c.key && c.session);
}

function cleanUrl(u) { return String(u || '').trim().replace(/\/+$/, ''); }

async function authRequest(path, body) {
  const { url, key } = await getConfig();
  const res = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `HTTP ${res.status}`);
  return data;
}

export async function storeSession(d) {
  if (!d.access_token) throw new Error('confirm_email');
  await setMeta('supaSession', {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    email: d.user?.email,
    userId: d.user?.id,
  });
}

export async function saveConfig(url, key) {
  await setMeta('supaUrl', cleanUrl(url));
  await setMeta('supaKey', String(key || '').trim());
}

export async function signUp(email, password) {
  const d = await authRequest('signup', { email, password });
  await storeSession(d);
  await afterSignIn();
}

export async function signIn(email, password) {
  const d = await authRequest('token?grant_type=password', { email, password });
  await storeSession(d);
  await afterSignIn();
}

export async function signOut() {
  await setMeta('supaSession', null);
  await setMeta('syncLastPull', null);
  await setMeta('syncLastPush', null);
  setStatus({ state: 'idle', error: null });
}

async function token() {
  const c = await getConfig();
  if (!c.session) throw new Error('signed_out');
  if (Date.now() > c.session.expires_at - 60_000) {
    const d = await authRequest('token?grant_type=refresh_token', { refresh_token: c.session.refresh_token });
    await storeSession({ ...d, user: d.user || { email: c.session.email, id: c.session.userId } });
    return d.access_token;
  }
  return c.session.access_token;
}

async function rest(path, { method = 'GET', body, headers = {} } = {}) {
  const { url, key } = await getConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || `HTTP ${res.status}`);
  }
  return res;
}

// أول دخول على جهاز: لو السحابة فيها بيانات والجهاز ده جديد، نمسح البيانات المبدئية وننزّل بياناتك
// mode: 'auto' | 'replace' (امسح بيانات الجهاز وخد بيانات السحابة) | 'merge' (ادمجهم)
export async function afterSignIn(mode = 'auto') {
  const res = await rest('records?select=id&limit=1');
  const remoteHas = (await res.json()).length > 0;
  const localTx = (await db.transactions.toArray()).filter((r) => !r.deletedAt).length;
  if (mode === 'auto' && remoteHas && localTx > 0) throw new Error('needs_choice');
  if (remoteHas && (mode === 'replace' || localTx === 0)) {
    await db.transaction('rw', db.wallets, db.accounts, db.categories, db.transactions, async () => {
      for (const t of TABLES) await db[t].clear();
    });
    await setMeta('syncLastPush', new Date().toISOString());
  } else {
    await setMeta('syncLastPush', null); // يرفع كل حاجة
  }
  await setMeta('syncLastPull', null);
  await setMeta('firstRun', false);
  await syncNow();
}

async function pull() {
  let since = await getMeta('syncLastPull', null);
  let applied = 0;
  for (;;) {
    const q = `records?select=id,tbl,data,server_updated_at&order=server_updated_at.asc&limit=${PAGE}` + (since ? `&server_updated_at=gt.${encodeURIComponent(since)}` : '');
    const rows = await (await rest(q)).json();
    if (!rows.length) break;
    await db.transaction('rw', db.wallets, db.accounts, db.categories, db.transactions, async () => {
      for (const r of rows) {
        if (!TABLES.includes(r.tbl)) continue;
        const local = await db[r.tbl].get(r.id);
        if (!local || (r.data.updatedAt || '') > (local.updatedAt || '')) {
          await db[r.tbl].put(r.data);
          applied++;
        }
      }
    });
    since = rows[rows.length - 1].server_updated_at;
    await setMeta('syncLastPull', since);
    if (rows.length < PAGE) break;
  }
  return applied;
}

async function push() {
  const last = await getMeta('syncLastPush', null);
  const started = new Date().toISOString();
  const rows = [];
  for (const t of TABLES) {
    for (const r of await db[t].toArray()) {
      if (!last || (r.updatedAt || '') >= last) rows.push({ id: r.id, tbl: t, data: r, updated_at: r.updatedAt || started });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    await rest('records?on_conflict=id', { method: 'POST', body: rows.slice(i, i + 500), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  }
  await setMeta('syncLastPush', started);
  return rows.length;
}

// onApplied: بتتنده لو نزلت بيانات جديدة عشان الشاشة تتحدث
let onApplied = null;
export function setOnApplied(fn) { onApplied = fn; }

export async function syncNow() {
  if (running) return running;
  running = (async () => {
    try {
      if (!(await isSignedIn())) { setStatus({ state: 'off' }); return; }
      if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
      setStatus({ state: 'syncing', error: null });
      const applied = await pull();
      await push();
      setStatus({ state: 'ok', at: new Date().toISOString(), error: null });
      if (applied && onApplied) await onApplied();
    } catch (e) {
      setStatus({ state: 'error', error: String(e.message || e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

// مزامنة بعد أي تعديل بثانيتين، وكل دقيقة، ولما النت يرجع أو التطبيق يتفتح
export function scheduleSync(delay = 2000) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export function startAutoSync() {
  window.addEventListener('online', () => scheduleSync(500));
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(300); });
  setInterval(syncNow, 60_000);
  scheduleSync(500);
}
