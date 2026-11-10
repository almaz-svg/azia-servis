/**
 * Коды ошибок — это ключи i18n. Worker не знает языка интерфейса:
 * он возвращает код и параметры, а текст строит UI.
 * Коды из ТЗ: err.noSheet, err.badValue, err.format, err.offline, err.trialClosed.
 * Коды, добавленные в архитектуре: err.missingColumn, err.personalData, err.duplicateRow.
 */
export const ERROR_CODES = [
  'err.noSheet',
  'err.missingColumn',
  'err.badValue',
  'err.duplicateRow',
  'err.format',
  'err.personalData',
  'err.offline',
  'err.trialClosed',
  'err.generic',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorLocation {
  sheet: string;
  row?: number;     // номер строки в файле (заголовок — строка 1)
  column?: string;  // заголовок колонки
}

export interface AppError {
  code: ErrorCode;
  params?: Record<string, string | number>;
  where?: ErrorLocation;
}
