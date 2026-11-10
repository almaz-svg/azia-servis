import type { Analysis, ScopeFilter } from '@/core/analysis';
import type { AppError } from '@/core/errors';
import type { HourRequest, HourView } from '@/core/hours';
import type { Dataset } from '@/core/types';

/**
 * Протокол между главным потоком и Web Worker (ARCHITECTURE.md, раздел 6.1).
 * Каждый запрос имеет id; ответ с тем же id закрывает промис на стороне клиента.
 */

export type WorkerRequest =
  | { id: number; type: 'parse'; fileName: string; bytes: ArrayBuffer }
  | { id: number; type: 'analyze'; dataset: Dataset; scope: ScopeFilter }
  | { id: number; type: 'plan'; dataset: Dataset; request: HourRequest };

export type ParseResult =
  | { ok: true; dataset: Dataset }
  | { ok: false; errors: AppError[] };

export type WorkerResponse =
  | { id: number; type: 'parse'; result: ParseResult }
  | { id: number; type: 'analyze'; result: Analysis }
  | { id: number; type: 'plan'; result: HourView }
  | { id: number; type: 'error'; message: string };
