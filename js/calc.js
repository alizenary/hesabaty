// حساب الأرصدة — مفيش أرصدة متخزنة، كل حاجة بتتحسب من العمليات.
//
// رصيد الحساب   = الافتتاحي + الداخل − الخارج
// رصيد العهدة   = الافتتاحي + دخل العهدة − مصروفات العهدة (منها التحويل للمالك)
// فلوسي         = إجمالي أرصدة الحسابات − أرصدة العهد   (لكل عملة لوحدها)

export const CURRENCIES = ['EGP', 'USD'];

// ترتيب العمليات بالتاريخ، ولو نفس الوقت بترتيب الإدخال
export const byDate = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '');
export const byDateDesc = (a, b) => byDate(b, a);

export function buildIndex({ wallets, accounts, categories, transactions }) {
  return {
    wallets, accounts, categories, transactions,
    walletById: new Map(wallets.map((w) => [w.id, w])),
    accountById: new Map(accounts.map((a) => [a.id, a])),
    catById: new Map(categories.map((c) => [c.id, c])),
  };
}

export function txCurrency(ix, tx) {
  return ix.accountById.get(tx.accountId)?.currency || 'EGP';
}

export function accountBalances(ix) {
  const bal = new Map(ix.accounts.map((a) => [a.id, a.opening || 0]));
  for (const tx of ix.transactions) {
    if (tx.type === 'income') bal.set(tx.accountId, (bal.get(tx.accountId) || 0) + tx.amount);
    else if (tx.type === 'expense') bal.set(tx.accountId, (bal.get(tx.accountId) || 0) - tx.amount);
    else if (tx.type === 'transfer') {
      bal.set(tx.accountId, (bal.get(tx.accountId) || 0) - tx.amount);
      bal.set(tx.toAccountId, (bal.get(tx.toAccountId) || 0) + (tx.toAmount ?? tx.amount));
    }
  }
  return bal;
}

const zero = () => Object.fromEntries(CURRENCIES.map((c) => [c, 0]));

// رصيد كل عهدة لكل عملة
export function walletBalances(ix) {
  const res = new Map();
  for (const w of ix.wallets) res.set(w.id, { ...zero(), ...(w.opening || {}) });
  for (const tx of ix.transactions) {
    if (tx.type === 'transfer' || !tx.walletId) continue;
    const cur = txCurrency(ix, tx);
    const b = res.get(tx.walletId);
    if (!b) continue;
    b[cur] = (b[cur] || 0) + (tx.type === 'income' ? tx.amount : -tx.amount);
  }
  return res;
}

export function summary(ix) {
  const accBal = accountBalances(ix);
  const total = zero();
  for (const a of ix.accounts) total[a.currency] = (total[a.currency] || 0) + (accBal.get(a.id) || 0);
  const wBal = walletBalances(ix);
  const custodyTotal = zero();
  for (const w of ix.wallets) {
    if (w.type !== 'custody') continue;
    const b = wBal.get(w.id);
    for (const c of CURRENCIES) custodyTotal[c] += b[c] || 0;
  }
  const mine = zero();
  for (const c of CURRENCIES) mine[c] = total[c] - custodyTotal[c];
  return { accBal, wBal, total, custodyTotal, mine };
}

// مسار البند: [الجد, الأب, البند]
export function catPath(ix, catId) {
  const path = [];
  let c = ix.catById.get(catId);
  let guard = 0;
  while (c && guard++ < 10) {
    path.unshift(c);
    c = c.parentId ? ix.catById.get(c.parentId) : null;
  }
  return path;
}

export function isLeaf(ix, cat) {
  return !ix.categories.some((c) => c.parentId === cat.id);
}

// حركة العهدة في يوم معين أو فترة
export function walletFlow(ix, walletId, from, to) {
  const flow = { in: zero(), out: zero(), owner: zero() };
  for (const tx of ix.transactions) {
    if (tx.walletId !== walletId || tx.type === 'transfer') continue;
    if (from && tx.date < from) continue;
    if (to && tx.date >= to) continue;
    const cur = txCurrency(ix, tx);
    if (tx.type === 'income') flow.in[cur] += tx.amount;
    else if (ix.catById.get(tx.categoryId)?.system === 'owner_transfer') flow.owner[cur] += tx.amount;
    else flow.out[cur] += tx.amount;
  }
  return flow;
}

// كشف حساب عهدة لعملة وفترة: الرصيد الافتتاحي للفترة + الحركات برصيد متحرك
export function statement(ix, walletId, currency, from, to) {
  const w = ix.walletById.get(walletId);
  let opening = w?.opening?.[currency] || 0;
  const rows = [];
  const txs = ix.transactions
    .filter((tx) => tx.walletId === walletId && tx.type !== 'transfer' && txCurrency(ix, tx) === currency)
    .sort(byDate);
  for (const tx of txs) {
    const signed = tx.type === 'income' ? tx.amount : -tx.amount;
    if (from && tx.date < from) { opening += signed; continue; }
    if (to && tx.date >= to) continue;
    rows.push({ tx, signed });
  }
  let run = opening;
  let totalIn = 0, totalOut = 0;
  for (const r of rows) {
    run += r.signed;
    r.balance = run;
    if (r.signed > 0) totalIn += r.signed; else totalOut -= r.signed;
  }
  return { opening, rows, totalIn, totalOut, closing: run };
}

// استخدام البنود (للترتيب حسب الأكثر استخداماً)
export function categoryUsage(ix) {
  const m = new Map();
  for (const tx of ix.transactions) if (tx.categoryId) m.set(tx.categoryId, (m.get(tx.categoryId) || 0) + 1);
  return m;
}
