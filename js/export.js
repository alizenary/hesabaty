// تصدير كشف حساب العهدة Excel + النسخ الاحتياطي واسترجاعه
import * as XLSX from '../vendor/xlsx.mjs';
import { db } from './db.js';
import { statement, catPath } from './calc.js';
import { t, fromMinor, fmtDate, catName, accName, walletName, state, dayKey } from './util.js';

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// يحاول يشارك الملف (واتساب...) ولو مش متاح ينزّله
async function shareOrDownload(blob, filename) {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  download(blob, filename);
}

export async function exportStatement(ix, walletId, currency, from, to) {
  const w = ix.walletById.get(walletId);
  const st = statement(ix, walletId, currency, from, to);
  const header = [t('xDate'), t('xTime'), t('xType'), t('xGroup'), t('xCategory'), t('xNote'), t('xPlace'), t('xAccount'), t('xIn'), t('xOut'), t('xBalance')];
  const range = `${from ? fmtDate(from) : '—'}  →  ${to ? fmtDate(new Date(new Date(to).getTime() - 1).toISOString()) : fmtDate(new Date().toISOString())}`;
  const rows = [
    [`${t('statementOf')}: ${walletName(w)}`],
    [`${t('period')}: ${range}`, '', '', '', '', '', '', '', '', '', ''],
    [`${t('currency')}: ${currency}`],
    [],
    header,
    ['', '', '', '', t('openingBalance'), '', '', '', '', '', fromMinor(st.opening)],
  ];
  for (const r of st.rows) {
    const path = catPath(ix, r.tx.categoryId);
    const leaf = path[path.length - 1];
    const typeLabel = leaf?.system === 'owner_transfer' ? t('ownerTransfer') : t(r.tx.type);
    rows.push([
      dayKey(r.tx.date),
      new Date(r.tx.date).toTimeString().slice(0, 5),
      typeLabel,
      path.slice(0, -1).map(catName).join(' › '),
      catName(leaf),
      r.tx.note || '',
      r.tx.place || '',
      accName(ix.accountById.get(r.tx.accountId)),
      r.signed > 0 ? fromMinor(r.signed) : '',
      r.signed < 0 ? fromMinor(-r.signed) : '',
      fromMinor(r.balance),
    ]);
  }
  rows.push([]);
  rows.push(['', '', '', '', t('totals'), '', '', '', fromMinor(st.totalIn), fromMinor(st.totalOut), '']);
  rows.push(['', '', '', '', t('closingBalance'), '', '', '', '', '', fromMinor(st.closing)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [12, 9, 14, 26, 20, 28, 14, 14, 12, 12, 13].map((wch) => ({ wch }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: state.lang === 'ar' }] };
  XLSX.utils.book_append_sheet(wb, ws, t('statement').slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await shareOrDownload(blob, `${walletName(w)}-${currency}-${dayKey(new Date())}.xlsx`);
}

export async function exportBackup() {
  const data = { app: 'hesabaty', version: 1, exportedAt: new Date().toISOString() };
  for (const table of ['wallets', 'accounts', 'categories', 'transactions', 'meta']) {
    data[table] = await db[table].toArray();
  }
  data.meta = data.meta.filter((m) => m.key !== 'pinHash' && m.key !== 'pinSalt');
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  await shareOrDownload(blob, `hesabaty-backup-${dayKey(new Date())}.json`);
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'hesabaty' || !Array.isArray(data.transactions)) throw new Error('bad file');
  await db.transaction('rw', db.wallets, db.accounts, db.categories, db.transactions, db.meta, async () => {
    for (const table of ['wallets', 'accounts', 'categories', 'transactions']) {
      await db[table].clear();
      await db[table].bulkPut(data[table] || []);
    }
    for (const m of data.meta || []) await db.meta.put(m);
  });
}
