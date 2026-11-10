import type { Analysis, ScopeFilter } from '@/core/analysis';
import type { HourRequest, HourView } from '@/core/hours';
import type { Dataset } from '@/core/types';
import type { ParseResult, WorkerRequest, WorkerResponse } from './protocol';

/**
 * Клиент Worker для главного потока: промисы поверх сообщений с id.
 * Если Worker не создался (старый браузер, блокировка), ошибка приходит явно, а не зависает.
 */

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

export class AnalysisClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
      this.worker.onerror = (event) => {
        const err = new Error(event.message || 'Worker failed');
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  private handle(res: WorkerResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.type === 'error') p.reject(new Error(res.message));
    else p.resolve(res.result);
  }

  private send<T>(req: WorkerRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (v: unknown) => void, reject });
      this.ensureWorker().postMessage(req);
    });
  }

  parse(file: File): Promise<ParseResult> {
    return file.arrayBuffer().then((bytes) =>
      this.send<ParseResult>({ id: ++this.seq, type: 'parse', fileName: file.name, bytes }),
    );
  }

  analyze(dataset: Dataset, scope: ScopeFilter): Promise<Analysis> {
    return this.send<Analysis>({ id: ++this.seq, type: 'analyze', dataset, scope });
  }

  plan(dataset: Dataset, request: HourRequest): Promise<HourView> {
    return this.send<HourView>({ id: ++this.seq, type: 'plan', dataset, request });
  }
}

let shared: AnalysisClient | null = null;

/** Один Worker на вкладку */
export function analysisClient(): AnalysisClient {
  if (!shared) shared = new AnalysisClient();
  return shared;
}
