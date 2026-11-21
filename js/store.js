// تحميل كل البيانات مرة واحدة في الذاكرة وإعادة الرسم بعد أي تعديل
import { allWallets, allAccounts, allCategories, allTransactions } from './db.js';
import { buildIndex } from './calc.js';

let cached = null;
const listeners = new Set();

export async function getIndex() {
  if (!cached) {
    const [wallets, accounts, categories, transactions] = await Promise.all([
      allWallets(), allAccounts(), allCategories(), allTransactions(),
    ]);
    cached = buildIndex({ wallets, accounts, categories, transactions });
  }
  return cached;
}

export function onChange(fn) { listeners.add(fn); }

// local=false لما التغيير جاي من المزامنة (عشان ما نرجعش نرفعه تاني)
export async function changed({ local = true } = {}) {
  cached = null;
  for (const fn of listeners) await fn({ local });
}
