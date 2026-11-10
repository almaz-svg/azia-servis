import kk from './kk.json';
import ru from './ru.json';

/**
 * Локализация (ТЗ, F9). Строки только в словарях; компоненты берут текст через t() или tp().
 * Ядро возвращает ключи и числа, поэтому в Worker язык не нужен.
 */

export type Lang = 'ru' | 'kk';
export const LANGS: readonly Lang[] = ['ru', 'kk'];
export const DEFAULT_LANG: Lang = 'ru';

type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = { ru: ru as Dict, kk: kk as Dict };

type Params = Record<string, string | number>;

/** Подстановка {name}. Неизвестный параметр оставляем как есть: так ошибка видна, а не скрыта. */
export function t(lang: Lang, key: string, params: Params = {}): string {
  const raw = DICTS[lang][key] ?? DICTS[DEFAULT_LANG][key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Множественные формы. Для ru — Intl.PluralRules: one / few / many / other.
 * Для kk формы одинаковые, поэтому используется other.
 */
export function tp(lang: Lang, key: string, n: number, params: Params = {}): string {
  const category = lang === 'ru' ? new Intl.PluralRules('ru').select(n) : 'other';
  const specific = `${key}.${category}`;
  const k = specific in DICTS[lang] ? specific : `${key}.other`;
  return t(lang, k, { n, ...params });
}

const formatters = new Map<number, Intl.NumberFormat>();

/** Числа: десятичная запятая, пробел между разрядами (ТЗ, раздел «Типографика») */
export function formatNumber(value: number, digits = 0): string {
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  return f.format(value);
}

/** Число со знаком: +3,2 и −1,0 (типографский минус, как в ТЗ) */
export function formatSigned(value: number, digits = 1): string {
  // Знак берём у округлённого числа: −0,04 при одном знаке — это «0,0», а не «−0,0»
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return sign + formatNumber(Math.abs(rounded), digits);
}

/** Часы: целые — без запятой, дробные (после шагов от фактического среднего) — с одним знаком */
export function formatHours(value: number): string {
  const r = Math.round(value);
  return Math.abs(value - r) < 0.05 ? formatNumber(r) : formatNumber(value, 1);
}

/** Процент без пробела перед знаком: 70% */
export function formatPct(value: number, digits = 0): string {
  return `${formatNumber(value, digits)}%`;
}

export const dictionaryKeys = (lang: Lang): string[] => Object.keys(DICTS[lang]);
