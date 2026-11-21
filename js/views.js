// الشاشات
import { getIndex, changed } from './store.js';
import { summary, walletFlow, statement, catPath, txCurrency, CURRENCIES, byDateDesc } from './calc.js';
import { save, softDelete, getMeta, setMeta, createCustody, uid } from './db.js';
import { openTxForm } from './txform.js';
import { catIcon, ICON_CHOICES } from './icons.js';
import { newFilter, matches, pillsHtml, bindPills } from './filters.js';
import { openSheet, confirmBox, toast, icon } from './ui.js';
import { exportStatement, exportBackup, importBackup } from './export.js';
import { getConfig, saveConfig, signIn, signUp, signOut, syncNow, afterSignIn, getSyncStatus, onSyncStatus } from './sync.js';
import {
  t, esc, money, fmtDate, fmtTime, dayKey, toMinor, fromMinor, startOfDay, addDays, startOfMonth,
  catName, accName, walletName, state, setLang, sha256,
} from './util.js';

const COLORS = ['#7b2cbf', '#c2410c', '#1d4ed8', '#be185d', '#a16207', '#047857', '#0e7490', '#4b5563'];
// الدولار متشال من الواجهة دلوقتي (الكود بيدعمه لو رجعناه بعدين)
const hasUSD = () => false;

function curLines(bal, ix, cls = '') {
  const parts = [`<div class="amt ${cls} ${bal.EGP < 0 ? 'neg' : ''}">${money(bal.EGP, 'EGP')}</div>`];
  if (hasUSD(ix) && (bal.USD || cls === 'hero-amt')) parts.push(`<div class="amt-sub ${bal.USD < 0 ? 'neg' : ''}">${money(bal.USD, 'USD')}</div>`);
  return parts.join('');
}

export function txRow(ix, tx) {
  const cur = txCurrency(ix, tx);
  let title, sub, cls, amt;
  const wc = tx.type === 'transfer' ? 'var(--transfer)' : (ix.walletById.get(tx.walletId)?.color || '#888');
  if (tx.type === 'transfer') {
    title = `${accName(ix.accountById.get(tx.accountId))} ← ${accName(ix.accountById.get(tx.toAccountId))}`;
    if (state.lang === 'en') title = `${accName(ix.accountById.get(tx.accountId))} → ${accName(ix.accountById.get(tx.toAccountId))}`;
    sub = t('transfer');
    cls = 'transfer';
    amt = money(tx.amount, cur);
  } else {
    const cat = ix.catById.get(tx.categoryId);
    const w = ix.walletById.get(tx.walletId);
    title = catName(cat) || '—';
    sub = `<span class="tx-wallet">${esc(walletName(w))}</span> · ${esc(accName(ix.accountById.get(tx.accountId)))}`;
    cls = tx.type;
    amt = money(tx.type === 'income' ? tx.amount : -tx.amount, cur, { sign: true });
  }
  const note = tx.note ? `<div class="tx-note">${esc(tx.note)}</div>` : '';
  return `<button class="tx-row" data-tx="${tx.id}" style="--wc:${wc}">
    <span class="tx-ic ${cls}">${icon(tx.type === 'income' ? 'down' : tx.type === 'expense' ? 'up' : 'swap')}</span>
    <span class="tx-main"><span class="tx-title">${esc(title)}</span><span class="tx-sub">${sub} · ${fmtTime(tx.date)}</span>${note}</span>
    <span class="tx-amt ${cls}">${amt}</span>
  </button>`;
}

function bindTxRows(root, ix) {
  root.querySelectorAll('[data-tx]').forEach((b) => b.onclick = () => openTxForm({ tx: ix.transactions.find((x) => x.id === b.dataset.tx) }));
}

function header(title, back, extra = '') {
  return `<header class="top">${back ? `<a class="back" href="${back}" aria-label="${t('back')}">${icon('back')}</a>` : ''}<h1>${esc(title)}</h1>${extra}</header>`;
}
const syncDot = () => `<a class="sync-dot" href="#/settings" data-state="${getSyncStatus().state}" title="${t('sync')}">${icon('cloud')}</a>`;

// ---------------- الرئيسية ----------------
const homeFilter = newFilter();

function filterBar(ix) {
  return `<div class="section-head"><h2>${t('recent')}</h2></div>${pillsHtml(homeFilter, ['type', 'wallet', 'account', 'cat'], ix)}`;
}

export async function homeView(root) {
  const ix = await getIndex();
  const sm = summary(ix);
  const today = startOfDay();
  const custodies = ix.wallets.filter((w) => w.type === 'custody' && !w.archived);
  const firstRun = (await getMeta('firstRun', false)) && ix.transactions.length === 0;
  const recent = [...ix.transactions]
    .filter((tx) => matches(tx, homeFilter, ix))
    .sort(byDateDesc).slice(0, 8);
  // التنبيه بيظهر بس لو فيه فلوس عهدة فعلاً بتغطي العجز
  const borrowed = CURRENCIES.filter((c) => sm.mine[c] < 0 && sm.custodyTotal[c] > 0);
  const personal = ix.wallets.find((w) => w.type === 'personal');

  root.innerHTML = `
    ${header(t('appName'), null, syncDot())}
    <div class="page">
      ${firstRun ? `<div class="card hint"><strong>${t('startHere')}</strong><span>${t('startHereBody')}</span>
        <div class="row gap"><a class="btn small soft" href="#/accounts">${t('step1Accounts')}</a><a class="btn small soft" href="#/settings">${t('step2Custody')}</a></div></div>` : ''}
      <a class="card hero" href="#/tx?wallet=${personal?.id || ''}">
        <div class="label">${t('myMoney')}</div>
        ${curLines(sm.mine, ix, 'hero-amt')}
        ${borrowed.length ? `<div class="warn">${icon('warn')} ${borrowed.map((c) => t('borrowedFromCustody', { amt: money(Math.min(-sm.mine[c], sm.custodyTotal[c]), c) })).join(' · ')}</div>` : ''}
      </a>
      ${custodies.map((w) => {
        const b = sm.wBal.get(w.id);
        const f = walletFlow(ix, w.id, today, null);
        return `<a class="card custody" href="#/wallet/${w.id}" style="--c:${w.color}">
          <div class="row between"><div class="label">${esc(w.name)}</div><span class="muted small">${t('custody')}</span></div>
          ${curLines(b, ix)}
          <div class="mini-stats"><span>${t('todayIn')}: <b>${money(f.in.EGP)}</b></span><span>${t('todayOut')}: <b>${money(f.out.EGP + f.owner.EGP)}</b></span></div>
        </a>`;
      }).join('')}
      <a class="total-line" href="#/accounts"><span>${t('totalWithMe')} ›</span><span>${money(sm.total.EGP)}${hasUSD(ix) ? ` · ${money(sm.total.USD, 'USD')}` : ''}</span></a>
      ${filterBar(ix)}
      <div class="list">${recent.length ? recent.map((tx) => txRow(ix, tx)).join('') : `<p class="empty">${t('noTx')}</p>`}</div>
      <a class="see-all" href="#/tx">${t('seeAll')}</a>
    </div>`;
  bindPills(root, homeFilter, ix, () => homeView(root));
  bindTxRows(root, ix);
}

