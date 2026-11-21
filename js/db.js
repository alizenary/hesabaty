// قاعدة البيانات المحلية (IndexedDB عن طريق Dexie)
// كل المبالغ بتتخزن بالقرش/السنت (أرقام صحيحة) عشان نتفادى أخطاء الكسور.
import Dexie from '../vendor/dexie.mjs';

export const db = new Dexie('hesabaty');

db.version(1).stores({
  wallets: 'id, type, updatedAt',
  accounts: 'id, updatedAt',
  categories: 'id, walletId, parentId, kind, updatedAt',
  transactions: 'id, date, walletId, accountId, toAccountId, categoryId, type, updatedAt',
  meta: 'key',
});

export const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- أدوات عامة ----------
export function stamp(obj) {
  return { ...obj, createdAt: obj.createdAt ?? now(), updatedAt: now(), deletedAt: obj.deletedAt ?? null };
}

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

const alive = (r) => !r.deletedAt;

export async function allWallets() {
  return (await db.wallets.toArray()).filter(alive).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function allAccounts() {
  return (await db.accounts.toArray()).filter(alive).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function allCategories() {
  return (await db.categories.toArray()).filter(alive);
}
export async function allTransactions() {
  return (await db.transactions.toArray()).filter(alive);
}

export async function save(table, obj) {
  const row = stamp({ ...obj, id: obj.id || uid() });
  await db[table].put(row);
  return row;
}
export async function softDelete(table, id) {
  const row = await db[table].get(id);
  if (row) await db[table].put({ ...row, deletedAt: now(), updatedAt: now() });
}

// ---------- البيانات المبدئية ----------
// كل بند: [عربي, إنجليزي, أبناء?]
const COMPANY_EXPENSE_TREE = [
  ['تكلفة مبيعات', 'Cost of sales', [
    ['تكلفة المبيعات', 'Cost of goods sold'],
    ['شحن مشتريات', 'Purchase shipping'],
    ['خصم مسموح به', 'Discount allowed'],
    ['المشتريات', 'Purchases'],
  ]],
  ['مصروفات إدارية وعمومية', 'General & admin', [
    ['إيجار المكان', 'Venue rent'],
    ['إيجار المخزن', 'Warehouse rent'],
    ['كهرباء', 'Electricity'],
    ['هاتف وانترنت', 'Phone & internet'],
    ['صيانة', 'Maintenance'],
    ['مياه', 'Water'],
    ['مصاريف حكومية', 'Government fees'],
    ['أتعاب مهنية', 'Professional fees'],
    ['اشتراكات برامج', 'Software subscriptions'],
  ]],
  ['مصروفات الإهلاك', 'Depreciation'],
];
const COMPANY_INCOME = [
  ['إيراد يومي', 'Daily revenue'],
  ['إيراد الكافيه', 'Cafe revenue'],
  ['من المالك', 'From owner'],
  ['إيرادات أخرى', 'Other income'],
];

const PERSONAL_EXPENSE_TREE = [
  ['البيت', 'Home', [
    ['إيجار', 'Rent'], ['كهرباء', 'Electricity'], ['مياه', 'Water'], ['غاز', 'Gas'],
    ['إنترنت', 'Internet'], ['صيانة', 'Maintenance'], ['أدوات منزلية', 'Household items'],
  ]],
  ['الأكل', 'Food', [
    ['سوبر ماركت', 'Groceries'], ['خضار وفاكهة', 'Fruit & veg'], ['أكل بره', 'Eating out'], ['توصيل', 'Delivery'],
  ]],
  ['المواصلات', 'Transport', [
    ['بنزين', 'Fuel'], ['صيانة عربية', 'Car maintenance'], ['أوبر/تاكسي', 'Uber/Taxi'], ['مواصلات عامة', 'Public transport'],
  ]],
  ['الاتصالات', 'Telecom', [['رصيد وباقات', 'Mobile credit']]],
  ['الصحة', 'Health', [['دكتور', 'Doctor'], ['أدوية', 'Medicine'], ['تحاليل', 'Lab tests']]],
  ['التعليم والأولاد', 'Kids & education', [['مدارس', 'School'], ['دروس', 'Tutoring'], ['مستلزمات', 'Supplies']]],
  ['شخصي', 'Personal', [
    ['لبس', 'Clothes'], ['عناية شخصية', 'Personal care'], ['خروجات', 'Outings'], ['سفر', 'Travel'], ['اشتراكات', 'Subscriptions'],
  ]],
  ['التزامات', 'Obligations', [['أقساط', 'Installments'], ['جمعيات', 'Savings circle'], ['سداد كروت', 'Card payments']]],
  ['مناسبات', 'Occasions', [['هدايا', 'Gifts'], ['صدقات', 'Charity'], ['مناسبات', 'Events']]],
  ['أخرى', 'Other'],
];
const PERSONAL_INCOME = [
  ['مرتب', 'Salary'], ['عمل إضافي', 'Side work'], ['هدايا', 'Gifts'], ['دخل آخر', 'Other income'],
];

async function insertTree(walletId, kind, nodes, parentId = null) {
  let order = 0;
  for (const [nameAr, nameEn, children] of nodes) {
    const id = uid();
    await db.categories.put(stamp({ id, walletId, parentId, kind, nameAr, nameEn, order: order++ }));
    if (children) await insertTree(walletId, kind, children, id);
  }
}

// إنشاء عهدة جديدة بشجرة بنود الشركة (أو نسخة من عهدة موجودة)
export async function createCustody({ name, color, openingEGP = 0, openingUSD = 0, copyFromWalletId = null }) {
  const wallets = await allWallets();
  const wallet = stamp({
    id: uid(), type: 'custody', name, color: color || '#7b2cbf',
    opening: { EGP: openingEGP, USD: openingUSD }, order: wallets.length,
  });
  await db.wallets.put(wallet);
  if (copyFromWalletId) {
    const cats = (await allCategories()).filter((c) => c.walletId === copyFromWalletId);
    const map = new Map(cats.map((c) => [c.id, uid()]));
    for (const c of cats) {
      await db.categories.put(stamp({ ...c, id: map.get(c.id), walletId: wallet.id, parentId: c.parentId ? map.get(c.parentId) : null }));
    }
  } else {
    await insertTree(wallet.id, 'expense', COMPANY_EXPENSE_TREE);
    await insertTree(wallet.id, 'income', COMPANY_INCOME);
    await db.categories.put(stamp({
      id: uid(), walletId: wallet.id, parentId: null, kind: 'expense',
      nameAr: 'تحويل للمالك', nameEn: 'Transfer to owner', system: 'owner_transfer', order: 99,
    }));
  }
  return wallet;
}

export async function seedIfEmpty() {
  if ((await db.wallets.count()) > 0) return false;
  await db.transaction('rw', db.wallets, db.accounts, db.categories, db.meta, async () => {
    const personal = stamp({ id: uid(), type: 'personal', name: 'شخصي', color: '#0f766e', order: 0 });
    await db.wallets.put(personal);
    await insertTree(personal.id, 'expense', PERSONAL_EXPENSE_TREE);
    await insertTree(personal.id, 'income', PERSONAL_INCOME);
    await db.categories.put(stamp({
      id: uid(), walletId: personal.id, parentId: null, kind: 'expense',
      nameAr: 'تسوية فرق رصيد', nameEn: 'Balance adjustment', system: 'adjust_out', order: 98,
    }));
    await db.categories.put(stamp({
      id: uid(), walletId: personal.id, parentId: null, kind: 'income',
      nameAr: 'تسوية فرق رصيد', nameEn: 'Balance adjustment', system: 'adjust_in', order: 98,
    }));

    const accounts = [
      ['كاش جنيه', 'Cash EGP', 'cash', 'EGP'],
      ['البنك', 'Bank', 'bank', 'EGP'],
      ['فودافون كاش', 'Vodafone Cash', 'ewallet', 'EGP'],
      ['إنستاباي', 'InstaPay', 'ewallet', 'EGP'],
    ];
    let order = 0;
    for (const [name, nameEn, type, currency] of accounts) {
      await db.accounts.put(stamp({ id: uid(), name, nameEn, type, currency, opening: 0, order: order++ }));
    }
    await db.meta.put({ key: 'firstRun', value: true });
  });
  await createCustody({ name: 'عهدة الشركة', color: '#7b2cbf' });
  return true;
}

// البنود مستويين بس (رئيسي وفرعي): أي بند أعمق بيتنقل تحت البند الرئيسي بتاعه
export async function normalizeTwoLevels() {
  const cats = await allCategories();
  const byId = new Map(cats.map((c) => [c.id, c]));
  const root = (c) => { let x = c; let g = 0; while (x.parentId && byId.get(x.parentId) && g++ < 10) x = byId.get(x.parentId); return x; };
  for (const c of cats) {
    if (!c.parentId) continue;
    const parent = byId.get(c.parentId);
    if (parent && parent.parentId) {
      await save('categories', { ...c, parentId: root(c).id });
    }
  }
}
