// فلاتر متعددة الاختيار (النوع، المحفظة، الحساب، البند) بشكل قوايم صغيرة
// كل فلتر Set: فاضي = الكل
import { openSheet, icon } from './ui.js';
import { t, esc, catName, accName, walletName } from './util.js';
import { catIcon } from './icons.js';

export const newFilter = () => ({ type: new Set(), wallet: new Set(), account: new Set(), cat: new Set() });

const ALL_LABEL = { type: 'allTypes', wallet: 'allWallets', account: 'allAccounts', cat: 'allCats' };
const TITLE = { type: 'txType', wallet: 'wallet', account: 'account', cat: 'category' };
const TYPE_LABEL = { income: 'dir_in', expense: 'dir_out', transfer: 'transfer' };

function options(key, ix) {
  if (key === 'type') return ['income', 'expense', 'transfer'].map((v) => ({ value: v, label: t(TYPE_LABEL[v]) }));
  if (key === 'wallet') return ix.wallets.map((w) => ({ value: w.id, label: walletName(w), color: w.color }));
  if (key === 'account') return ix.accounts.map((a) => ({ value: a.id, label: accName(a) }));
  // البنود: متقسمة حسب المحفظة والنوع، والفرعي تحت الرئيسي
  const out = [];
  for (const w of ix.wallets) {
    for (const kind of ['expense', 'income']) {
      const mains = ix.categories.filter((c) => c.walletId === w.id && c.kind === kind && !c.parentId && !String(c.system || '').startsWith('adjust')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (!mains.length) continue;
      out.push({ header: `${walletName(w)} · ${t(kind === 'expense' ? 'expenseCats' : 'incomeCats')}` });
      for (const m of mains) {
        out.push({ value: m.id, label: catName(m), icon: catIcon(m) });
        for (const sub of ix.categories.filter((c) => c.parentId === m.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
          out.push({ value: sub.id, label: catName(sub), icon: catIcon(sub), parent: m.id });
        }
      }
    }
  }
  return out;
}

export function matches(tx, f, ix) {
  if (f.type.size && !f.type.has(tx.type)) return false;
  if (f.wallet.size && !f.wallet.has(tx.walletId)) return false;
  if (f.account.size && !f.account.has(tx.accountId) && !f.account.has(tx.toAccountId)) return false;
  if (f.cat.size) {
    const c = ix.catById.get(tx.categoryId);
    if (!c || !(f.cat.has(c.id) || (c.parentId && f.cat.has(c.parentId)))) return false;
  }
  return true;
}

function pillLabel(key, f, ix) {
  const set = f[key];
  if (!set.size) return t(ALL_LABEL[key]);
  const first = options(key, ix).find((o) => o.value && set.has(o.value));
  return set.size === 1 ? first?.label : `${first?.label} +${set.size - 1}`;
}

export function pillsHtml(f, keys, ix) {
  return `<div class="mini-filters scroll">${keys.map((k) => `<button class="pill-select ${f[k].size ? 'active' : ''}" data-filter="${k}"><span>${esc(pillLabel(k, f, ix))}</span></button>`).join('')}</div>`;
}

export function bindPills(root, f, ix, rerender) {
  root.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => {
    const key = b.dataset.filter;
    const sel = new Set(f[key]);
    const opts = options(key, ix);
    openSheet((el, close) => {
      const draw = () => {
        el.innerHTML = `<div class="row between"><h3>${t(TITLE[key])}</h3><button class="link-btn" data-clear>${t('clearAll')}</button></div>
          <div class="multi-list">${opts.map((o) => {
            if (o.header) return `<div class="group-label">${esc(o.header)}</div>`;
            const implied = o.parent && sel.has(o.parent);
            const on = sel.has(o.value) || implied;
            return `<button class="multi-opt ${on ? 'on' : ''} ${o.parent ? 'sub' : ''}" data-v="${o.value}" ${implied ? 'disabled' : ''}>
              <span class="check">${on ? '✓' : ''}</span>
              ${o.color ? `<span class="dot" style="--c:${o.color}"></span>` : ''}${o.icon ? `<span class="opt-ic">${o.icon}</span>` : ''}
              <span class="grow">${esc(o.label)}</span></button>`;
          }).join('')}</div>
          <div class="sheet-actions"><button class="btn primary grow" data-apply>${t('apply')}${sel.size ? ` (${sel.size})` : ''}</button></div>`;
        el.querySelectorAll('[data-v]').forEach((x) => x.onclick = () => {
          const v = x.dataset.v;
          if (sel.has(v)) sel.delete(v);
          else {
            sel.add(v);
            // لو اخترت بند رئيسي، الفرعي بتاعه داخل تلقائي
            opts.filter((o) => o.parent === v).forEach((o) => sel.delete(o.value));
          }
          draw();
        });
        el.querySelector('[data-clear]').onclick = () => { sel.clear(); draw(); };
        el.querySelector('[data-apply]').onclick = () => { f[key] = sel; close(); rerender(); };
      };
      draw();
    }, { tall: key === 'cat' });
  });
}
