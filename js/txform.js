// شيت تسجيل/تعديل عملية: مصروف، دخل، أو تحويل بين حسابات
import { save, softDelete } from './db.js';
import { getIndex, changed } from './store.js';
import { categoryUsage, catPath } from './calc.js';
import { catIcon } from './icons.js';
import { openSheet, confirmBox, toast, icon } from './ui.js';
import { t, esc, toMinor, fromMinor, toLocalInput, catName, accName, walletName, state } from './util.js';

const LAST_KEY = 'hesabaty.last';
const readLast = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch { return {}; } };
const writeLast = (v) => { try { localStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), ...v })); } catch { /* تجاهل */ } };

export async function openTxForm({ tx = null, preset = {} } = {}) {
  const ix = await getIndex();
  const last = readLast();
  const activeWallets = ix.wallets.filter((w) => !w.archived);
  const activeAccounts = ix.accounts.filter((a) => !a.archived);

  const s = tx
    ? { ...tx, amountText: String(fromMinor(tx.amount)), toAmountText: tx.toAmount != null ? String(fromMinor(tx.toAmount)) : '', dateText: toLocalInput(tx.date) }
    : {
        type: preset.type || 'expense',
        walletId: preset.walletId || (activeWallets.find((w) => w.id === last.walletId) || activeWallets[0])?.id,
        categoryId: preset.categoryId || null,
        accountId: (activeAccounts.find((a) => a.id === last.accountId) || activeAccounts[0])?.id,
        toAccountId: null,
        amountText: '', toAmountText: '', note: '', place: '',
        dateText: toLocalInput(new Date().toISOString()),
      };
  const editing = !!tx?.id;
  const initialDateText = s.dateText;
  // سلسلة البنود المختارة من الرئيسي للفرعي
  let chain = [];
  const usage = categoryUsage(ix);
  const resetChain = () => { chain = s.categoryId ? catPath(ix, s.categoryId).map((c) => c.id) : []; };

  resetChain();
  openSheet((el, close) => {
    el.innerHTML = `
      <div class="seg" role="tablist">
        ${['expense', 'income', 'transfer'].map((ty) => `<button class="seg-btn ${s.type === ty ? 'on ' + ty : ''}" data-type="${ty}">${t(ty)}</button>`).join('')}
      </div>
      <div class="amount-box">
        <input id="amt" class="amount-input" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(s.amountText)}" aria-label="${t('amount')}">
        <span class="amount-cur" id="amtCur"></span>
      </div>
      <div id="dyn"></div>
      <div class="sheet-actions">
        <button class="btn primary grow" id="saveBtn">${t('save')}</button>
        ${editing ? `<button class="btn ghost icon-btn" id="dupBtn" title="${t('duplicate')}">${icon('copy')}</button><button class="btn ghost icon-btn danger-text" id="delBtn" title="${t('delete')}">${icon('trash')}</button>` : ''}
      </div>`;

    const amt = el.querySelector('#amt');
    amt.addEventListener('input', () => { s.amountText = amt.value; });
    if (!editing) setTimeout(() => amt.focus(), 250);

    el.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      if (s.type === b.dataset.type) return;
      s.type = b.dataset.type;
      s.categoryId = null; chain = [];
      el.querySelectorAll('[data-type]').forEach((x) => { x.className = 'seg-btn' + (x.dataset.type === s.type ? ' on ' + s.type : ''); });
      draw();
    }));

    function chip(label, on, attrs, color) {
      return `<button class="chip ${on ? 'on' : ''}" ${attrs} ${color ? `style="--c:${color}"` : ''}>${esc(label)}</button>`;
    }

    // ---------- اختيار البند: البنود الرئيسية الأول، وبعدها اللي تحتها ----------
    const visibleCats = () => ix.categories.filter((c) => c.walletId === s.walletId && c.kind === s.type && !c.archived && !String(c.system || '').startsWith('adjust'));
    const childrenOf = (pid) => visibleCats().filter((c) => (c.parentId || null) === pid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const hasKids = (c) => visibleCats().some((x) => x.parentId === c.id);
    const sep = state.lang === 'ar' ? ' ‹ ' : ' › ';

    function picked(label, value, attr, ic) {
      return `<button class="picked" ${attr}><span class="picked-label">${esc(label)}</span>${ic ? `<span class="picked-ic">${ic}</span>` : ''}<span class="picked-value">${esc(value)}</span><span class="picked-change">${t('change')}</span></button>`;
    }
    const tile = (c, attrs, extra = '') => `<button class="cat-tile ${extra}" ${attrs}><span class="cat-ic">${catIcon(c)}</span><span class="cat-name">${esc(catName(c))}</span></button>`;

    // البنود مستويين: سلايدر كروت للرئيسي، وتحته سلايدر أصغر للفرعي
    function catSection() {
      let html = `<div class="field-label">${t('category')}</div>`;
      const roots = childrenOf(null);
      if (!roots.length) return html + `<p class="muted small">${t('noCategories')}</p>`;
      const main = chain[0];
      html += `<div class="cat-slider main">${roots.map((c) => `<button class="cat-card ${main === c.id ? 'on' : ''}" data-level="0" data-node="${c.id}"><span class="cat-ic">${catIcon(c)}</span><span class="cat-name">${esc(catName(c))}</span></button>`).join('')}</div>`;
      if (main && hasKids(ix.catById.get(main))) {
        html += `<div class="cat-slider sub">${childrenOf(main).map((c) => `<button class="sub-chip ${s.categoryId === c.id ? 'on' : ''}" data-level="1" data-node="${c.id}"><span>${catIcon(c)}</span>${esc(catName(c))}</button>`).join('')}</div>`;
      }
      return html;
    }

    function accSection(label, selectedId, id, exclude) {
      const opts = activeAccounts.filter((x) => x.id !== exclude);
      return `<label class="field"><span>${label}</span><select id="${id}" class="select">
        ${selectedId ? '' : `<option value="" selected disabled>${t('chooseAccount')}</option>`}
        ${opts.map((x) => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${esc(accName(x))}</option>`).join('')}
      </select></label>`;
    }

    function draw() {
      const dyn = el.querySelector('#dyn');
      const acc = ix.accountById.get(s.accountId);
      el.querySelector('#amtCur').textContent = acc ? (acc.currency === 'USD' ? '$' : t('egp')) : '';
      if (s.type === 'transfer') {
        const toAcc = ix.accountById.get(s.toAccountId);
        const diffCur = acc && toAcc && acc.currency !== toAcc.currency;
        dyn.innerHTML = `
          <div class="row gap two">${accSection(t('fromAccount'), s.accountId, 'accSel', null)}${accSection(t('toAccount'), s.toAccountId, 'toAccSel', s.accountId)}</div>
          ${diffCur ? `<label class="field"><span>${t('receivedAmount')} (${toAcc.currency === 'USD' ? '$' : t('egp')})</span><input id="toAmt" inputmode="decimal" value="${esc(s.toAmountText)}"></label>
                       <p class="muted small" id="rateHint"></p>` : ''}
          ${moreFields()}`;
      } else {
        dyn.innerHTML = `
          <div class="seg wallets">${activeWallets.map((w) => `<button class="seg-btn ${w.id === s.walletId ? 'on' : ''}" data-wallet="${w.id}" style="--c:${w.color}">${esc(walletName(w))}</button>`).join('')}</div>
          ${catSection()}
          ${accSection(s.type === 'income' ? t('intoAccount') : t('fromAccount'), s.accountId, 'accSel', null)}
          ${moreFields()}`;
      }
      bind(dyn);
    }

    function moreFields() {
      return `<label class="field"><span>${t('note')}</span><input id="note" value="${esc(s.note || '')}" placeholder="${t('notePh')}"></label>
        <div class="row gap two">
          <label class="field"><span>${t('dateTime')}</span><input type="datetime-local" id="date" value="${esc(s.dateText)}"></label>
          <label class="field"><span>${t('place')}</span><input id="place" value="${esc(s.place || '')}" placeholder="${t('notePh')}"></label>
        </div>`;
    }

    function bind(dyn) {
      dyn.querySelectorAll('[data-wallet]').forEach((b) => b.onclick = () => { if (s.walletId === b.dataset.wallet) return; s.walletId = b.dataset.wallet; s.categoryId = null; chain = []; draw(); });
      dyn.querySelectorAll('[data-node]').forEach((b) => b.onclick = () => {
        const level = Number(b.dataset.level), id = b.dataset.node;
        chain = [...chain.slice(0, level), id];
        s.categoryId = hasKids(ix.catById.get(id)) ? null : id;
        // نحافظ على مكان السكرول في كل سلايدر بعد إعادة الرسم
        const scrolls = [...dyn.querySelectorAll('.cat-slider')].map((x) => x.scrollLeft);
        draw();
        dyn.querySelectorAll('.cat-slider').forEach((x, i) => { if (scrolls[i] != null) x.scrollLeft = scrolls[i]; });
        const rows = dyn.querySelectorAll('.cat-slider');
        if (rows.length > level + 1) rows[level + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      const accSel = dyn.querySelector('#accSel');
      if (accSel) accSel.onchange = () => { s.accountId = accSel.value; if (s.toAccountId === s.accountId) s.toAccountId = null; draw(); };
      const toAccSel = dyn.querySelector('#toAccSel');
      if (toAccSel) toAccSel.onchange = () => { s.toAccountId = toAccSel.value; draw(); };
      const bindVal = (id, key) => { const i = dyn.querySelector('#' + id); if (i) i.oninput = () => { s[key] = i.value; if (id === 'toAmt') rate(); }; };
      bindVal('date', 'dateText'); bindVal('note', 'note'); bindVal('place', 'place'); bindVal('toAmt', 'toAmountText');
      rate();
    }

    function rate() {
      const hint = el.querySelector('#rateHint');
      if (!hint) return;
      const a = toMinor(s.amountText), b = toMinor(s.toAmountText);
      if (a > 0 && b > 0) {
        const r = Math.max(a, b) / Math.min(a, b);
        hint.textContent = `${t('rate')}: ${r.toFixed(2)}`;
      } else hint.textContent = '';
    }

    draw();

    el.querySelector('#saveBtn').onclick = async () => {
      const amount = toMinor(s.amountText);
      if (amount <= 0) return toast(t('errAmount'));
      if (!s.accountId) return toast(t('errAccount'));
      // لو التاريخ ما اتغيرش نحتفظ بالثواني عشان ترتيب العمليات يفضل صح
      const date = s.dateText && s.dateText !== initialDateText ? new Date(s.dateText).toISOString() : editing ? tx.date : new Date().toISOString();
      let row;
      if (s.type === 'transfer') {
        if (!s.toAccountId) return toast(t('errToAccount'));
        const fromCur = ix.accountById.get(s.accountId).currency;
        const toCur = ix.accountById.get(s.toAccountId).currency;
        let toAmount = null;
        if (fromCur !== toCur) {
          toAmount = toMinor(s.toAmountText);
          if (toAmount <= 0) return toast(t('errToAmount'));
        }
        row = { id: tx?.id, type: 'transfer', amount, toAmount, accountId: s.accountId, toAccountId: s.toAccountId, walletId: null, categoryId: null, date, note: s.note || '', place: s.place || '' };
      } else {
        if (!s.walletId) return toast(t('errWallet'));
        if (!s.categoryId) return toast(t('errCategory'));
        row = { id: tx?.id, type: s.type, amount, accountId: s.accountId, walletId: s.walletId, categoryId: s.categoryId, toAccountId: null, toAmount: null, date, note: s.note || '', place: s.place || '' };
        writeLast({ walletId: s.walletId });
      }
      writeLast({ accountId: s.accountId });
      await save('transactions', row);
      close();
      toast(editing ? t('updated') : t('saved'));
      await changed();
    };

    const del = el.querySelector('#delBtn');
    if (del) del.onclick = async () => {
      if (!(await confirmBox(t('confirmDeleteTx'), { danger: true, okText: t('delete') }))) return;
      await softDelete('transactions', tx.id);
      close(); toast(t('deleted')); await changed();
    };
    const dup = el.querySelector('#dupBtn');
    if (dup) dup.onclick = () => {
      close();
      const { id, updatedAt, deletedAt, ...rest } = tx;
      setTimeout(() => openTxForm({ tx: { ...rest, date: new Date().toISOString() } }), 220);
    };
  }, { tall: true });
}