// ---------------- العمليات ----------------
const txFilter = { month: null, q: '', f: newFilter() };

export async function txListView(root, params) {
  const ix = await getIndex();
  if (params.get('wallet')) { txFilter.f.wallet = new Set([params.get('wallet')]); history.replaceState(null, '', '#/tx'); }
  const m = txFilter.month ? new Date(txFilter.month) : new Date(startOfMonth());
  const from = new Date(m.getFullYear(), m.getMonth(), 1).toISOString();
  const to = new Date(m.getFullYear(), m.getMonth() + 1, 1).toISOString();
  const q = txFilter.q.trim().toLowerCase();

  const list = ix.transactions.filter((tx) => {
    if (tx.date < from || tx.date >= to) return false;
    if (!matches(tx, txFilter.f, ix)) return false;
    if (q) {
      const hay = [tx.note, tx.place, catName(ix.catById.get(tx.categoryId)), accName(ix.accountById.get(tx.accountId))].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort(byDateDesc);

  const groups = new Map();
  for (const tx of list) { const k = dayKey(tx.date); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(tx); }
  let sumIn = 0, sumOut = 0;
  for (const tx of list) { if (txCurrency(ix, tx) !== 'EGP') continue; if (tx.type === 'income') sumIn += tx.amount; else if (tx.type === 'expense') sumOut += tx.amount; }

  root.innerHTML = `
    ${header(t('transactions'))}
    <div class="page">
      <div class="month-nav">
        <button class="icon-btn" data-m="-1" aria-label="prev">${icon(state.lang === 'ar' ? 'chev' : 'back')}</button>
        <strong>${fmtDate(from, { month: 'long', year: 'numeric' })}</strong>
        <button class="icon-btn" data-m="1" aria-label="next">${icon(state.lang === 'ar' ? 'back' : 'chev')}</button>
      </div>
      ${pillsHtml(txFilter.f, ['type', 'wallet', 'account', 'cat'], ix)}
      <label class="search">${icon('search')}<input id="q" value="${esc(txFilter.q)}" placeholder="${t('search')}"></label>
      <div class="sum-line"><span class="income">${t('income')}: ${money(sumIn)}</span><span class="expense">${t('expense')}: ${money(sumOut)}</span></div>
      <div id="txs">${list.length ? [...groups.entries()].map(([k, txs]) => `<div class="day-head">${fmtDate(txs[0].date, { weekday: 'long', day: 'numeric', month: 'long' })}</div><div class="list">${txs.map((tx) => txRow(ix, tx)).join('')}</div>`).join('') : `<p class="empty">${t('noTx')}</p>`}</div>
    </div>`;

  root.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    txFilter.month = new Date(m.getFullYear(), m.getMonth() + Number(b.dataset.m), 1).toISOString();
    txListView(root, new URLSearchParams());
  });
  bindPills(root, txFilter.f, ix, () => txListView(root, new URLSearchParams()));
  const qi = root.querySelector('#q');
  let timer;
  qi.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { txFilter.q = qi.value; txListView(root, new URLSearchParams()).then(() => { const n = root.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
  bindTxRows(root, ix);
}

// ---------------- تفاصيل العهدة ----------------
const stState = { period: 'month', currency: 'EGP', from: null, to: null };

function periodRange(p) {
  const now = new Date();
  if (p === 'today') return [startOfDay(), null];
  if (p === 'month') return [startOfMonth(), null];
  if (p === 'lastMonth') return [new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), startOfMonth()];
  if (p === 'custom') return [stState.from, stState.to];
  return [null, null];
}

export async function walletView(root, id) {
  const ix = await getIndex();
  const w = ix.walletById.get(id);
  if (!w) { location.hash = '#/'; return; }
  const sm = summary(ix);
  const bal = sm.wBal.get(id);
  const today = walletFlow(ix, id, startOfDay(), null);
  const month = walletFlow(ix, id, startOfMonth(), null);
  const [from, to] = periodRange(stState.period);
  const cur = hasUSD(ix) ? stState.currency : 'EGP';
  const st = statement(ix, id, cur, from, to);
  const ownerCat = ix.categories.find((c) => c.walletId === id && c.system === 'owner_transfer');

  root.innerHTML = `
    ${header(w.name, '#/')}
    <div class="page">
      <div class="card custody big" style="--c:${w.color}">
        <div class="label">${t('custodyBalance')}</div>
        ${curLines(bal, ix, 'hero-amt')}
      </div>
      <div class="stat-grid">
        <div class="stat"><span>${t('todayIn')}</span><b class="income">${money(today.in.EGP)}</b></div>
        <div class="stat"><span>${t('todayOut')}</span><b class="expense">${money(today.out.EGP)}</b></div>
        <div class="stat"><span>${t('todayOwner')}</span><b>${money(today.owner.EGP)}</b></div>
        <div class="stat"><span>${t('monthIn')}</span><b class="income">${money(month.in.EGP)}</b></div>
        <div class="stat"><span>${t('monthOut')}</span><b class="expense">${money(month.out.EGP)}</b></div>
        <div class="stat"><span>${t('monthOwner')}</span><b>${money(month.owner.EGP)}</b></div>
      </div>
      <div class="row gap wrap">
        <button class="btn soft grow" data-add="income">${icon('down')} ${t('addIncome')}</button>
        <button class="btn soft grow" data-add="expense">${icon('up')} ${t('addExpense')}</button>
        ${ownerCat ? `<button class="btn primary grow" data-owner>${icon('send')} ${t('ownerTransfer')}</button>` : ''}
      </div>

      <div class="section-head"><h2>${t('statement')}</h2>
        <button class="btn small soft" id="xls">${icon('excel')} Excel</button></div>
      <div class="chips scroll">
        ${['today', 'month', 'lastMonth', 'all', 'custom'].map((p) => `<button class="chip small ${stState.period === p ? 'on' : ''}" data-p="${p}">${t('p_' + p)}</button>`).join('')}
      </div>
      ${stState.period === 'custom' ? `<div class="row gap"><label class="field grow"><span>${t('from')}</span><input type="date" id="from" value="${stState.from ? stState.from.slice(0, 10) : ''}"></label><label class="field grow"><span>${t('to')}</span><input type="date" id="to" value="${stState.to ? addDays(stState.to, -1).slice(0, 10) : ''}"></label></div>` : ''}
      ${hasUSD(ix) ? `<div class="chips">${CURRENCIES.map((c) => `<button class="chip small ${cur === c ? 'on' : ''}" data-cur="${c}">${c}</button>`).join('')}</div>` : ''}
      <div class="stmt">
        <div class="stmt-row head"><span>${t('openingBalance')}</span><span></span><b>${money(st.opening, cur)}</b></div>
        ${st.rows.slice().reverse().map((r) => {
          const path = catPath(ix, r.tx.categoryId);
          return `<button class="stmt-row" data-tx="${r.tx.id}">
            <span><span class="stmt-cat">${esc(catName(path[path.length - 1]))}</span><span class="tx-sub">${fmtDate(r.tx.date, { day: 'numeric', month: 'short' })} ${fmtTime(r.tx.date)}${r.tx.note ? ' · ' + esc(r.tx.note) : ''}</span></span>
            <span class="${r.signed > 0 ? 'income' : 'expense'}">${money(r.signed, cur, { sign: true })}</span>
            <b>${money(r.balance, cur)}</b></button>`;
        }).join('') || `<p class="empty">${t('noTx')}</p>`}
        <div class="stmt-row head"><span>${t('totals')}</span><span><span class="income">${money(st.totalIn, cur, { sign: true })}</span> / <span class="expense">${money(-st.totalOut, cur)}</span></span><b>${money(st.closing, cur)}</b></div>
      </div>
    </div>`;

  root.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => openTxForm({ preset: { type: b.dataset.add, walletId: id } }));
  const ob = root.querySelector('[data-owner]');
  if (ob) ob.onclick = () => openTxForm({ preset: { type: 'expense', walletId: id, categoryId: ownerCat.id } });
  root.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { stState.period = b.dataset.p; walletView(root, id); });
  root.querySelectorAll('[data-cur]').forEach((b) => b.onclick = () => { stState.currency = b.dataset.cur; walletView(root, id); });
  const fi = root.querySelector('#from'), ti = root.querySelector('#to');
  if (fi) fi.onchange = () => { stState.from = fi.value ? new Date(fi.value + 'T00:00').toISOString() : null; walletView(root, id); };
  if (ti) ti.onchange = () => { stState.to = ti.value ? addDays(new Date(ti.value + 'T00:00').toISOString(), 1) : null; walletView(root, id); };
  root.querySelector('#xls').onclick = () => exportStatement(ix, id, cur, from, to);
  bindTxRows(root, ix);
}

// ---------------- الحسابات ----------------
const ACC_TYPES = ['cash', 'bank', 'ewallet', 'debit', 'credit'];

let accEdit = false;

export async function accountsView(root) {
  const ix = await getIndex();
  const sm = summary(ix);
  const active = ix.accounts.filter((a) => !a.archived);
  const archived = ix.accounts.filter((a) => a.archived);
  const custodies = ix.wallets.filter((w) => w.type === 'custody' && !w.archived);
  const row = (a) => {
    const b = sm.accBal.get(a.id) || 0;
    if (accEdit) {
      const list = ix.accounts;
      const i = list.indexOf(a);
      return `<div class="acc-row edit ${a.archived ? 'dim' : ''}">
        <button class="icon-btn eye" data-eye="${a.id}" title="${a.archived ? t('show') : t('hide')}">${icon(a.archived ? 'eyeOff' : 'eye')}</button>
        <span class="grow">${esc(accName(a))}</span>
        <button class="icon-btn" data-mv="${a.id}" data-dirn="-1" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-mv="${a.id}" data-dirn="1" ${i === list.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
      </div>`;
    }
    return `<button class="acc-row" data-acc="${a.id}"><span class="acc-type">${t('acc_' + a.type)}</span><span class="grow">${esc(accName(a))}</span><b class="${b < 0 ? 'neg' : ''}">${money(b, a.currency)}</b></button>`;
  };
  root.innerHTML = `
    ${header(t('accounts'), '#/settings')}
    <div class="page">
      <div class="card">
        <div class="label">${t('totalWithMe')}</div>
        ${curLines(sm.total, ix, 'hero-amt')}
      </div>
      <div class="row gap"><button class="btn soft grow" id="transfer">${icon('swap')} ${t('transferBetween')}</button><button class="btn soft grow" id="addAcc">${icon('plus')} ${t('addAccount')}</button></div>
      <div class="section-head"><h2>${t('accounts')}</h2><button class="btn small ${accEdit ? 'primary' : 'soft'}" id="accEdit">${accEdit ? t('done') : t('orderAndShow')}</button></div>
      ${accEdit ? `<p class="muted small">${t('orderHint')}</p><div class="list">${ix.accounts.map(row).join('')}</div>` : `<div class="list">${active.map(row).join('')}</div>`}
      ${archived.length && !accEdit ? `<div class="section-head"><h2>${t('hiddenAccounts')}</h2></div><div class="list dim">${archived.map(row).join('')}</div>` : ''}
    </div>`;
  root.querySelector('#transfer').onclick = () => openTxForm({ preset: { type: 'transfer' } });
  root.querySelector('#accEdit').onclick = () => { accEdit = !accEdit; accountsView(root); };
  root.querySelectorAll('[data-eye]').forEach((b) => b.onclick = async () => { const a = ix.accountById.get(b.dataset.eye); await save('accounts', { ...a, archived: !a.archived }); await changed(); });
  root.querySelectorAll('[data-mv]').forEach((b) => b.onclick = async () => {
    const list = [...ix.accounts];
    const i = list.findIndex((x) => x.id === b.dataset.mv), j = i + Number(b.dataset.dirn);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) await save('accounts', { ...list[k], order: k });
    await changed();
  });
  root.querySelector('#addAcc').onclick = () => accountSheet(ix, null);
  root.querySelectorAll('[data-acc]').forEach((b) => b.onclick = () => accountSheet(ix, ix.accountById.get(b.dataset.acc), sm.accBal.get(b.dataset.acc)));
  root.querySelectorAll('[data-wallet]').forEach((b) => b.onclick = () => walletSheet(ix, ix.walletById.get(b.dataset.wallet)));
}

