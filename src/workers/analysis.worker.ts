import { AnalysisEngine } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** Точка входа Web Worker. Логика — в engine.ts, здесь только обмен сообщениями. */

const engine = new AnalysisEngine();
const scope = self as unknown as {
  postMessage: (message: WorkerResponse) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void) => void;
};

scope.addEventListener('message', (event) => {
  const req = event.data;
  const reply = (res: WorkerResponse) => scope.postMessage(res);

  (async () => {
    try {
      switch (req.type) {
        case 'parse':
          reply({ id: req.id, type: 'parse', result: await engine.parse(req.fileName, req.bytes) });
          break;
        case 'analyze':
          reply({ id: req.id, type: 'analyze', result: await engine.analyze(req.dataset, req.scope) });
          break;
        case 'plan':
          reply({ id: req.id, type: 'plan', result: await engine.plan(req.dataset, req.request) });
          break;
      }
    } catch (err) {
      reply({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  })();
});
