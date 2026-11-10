import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { ANALYSIS_CONFIG } from './config';
import type { CurveFit } from './curve';
import { forecastPp, hourInputs, optimize, planView, topicMastery, transfer, type HourInput, type HourState } from './hours';
import { makeDemoDataset } from '../data/demo';

const cfg = ANALYSIS_CONFIG;

function fit(over: Partial<CurveFit>): CurveFit {
  return {
    M: 80,
    tau: 10,
    beta: 0,
    entryMean: 50,
    hoursMin: 10,
    hoursMax: 40,
    meanHours: 20,
    n: 10,
    h70: null,
    h70Extrapolated: false,
    nextHourGainPp: 0,
    tauAtLimit: null,
    ...over,
  };
}

/** Три темы: t1 быстро насыщается, t2 ещё растёт, t3 между ними */
function threeTopics(): HourInput[] {
  const make = (topic: string, f: Partial<CurveFit>): HourInput => ({
    topic,
    baseHours: 20,
    parts: [{ fit: fit({ ...f, meanHours: 20 }), weight: 1 }],
  });
  return [
    make('t1', { M: 90, tau: 5 }),
    make('t2', { M: 60, tau: 50 }),
    make('t3', { M: 70, tau: 15 }),
  ];
}

const sumOf = (inputs: HourInput[], h: HourState) => inputs.reduce((s, i) => s + h[i.topic]!, 0);

describe('topicMastery', () => {
  it('одна кривая с весом 1 даёт M·(1 − e^(−h/τ))', () => {
    const parts = [{ fit: fit({ M: 80, tau: 10 }), weight: 1 }];
    expect(topicMastery(parts, 10)).toBeCloseTo(80 * (1 - Math.exp(-1)), 9);
  });

  it('смесь учебников — взвешенная сумма кривых', () => {
    const a = fit({ M: 80, tau: 10 });
    const b = fit({ M: 60, tau: 10 });
    const mixed = topicMastery([{ fit: a, weight: 0.25 }, { fit: b, weight: 0.75 }], 10);
    expect(mixed).toBeCloseTo(0.25 * topicMastery([{ fit: a, weight: 1 }], 10) + 0.75 * topicMastery([{ fit: b, weight: 1 }], 10), 9);
  });
});

describe('optimize (авто-перераспределение)', () => {
  it('сумма часов не меняется, темы остаются в пределах ±20%', () => {
    const inputs = threeTopics();
    const start: HourState = { t1: 20, t2: 20, t3: 20 };
    const r = optimize(inputs, start, cfg);
    expect(sumOf(inputs, r.hours)).toBeCloseTo(60, 9);
    for (const i of inputs) {
      expect(r.hours[i.topic]!).toBeGreaterThanOrEqual(i.baseHours * 0.8 - 1e-9);
      expect(r.hours[i.topic]!).toBeLessThanOrEqual(i.baseHours * 1.2 + 1e-9);
    }
  });

  it('часы уходят от насыщенной темы к теме с наибольшей отдачей, и суммарное освоение растёт', () => {
    // Отдача в точке 20 ч: t1 ≈ 0,33 п.п., t2 ≈ 0,80, t3 ≈ 1,23. Самая дешёвая потеря — у t1, самый большой выигрыш — у t3.
    const inputs = threeTopics();
    const before = inputs.reduce((s, i) => s + topicMastery(i.parts, i.baseHours), 0);
    const r = optimize(inputs, { t1: 20, t2: 20, t3: 20 }, cfg);
    const after = inputs.reduce((s, i) => s + topicMastery(i.parts, r.hours[i.topic]!), 0);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps[0]).toMatchObject({ from: 't1', to: 't3' });
    expect(r.hours.t1!).toBeLessThan(20);
    expect(r.hours.t3!).toBeGreaterThan(20);
    expect(after).toBeGreaterThan(before);
  });

  it('каждый шаг даёт чистый выигрыш не меньше порога, остановка — по порогу', () => {
    const r = optimize(threeTopics(), { t1: 20, t2: 20, t3: 20 }, cfg);
    expect(r.stop).toBe('threshold');
    for (const s of r.steps) expect(s.netPp).toBeGreaterThanOrEqual(cfg.hourStepGainPp);
  });

  it('одинаковые темы не переносят часы: выигрыш меньше потери, шагов нет', () => {
    const same = (topic: string): HourInput => ({ topic, baseHours: 20, parts: [{ fit: fit({ M: 70, tau: 15 }), weight: 1 }] });
    const r = optimize([same('a'), same('b')], { a: 20, b: 20 }, cfg);
    expect(r.steps).toHaveLength(0);
    expect(r.stop).toBe('threshold');
  });

  it('результат детерминирован: два запуска дают одно и то же', () => {
    const inputs = threeTopics();
    const a = optimize(inputs, { t1: 20, t2: 20, t3: 20 }, cfg);
    const b = optimize(inputs, { t1: 20, t2: 20, t3: 20 }, cfg);
    expect(b).toEqual(a);
  });

  it('одна учитываемая тема: переносить не из чего', () => {
    const r = optimize([threeTopics()[0]!], { t1: 20 }, cfg);
    expect(r.stop).toBe('none');
    expect(r.steps).toHaveLength(0);
  });
});