function accountSheet(ix, acc, balance = 0) {
  const a = acc ? { ...acc } : { name: '', type: 'cash', currency: 'EGP', opening: 0 };
  const used = acc && ix.transactions.some((tx) => tx.accountId === acc.id || tx.toAccountId === acc.id);
  openSheet((el, close) => {
    el.innerHTML = `
      <h3>${acc ? t('editAccount') : t('addAccount')}</h3>
      <label class="field"><span>${t('name')}</span><input id="n" value="${esc(acc ? accName(acc) : '')}"></label>
      <div class="field-label">${t('type')}</div>
      <div class="chips">${ACC_TYPES.map((ty) => `<button class="chip ${a.type === ty ? 'on' : ''}" data-ty="${ty}">${t('acc_' + ty)}</button>`).join('')}</div>
      <label class="field"><span>${t('openingBalance')}</span><input id="op" inputmode="decimal" value="${fromMinor(a.opening)}"></label>
      <p class="muted small">${t('openingHint')}</p>
      ${acc ? `<div class="reconcile"><div class="field-label">${t('reconcile')}</div><p class="muted small">${t('reconcileHint', { amt: money(balance, a.currency) })}</p>
        <div class="row gap"><input id="actual" inputmode="decimal" class="grow" placeholder="${t('actualBalance')}"><button class="btn soft" id="rec">${t('apply')}</button></div></div>` : ''}
      <div class="sheet-actions">
        <button class="btn primary grow" id="sv">${t('save')}</button>
        ${acc ? `<button class="btn ghost" id="arch">${acc.archived ? t('unarchive') : t('archive')}</button>` : ''}
      </div>`;
    el.querySelectorAll('[data-ty]').forEach((b) => b.onclick = () => { a.type = b.dataset.ty; el.querySelectorAll('[data-ty]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelectorAll('[data-cur]').forEach((b) => b.onclick = () => { a.currency = b.dataset.cur; el.querySelectorAll('[data-cur]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelector('#sv').onclick = async () => {
      const name = el.querySelector('#n').value.trim();
      if (!name) return toast(t('errName'));
      const nameChanged = !acc || name !== accName(acc);
      await save('accounts', { ...a, name: nameChanged ? name : a.name, nameEn: nameChanged ? null : a.nameEn, opening: toMinor(el.querySelector('#op').value || 0), order: a.order ?? ix.accounts.length });
      await setMeta('firstRun', false);
      close(); toast(t('saved')); await changed();
    };
    const arch = el.querySelector('#arch');
    if (arch) arch.onclick = async () => { await save('accounts', { ...acc, archived: !acc.archived }); close(); await changed(); };
    const rec = el.querySelector('#rec');
    if (rec) rec.onclick = async () => {
      const actual = toMinor(el.querySelector('#actual').value);
      const diff = actual - balance;
      if (!el.querySelector('#actual').value || diff === 0) return toast(t('noDiff'));
      const personal = ix.wallets.find((w) => w.type === 'personal');
      const cat = ix.categories.find((c) => c.walletId === personal.id && c.system === (diff > 0 ? 'adjust_in' : 'adjust_out'));
      await save('transactions', { type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), accountId: acc.id, walletId: personal.id, categoryId: cat.id, date: new Date().toISOString(), note: t('reconcileNote'), place: '' });
      close(); toast(t('saved')); await changed();
    };
  });
}

function walletSheet(ix, w) {
  const isNew = !w;
  const s = w ? { ...w, opening: { EGP: 0, USD: 0, ...(w.opening || {}) } } : { name: '', color: COLORS[ix.wallets.length % COLORS.length], opening: { EGP: 0, USD: 0 } };
  const others = ix.wallets.filter((x) => x.type === 'custody');
  openSheet((el, close) => {
    el.innerHTML = `
      <h3>${isNew ? t('addCustody') : t('editCustody')}</h3>
      <label class="field"><span>${t('name')}</span><input id="n" value="${esc(s.name)}" placeholder="${t('custodyNamePh')}"></label>
      <div class="field-label">${t('color')}</div>
      <div class="chips">${COLORS.map((c) => `<button class="swatch ${s.color === c ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
      <p class="muted small">${t('custodyOpeningsHint')}</p>
      <label class="field"><span>${t('openingBalance')} (${t('egp')})</span><input id="oe" inputmode="decimal" value="${fromMinor(s.opening.EGP)}"></label>
      ${hasUSD(ix) ? `<label class="field"><span>${t('openingBalance')} ($)</span><input id="ou" inputmode="decimal" value="${fromMinor(s.opening.USD)}"></label>` : ''}
      ${isNew && others.length ? `<div class="field-label">${t('categoriesFrom')}</div><div class="chips"><button class="chip on" data-copy="">${t('defaultTree')}</button>${others.map((o) => `<button class="chip" data-copy="${o.id}">${esc(o.name)}</button>`).join('')}</div>` : ''}
      <div class="sheet-actions">
        <button class="btn primary grow" id="sv">${t('save')}</button>
        ${!isNew ? `<button class="btn ghost" id="arch">${w.archived ? t('unarchive') : t('archive')}</button>` : ''}
      </div>`;
    let copyFrom = '';
    el.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => { s.color = b.dataset.color; el.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { copyFrom = b.dataset.copy; el.querySelectorAll('[data-copy]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelector('#sv').onclick = async () => {
      const name = el.querySelector('#n').value.trim();
      if (!name) return toast(t('errName'));
      const opening = { EGP: toMinor(el.querySelector('#oe').value || 0), USD: el.querySelector('#ou') ? toMinor(el.querySelector('#ou').value || 0) : s.opening.USD };
      if (isNew) await createCustody({ name, color: s.color, openingEGP: opening.EGP, openingUSD: opening.USD, copyFromWalletId: copyFrom || null });
      else await save('wallets', { ...w, name, color: s.color, opening });
      await setMeta('firstRun', false);
      close(); toast(t('saved')); await changed();
    };
    const arch = el.querySelector('#arch');
    if (arch) arch.onclick = async () => { await save('wallets', { ...w, archived: !w.archived }); close(); await changed(); };
  });
}

// ---------------- الإعدادات ----------------
export async function settingsView(root) {
  const ix = await getIndex();
  const hasPin = !!(await getMeta('pinHash'));
  const cfg = await getConfig();
  const st = getSyncStatus();
  const stLine = st.state === 'ok' ? t('syncOk', { time: fmtTime(st.at) }) : st.state === 'syncing' ? t('syncing') : st.state === 'offline' ? t('syncOffline') : st.state === 'error' ? `${t('syncError')}: ${st.error}` : '';
  root.innerHTML = `
    ${header(t('settings'))}
    <div class="page">
      <div class="section-head"><h2>${icon('cloud')} ${t('sync')}</h2></div>
      ${cfg.session ? `<div class="card sync-card">
          <div class="row between"><span>${t('signedInAs')}</span><b dir="ltr">${esc(cfg.session.email || '')}</b></div>
          <div class="sync-status" data-state="${st.state}">${esc(stLine)}</div>
          <div class="row gap"><button class="btn soft grow" id="syncNow">${t('syncNow')}</button><button class="btn ghost" id="signOut">${t('signOut')}</button></div>
        </div>` : `<div class="card sync-card">
          <p class="muted small">${t('syncHint')}</p>
          <label class="field"><span>Supabase URL</span><input id="sUrl" dir="ltr" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co"></label>
          <label class="field"><span>Anon key</span><input id="sKey" dir="ltr" value="${esc(cfg.key)}" placeholder="eyJ..."></label>
          <label class="field"><span>${t('email')}</span><input id="sEmail" type="email" dir="ltr" autocomplete="username"></label>
          <label class="field"><span>${t('password')}</span><input id="sPass" type="password" dir="ltr" autocomplete="current-password"></label>
          <div class="row gap"><button class="btn primary grow" id="sIn">${t('signIn')}</button><button class="btn soft grow" id="sUp">${t('signUp')}</button></div>
        </div>`}

      <div class="section-head"><h2>${t('custodies')}</h2><button class="btn small soft" id="addW">${icon('plus')} ${t('addCustody')}</button></div>
      <div class="list">${ix.wallets.filter((w) => w.type === 'custody').map((w) => `
        <div class="set-row ${w.archived ? 'dim' : ''}"><span class="dot" style="--c:${w.color}"></span><span class="grow">${esc(w.name)}</span>
          <a class="btn small ghost" href="#/cats/${w.id}">${t('categories')}</a><button class="btn small ghost" data-editw="${w.id}">${icon('edit')}</button></div>`).join('')}</div>
      <div class="section-head"><h2>${t('personal')}</h2></div>
      <div class="list">${ix.wallets.filter((w) => w.type === 'personal').map((w) => `<a class="set-row" href="#/cats/${w.id}"><span class="dot" style="--c:${w.color}"></span><span class="grow">${t('personalCategories')}</span>${icon(state.lang === 'ar' ? 'back' : 'chev')}</a>`).join('')}
        <a class="set-row" href="#/accounts"><span class="grow">${t('accounts')}</span>${icon(state.lang === 'ar' ? 'back' : 'chev')}</a></div>

      <div class="section-head"><h2>${t('general')}</h2></div>
      <div class="list">
        <div class="set-row"><span class="grow">${t('language')}</span>
          <div class="seg small"><button class="seg-btn ${state.lang === 'ar' ? 'on' : ''}" data-lang="ar">عربي</button><button class="seg-btn ${state.lang === 'en' ? 'on' : ''}" data-lang="en">English</button></div></div>
        <div class="set-row"><span class="grow">${icon('lock')} ${t('pinLock')}</span><button class="btn small soft" id="pin">${hasPin ? t('change') : t('enable')}</button>${hasPin ? `<button class="btn small ghost" id="nopin">${t('disable')}</button>` : ''}</div>
      </div>

      <div class="section-head"><h2>${t('backup')}</h2></div>
      <p class="muted small">${t('backupHint')}</p>
      <div class="row gap"><button class="btn soft grow" id="bk">${t('exportBackup')}</button><label class="btn ghost grow">${t('importBackup')}<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      <p class="muted small center">${t('appName')} · v0.1</p>
    </div>`;
  root.querySelector('#addW').onclick = () => walletSheet(ix, null);
  bindSync(root);
  root.querySelectorAll('[data-editw]').forEach((b) => b.onclick = () => walletSheet(ix, ix.walletById.get(b.dataset.editw)));
  root.querySelectorAll('[data-lang]').forEach((b) => b.onclick = async () => { await setMeta('lang', b.dataset.lang); setLang(b.dataset.lang); await changed(); });
  root.querySelector('#pin').onclick = () => pinSetup();
  const np = root.querySelector('#nopin');
  if (np) np.onclick = async () => { if (await confirmBox(t('confirmDisablePin'))) { await setMeta('pinHash', null); await changed(); } };
  root.querySelector('#bk').onclick = async () => { await exportBackup(); await setMeta('lastBackup', new Date().toISOString()); };
  root.querySelector('#imp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!(await confirmBox(t('confirmImport'), { danger: true, okText: t('importBackup') }))) return;
    try { await importBackup(f); toast(t('imported')); await changed(); } catch { toast(t('badBackup')); }
  };
}

function pinSetup() {
  openSheet((el, close) => {
    el.innerHTML = `<h3>${t('setPin')}</h3>
      <label class="field"><span>${t('newPin')}</span><input id="p1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
      <label class="field"><span>${t('repeatPin')}</span><input id="p2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
      <div class="sheet-actions"><button class="btn primary grow" id="sv">${t('save')}</button></div>`;
    el.querySelector('#sv').onclick = async () => {
      const p1 = el.querySelector('#p1').value, p2 = el.querySelector('#p2').value;
      if (!/^\d{4,8}$/.test(p1)) return toast(t('errPin'));
      if (p1 !== p2) return toast(t('errPinMatch'));
      const salt = uid();
      await setMeta('pinSalt', salt);
      await setMeta('pinHash', await sha256(salt + p1));
      close(); toast(t('saved')); await changed();
    };
  });
}

// ---------------- البنود ----------------
const catTab = { kind: 'expense' };

export async function categoriesView(root, walletId) {
  const ix = await getIndex();
  const w = ix.walletById.get(walletId);
  if (!w) { location.hash = '#/settings'; return; }
  const cats = ix.categories.filter((c) => c.walletId === walletId && c.kind === catTab.kind);
  const children = (pid) => cats.filter((c) => (c.parentId || null) === pid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const renderNode = (c, depth) => `
    <div class="cat-row ${c.archived ? 'dim' : ''}" style="--d:${depth}">
      <span class="cat-row-ic">${catIcon(c)}</span><span class="grow">${esc(catName(c))}${c.system ? ` <span class="muted small">(${t('system')})</span>` : ''}</span>
      ${(() => { const sib = children(c.parentId || null); const i = sib.indexOf(c); return `<button class="mini-btn" data-cmv="${c.id}" data-dirn="-1" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="mini-btn" data-cmv="${c.id}" data-dirn="1" ${i === sib.length - 1 ? 'disabled' : ''}>${icon('down')}</button>`; })()}
      ${c.system ? '' : `${depth === 0 ? `<button class="btn small ghost" data-addc="${c.id}" title="${t('addSub')}">${icon('plus')}</button>` : ''}<button class="btn small ghost" data-editc="${c.id}">${icon('edit')}</button>`}
    </div>${children(c.id).map((ch) => renderNode(ch, depth + 1)).join('')}`;

  root.innerHTML = `
    ${header(`${t('categories')} · ${walletName(w)}`, '#/settings')}
    <div class="page">
      <div class="seg"><button class="seg-btn ${catTab.kind === 'expense' ? 'on expense' : ''}" data-k="expense">${t('expenseCats')}</button><button class="seg-btn ${catTab.kind === 'income' ? 'on income' : ''}" data-k="income">${t('incomeCats')}</button></div>
      <button class="btn soft" id="addTop">${icon('plus')} ${t('addCategory')}</button>
      <div class="cat-tree">${children(null).map((c) => renderNode(c, 0)).join('')}</div>
    </div>`;
  root.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { catTab.kind = b.dataset.k; categoriesView(root, walletId); });
  root.querySelector('#addTop').onclick = () => categorySheet(ix, { walletId, kind: catTab.kind, parentId: null });
  root.querySelectorAll('[data-addc]').forEach((b) => b.onclick = () => categorySheet(ix, { walletId, kind: catTab.kind, parentId: b.dataset.addc }));
  root.querySelectorAll('[data-editc]').forEach((b) => b.onclick = () => categorySheet(ix, ix.catById.get(b.dataset.editc)));
  root.querySelectorAll('[data-cmv]').forEach((b) => b.onclick = async () => {
    const c = ix.catById.get(b.dataset.cmv);
    const sib = children(c.parentId || null);
    const i = sib.indexOf(c), j = i + Number(b.dataset.dirn);
    if (j < 0 || j >= sib.length) return;
    [sib[i], sib[j]] = [sib[j], sib[i]];
    for (let k = 0; k < sib.length; k++) if (sib[k].order !== k) await save('categories', { ...sib[k], order: k });
    await changed();
  });
}

function categorySheet(ix, c) {
  const isNew = !c.id;
  const s = { ...c };
  // الأب الممكن: أي بند من نفس النوع في نفس المحفظة مش هو ولا من أبنائه
  const descendants = new Set();
  if (!isNew) {
    const walk = (id) => ix.categories.filter((x) => x.parentId === id).forEach((x) => { descendants.add(x.id); walk(x.id); });
    walk(c.id);
  }
  // مستويين بس: الأب لازم يكون بند رئيسي، والبند اللي تحته بنود مينفعش يبقى فرعي
  const hasChildren = !isNew && ix.categories.some((x) => x.parentId === c.id);
  const parents = hasChildren ? [] : ix.categories.filter((x) => x.walletId === c.walletId && x.kind === c.kind && !x.system && !x.parentId && x.id !== c.id && !descendants.has(x.id));
  const pathLabel = (x) => catPath(ix, x.id).map(catName).join(' › ');
  openSheet((el, close) => {
    el.innerHTML = `
      <h3>${isNew ? t('addCategory') : t('editCategory')}</h3>
      <label class="field"><span>${t('nameAr')}</span><input id="na" value="${esc(s.nameAr || '')}"></label>
      <label class="field"><span>${t('nameEn')}</span><input id="ne" value="${esc(s.nameEn || '')}" dir="ltr"></label>
      <div class="field-label">${t('icon')}</div>
      <div class="icon-pick">${ICON_CHOICES.map((ic) => `<button class="icon-opt ${ic === catIcon(s) ? 'on' : ''}" data-ic="${ic}">${ic}</button>`).join('')}</div>
      <label class="field"><span>${t('parent')}</span><select id="par" class="select"><option value="">${t('noParent')}</option>${parents.map((p) => `<option value="${p.id}" ${p.id === s.parentId ? 'selected' : ''}>${esc(pathLabel(p))}</option>`).join('')}</select></label>
      <div class="sheet-actions">
        <button class="btn primary grow" id="sv">${t('save')}</button>
        ${!isNew ? `<button class="btn ghost" id="arch">${c.archived ? t('unarchive') : t('archive')}</button><button class="btn ghost danger-text icon-btn" id="del">${icon('trash')}</button>` : ''}
      </div>`;
    el.querySelectorAll('[data-ic]').forEach((b) => b.onclick = () => { s.icon = b.dataset.ic; el.querySelectorAll('[data-ic]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelector('#sv').onclick = async () => {
      const nameAr = el.querySelector('#na').value.trim();
      const nameEn = el.querySelector('#ne').value.trim();
      if (!nameAr && !nameEn) return toast(t('errName'));
      const siblings = ix.categories.filter((x) => x.walletId === c.walletId && (x.parentId || null) === (el.querySelector('#par').value || null));
      await save('categories', { ...s, nameAr: nameAr || nameEn, nameEn: nameEn || null, parentId: el.querySelector('#par').value || null, order: s.order ?? siblings.length });
      close(); toast(t('saved')); await changed();
    };
    const arch = el.querySelector('#arch');
    if (arch) arch.onclick = async () => { await save('categories', { ...c, archived: !c.archived }); close(); await changed(); };
    const del = el.querySelector('#del');
    if (del) del.onclick = async () => {
      if (ix.categories.some((x) => x.parentId === c.id)) return toast(t('errHasChildren'));
      if (ix.transactions.some((tx) => tx.categoryId === c.id)) return toast(t('errCatUsed'));
      if (!(await confirmBox(t('confirmDeleteCat'), { danger: true, okText: t('delete') }))) return;
      await softDelete('categories', c.id); close(); await changed();
    };
  });
}

// ---------------- التقارير ----------------
const repState = { month: null, f: newFilter(), open: new Set() };

export async function reportsView(root) {
  const ix = await getIndex();
  const m = repState.month ? new Date(repState.month) : new Date(startOfMonth());
  const from = new Date(m.getFullYear(), m.getMonth(), 1).toISOString();
  const to = new Date(m.getFullYear(), m.getMonth() + 1, 1).toISOString();
  const inPeriod = (tx, a, b) => tx.date >= a && tx.date < b;
  const base = ix.transactions.filter((tx) => tx.type !== 'transfer' && txCurrency(ix, tx) === 'EGP' && matches(tx, repState.f, ix));
  const isOwner = (tx) => ix.catById.get(tx.categoryId)?.system === 'owner_transfer';
  const month = base.filter((tx) => inPeriod(tx, from, to));
  const sumIn = month.filter((x) => x.type === 'income').reduce((a, x) => a + x.amount, 0);
  const sumOut = month.filter((x) => x.type === 'expense' && !isOwner(x)).reduce((a, x) => a + x.amount, 0);
  const sumOwner = month.filter(isOwner).reduce((a, x) => a + x.amount, 0);

  // تجميع حسب البند الرئيسي، ومعاه الفرعي
  const byCat = (kind) => {
    const groups = new Map();
    for (const tx of month) {
      if (tx.type !== kind || isOwner(tx)) continue;
      const path = catPath(ix, tx.categoryId);
      const main = path[0];
      if (!main) continue;
      if (!groups.has(main.id)) groups.set(main.id, { cat: main, total: 0, subs: new Map() });
      const g = groups.get(main.id);
      g.total += tx.amount;
      const sub = path[1];
      if (sub) g.subs.set(sub.id, { cat: sub, total: (g.subs.get(sub.id)?.total || 0) + tx.amount });
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  };
  const catBlock = (kind, total) => {
    const groups = byCat(kind);
    if (!groups.length) return `<p class="empty">${t('noTx')}</p>`;
    const max = groups[0].total;
    return groups.map((g) => {
      const open = repState.open.has(g.cat.id);
      const subs = [...g.subs.values()].sort((a, b) => b.total - a.total);
      return `<button class="rep-row" data-open="${g.cat.id}">
          <span class="rep-ic">${catIcon(g.cat)}</span>
          <span class="rep-main"><span class="row between"><span class="rep-name">${esc(catName(g.cat))}</span><b>${money(g.total)}</b></span>
          <span class="bar"><span class="bar-fill ${kind}" style="width:${Math.max(3, (g.total / max) * 100)}%"></span></span>
          <span class="rep-pct">${Math.round((g.total / total) * 100)}%${subs.length ? ` · ${open ? '▴' : '▾'}` : ''}</span></span>
        </button>
        ${open ? subs.map((x) => `<div class="rep-sub"><span>${catIcon(x.cat)} ${esc(catName(x.cat))}</span><span class="grow"></span><span>${money(x.total)}</span><span class="rep-pct">${Math.round((x.total / g.total) * 100)}%</span></div>`).join('') : ''}`;
    }).join('');
  };

  // مقارنة آخر 6 شهور
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const a = new Date(m.getFullYear(), m.getMonth() - i, 1), b = new Date(m.getFullYear(), m.getMonth() - i + 1, 1);
    const txs = base.filter((tx) => inPeriod(tx, a.toISOString(), b.toISOString()));
    months.push({ label: fmtDate(a.toISOString(), { month: 'short' }), in: txs.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0), out: txs.filter((x) => x.type === 'expense' && !isOwner(x)).reduce((s, x) => s + x.amount, 0), current: i === 0 });
  }
  const mMax = Math.max(1, ...months.map((x) => Math.max(x.in, x.out)));

  // المصروف اليومي في الشهر
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const daily = Array.from({ length: days }, () => 0);
  for (const tx of month) if (tx.type === 'expense' && !isOwner(tx)) daily[new Date(tx.date).getDate() - 1] += tx.amount;
  const dMax = Math.max(1, ...daily);
  const today = new Date();
  const elapsed = m.getMonth() === today.getMonth() && m.getFullYear() === today.getFullYear() ? today.getDate() : days;

  root.innerHTML = `
    ${header(t('reports'))}
    <div class="page">
      <div class="month-nav">
        <button class="icon-btn" data-m="-1">${icon(state.lang === 'ar' ? 'chev' : 'back')}</button>
        <strong>${fmtDate(from, { month: 'long', year: 'numeric' })}</strong>
        <button class="icon-btn" data-m="1">${icon(state.lang === 'ar' ? 'back' : 'chev')}</button>
      </div>
      ${pillsHtml(repState.f, ['wallet', 'account'], ix)}
      <div class="stat-grid">
        <div class="stat"><span>${t('dir_in')}</span><b class="income">${money(sumIn)}</b></div>
        <div class="stat"><span>${t('dir_out')}</span><b class="expense">${money(sumOut)}</b></div>
        <div class="stat"><span>${t('net')}</span><b class="${sumIn - sumOut < 0 ? 'neg' : ''}">${money(sumIn - sumOut, 'EGP', { sign: true })}</b></div>
      </div>
      ${sumOwner ? `<div class="total-line"><span>${t('ownerTransfer')}</span><span>${money(sumOwner)}</span></div>` : ''}

      <div class="section-head"><h2>${t('expensesByCat')}</h2></div>
      <div class="card rep-card">${catBlock('expense', sumOut || 1)}</div>

      <div class="section-head"><h2>${t('incomeByCat')}</h2></div>
      <div class="card rep-card">${catBlock('income', sumIn || 1)}</div>

      <div class="section-head"><h2>${t('monthlyCompare')}</h2></div>
      <div class="card">
        <div class="vbars">${months.map((x) => `<div class="vcol ${x.current ? 'cur' : ''}"><div class="vpair"><span class="vbar income" style="height:${(x.in / mMax) * 100}%" title="${money(x.in)}"></span><span class="vbar expense" style="height:${(x.out / mMax) * 100}%" title="${money(x.out)}"></span></div><span class="vlabel">${x.label}</span></div>`).join('')}</div>
        <div class="legend"><span><i class="lg income"></i>${t('dir_in')}</span><span><i class="lg expense"></i>${t('dir_out')}</span></div>
      </div>

      <div class="section-head"><h2>${t('dailySpend')}</h2><span class="muted small">${t('avgPerDay')}: ${money(Math.round(sumOut / Math.max(1, elapsed) / 100) * 100)}</span></div>
      <div class="card"><div class="dbars">${daily.map((v, i) => `<span class="dbar ${i + 1 === today.getDate() && elapsed !== days ? 'today' : ''}" style="height:${Math.max(v ? 4 : 1, (v / dMax) * 100)}%" title="${i + 1}: ${money(v)}"></span>`).join('')}</div>
        <div class="row between muted small"><span>1</span><span>${Math.ceil(days / 2)}</span><span>${days}</span></div></div>
      <p class="muted small center">${t('reportsEgpNote')}</p>
    </div>`;
  root.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { repState.month = new Date(m.getFullYear(), m.getMonth() + Number(b.dataset.m), 1).toISOString(); reportsView(root); });
  root.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { const id = b.dataset.open; repState.open.has(id) ? repState.open.delete(id) : repState.open.add(id); reportsView(root); });
  bindPills(root, repState.f, ix, () => reportsView(root));
}

function bindSync(root) {
  const rerender = () => settingsView(root);
  const now = root.querySelector('#syncNow');
  if (now) now.onclick = async () => { await syncNow(); rerender(); };
  const out = root.querySelector('#signOut');
  if (out) out.onclick = async () => { if (await confirmBox(t('confirmSignOut'))) { await signOut(); rerender(); } };
  const go = async (fn) => {
    const url = root.querySelector('#sUrl').value, key = root.querySelector('#sKey').value;
    const email = root.querySelector('#sEmail').value.trim(), pass = root.querySelector('#sPass').value;
    if (!url || !key) return toast(t('errSupa'));
    if (!email || pass.length < 6) return toast(t('errLogin'));
    await saveConfig(url, key);
    try {
      await fn(email, pass);
      toast(t('syncStarted'));
      await changed({ local: false });
    } catch (e) {
      const msg = String(e.message || e);
      if (msg === 'needs_choice') return chooseMerge(rerender);
      if (msg === 'confirm_email') return toast(t('errConfirmEmail'));
      toast(msg);
    }
  };
  const sIn = root.querySelector('#sIn'); if (sIn) sIn.onclick = () => go(signIn);
  const sUp = root.querySelector('#sUp'); if (sUp) sUp.onclick = () => go(signUp);
}

// الجهاز عليه بيانات والسحابة عليها بيانات: نسأل
function chooseMerge(done) {
  openSheet((el, close) => {
    el.innerHTML = `<h3>${t('bothHaveData')}</h3><p class="muted">${t('bothHaveDataHint')}</p>
      <button class="btn primary" data-m="replace">${t('useCloud')}</button>
      <button class="btn soft" data-m="merge">${t('mergeBoth')}</button>`;
    el.querySelectorAll('[data-m]').forEach((b) => b.onclick = async () => {
      close();
      try { await afterSignIn(b.dataset.m); toast(t('syncStarted')); } catch (e) { toast(String(e.message || e)); }
      await changed({ local: false });
      done();
    });
  });
}
