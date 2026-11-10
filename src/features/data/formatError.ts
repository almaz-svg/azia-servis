import type { AppError } from '@/core/errors';
import { t, type Lang } from '@/i18n';

/**
 * Список ошибок для экрана. Отсутствующие колонки собираются в одну строку:
 * «В листе нет колонок: Район, Тип, …» — вместо отдельной строки на каждую колонку.
 */
export function formatErrors(errors: AppError[], lang: Lang): string[] {
  const missing = errors.filter((e) => e.code === 'err.missingColumn');
  const others = errors.filter((e) => e.code !== 'err.missingColumn');
  const lines = others.map((e) => formatError(e, lang));
  if (missing.length > 0) {
    const columns = missing.map((e) => String(e.params?.column ?? '')).join(', ');
    lines.unshift(t(lang, 'err.missingColumns', { columns }));
  }
  return lines;
}

/**
 * Превращает код ошибки ядра в текст на выбранном языке.
 * Ядро не знает языка: оно отдаёт код, параметры и место. Текст строится здесь.
 */
export function formatError(e: AppError, lang: Lang): string {
  const sheet = e.where?.sheet ?? String(e.params?.sheet ?? '');
  const row = e.where?.row ?? '';
  const column = e.where?.column ?? '';

  switch (e.code) {
    case 'err.badValue': {
      const value = String(e.params?.value ?? '');
      const expected = t(lang, String(e.params?.expected ?? 'expect.filled'), {
        min: e.params?.min ?? '',
        max: e.params?.max ?? '',
      });
      return t(lang, value === '' ? 'err.badValueEmpty' : 'err.badValue', { sheet, row, column, value, expected });
    }
    case 'err.noSheet':
      return t(lang, 'err.noSheet', { sheet: String(e.params?.sheet ?? '') });
    case 'err.missingColumn':
      return t(lang, 'err.missingColumn', { column: String(e.params?.column ?? '') });
    case 'err.duplicateRow':
      return t(lang, 'err.duplicateRow', { sheet, row });
    case 'err.format':
      return t(lang, 'err.format', { ext: String(e.params?.ext ?? '') });
    case 'err.generic':
      return t(lang, 'err.generic', { message: String(e.params?.message ?? '') });
    default:
      return t(lang, e.code);
  }
}
