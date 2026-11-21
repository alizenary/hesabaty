// أدوات: الترجمة، تنسيق الأرقام والتواريخ، وحماية النصوص
import { STRINGS } from './i18n.js';

export const state = { lang: 'ar' };

export function t(key, vars = {}) {
  let s = STRINGS[state.lang]?.[key] ?? STRINGS.ar[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function setLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const locale = () => (state.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US');

// المبالغ متخزنة بالقرش
export const toMinor = (v) => Math.round(parseFloat(String(v).replace(/,/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) * 100) || 0;
export const fromMinor = (m) => (m || 0) / 100;

export function money(minor, currency = 'EGP', { sign = false } = {}) {
  const v = fromMinor(minor);
  const n = new Intl.NumberFormat(locale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(v));
  const sym = currency === 'USD' ? '$' : t('egp');
  const neg = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  // \u2066…\u2069 بيثبت الإشارة جنب الرقم في الكتابة من اليمين للشمال
  return currency === 'USD' ? `\u2066${neg}${sym}${n}\u2069` : `\u2066${neg}${n}\u2069 ${sym}`;
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(locale(), opts).format(new Date(iso));
}
export function fmtTime(iso) {
  return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// قيمة لحقل datetime-local بتوقيت الجهاز
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function startOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString();
}
export function addDays(iso, n) {
  const x = new Date(iso); x.setDate(x.getDate() + n); return x.toISOString();
}
export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function catName(c) {
  if (!c) return '';
  return state.lang === 'en' && c.nameEn ? c.nameEn : c.nameAr;
}
export function accName(a) {
  if (!a) return '';
  return state.lang === 'en' && a.nameEn ? a.nameEn : a.name;
}
export function walletName(w) {
  if (!w) return '';
  return w.type === 'personal' ? t('personal') : w.name;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