describe('transfer (ручной шаг ±1 час)', () => {
  it('«+» на тему забирает час у самой дешёвой темы, сумма не меняется', () => {
    const inputs = threeTopics();
    const r = transfer(inputs, { t1: 20, t2: 20, t3: 20 }, 't2', 'to', cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.to).toBe('t2');
    expect(r.info.from).toBe('t1');
    expect(r.hours.t2).toBe(21);
    expect(r.hours.t1).toBe(19);
    expect(sumOf(inputs, r.hours)).toBeCloseTo(60, 9);
  });

  it('«−» на тему отдаёт час тому, у кого выигрыш больше (t3 при 20 ч: 1,23 против 0,80 у t2)', () => {
    const r = transfer(threeTopics(), { t1: 20, t2: 20, t3: 20 }, 't1', 'from', cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.from).toBe('t1');
    expect(r.info.to).toBe('t3');
    expect(r.hours).toEqual({ t1: 19, t2: 20, t3: 21 });
  });

  it('на верхней границе +20% «+» заблокирован', () => {
    const r = transfer(threeTopics(), { t1: 20, t2: 24, t3: 20 }, 't2', 'to', cfg);
    expect(r).toEqual({ ok: false, blocked: 'upperBound' });
  });

  it('если все остальные темы на нижней границе, «+» не находит донора', () => {
    const two: HourInput[] = [
      { topic: 't1', baseHours: 20, parts: [{ fit: fit({ M: 90, tau: 5 }), weight: 1 }] },
      { topic: 't2', baseHours: 20, parts: [{ fit: fit({ M: 60, tau: 50 }), weight: 1 }] },
    ];
    const r = transfer(two, { t1: 16, t2: 20 }, 't2', 'to', cfg);
    expect(r).toEqual({ ok: false, blocked: 'noDonor' });
  });

  it('неизвестная тема — понятная ошибка, а не исключение', () => {
    expect(transfer(threeTopics(), { t1: 20 }, 'нет', 'to', cfg)).toEqual({ ok: false, blocked: 'unknownTopic' });
  });
});

describe('planView и прогноз', () => {
  it('прогноз без изменений часов равен нулю', () => {
    const inputs = threeTopics();
    expect(forecastPp(inputs, { t1: 20, t2: 20, t3: 20 })).toBeCloseTo(0, 9);
  });

  it('демо-данные: учитываемые темы — все 10, сумма часов сохраняется при авто-перераспределении', async () => {
    const analysis = analyze(await makeDemoDataset(), cfg);
    const { inputs, fixed } = hourInputs(analysis);
    expect(fixed).toEqual([]);
    expect(inputs).toHaveLength(10);

    const view = planView(analysis, { kind: 'auto' }, cfg);
    const base = inputs.reduce((s, i) => s + i.baseHours, 0);
    expect(view.totalHours).toBeCloseTo(base, 6);
    expect(view.stop).not.toBeNull();
    for (const row of view.rows) {
      expect(row.hours).toBeGreaterThanOrEqual(row.min - 1e-9);
      expect(row.hours).toBeLessThanOrEqual(row.max + 1e-9);
    }
  });

  it('демо-данные: view без изменений возвращает исходные часы и нулевой прогноз', async () => {
    const analysis = analyze(await makeDemoDataset(), cfg);
    const view = planView(analysis, { kind: 'view' }, cfg);
    expect(view.forecastPp).toBeCloseTo(0, 9);
    expect(view.steps).toBe(0);
    expect(view.rows.every((r) => Math.abs(r.deltaPp) < 1e-9)).toBe(true);
  });

  it('демо-данные: шаг вручную из авто-результата сохраняет сумму', async () => {
    const analysis = analyze(await makeDemoDataset(), cfg);
    const auto = planView(analysis, { kind: 'auto' }, cfg);
    const topic = auto.rows[0]!.topic;
    const step = planView(analysis, { kind: 'step', topic, direction: 'to', current: auto.hours }, cfg);
    if (step.blocked) return; // граница +20% — допустимый исход, проверяется в отдельном тесте
    expect(step.totalHours).toBeCloseTo(auto.totalHours, 6);
  });
});
