import type { Analysis } from './analysis';
import type { AnalysisConfig } from './config';
import { predictMastery, type CurveFit } from './curve';
import { TEXTBOOKS } from './status';

/**
 * Перераспределение часов в пределах годового объёма параллели (ТЗ, «Оптимизатор часов»;
 * ARCHITECTURE.md, разделы 7.7–7.8).
 *
 * Единица — тема: среднее фактическое число часов на класс.
 * Освоение темы по модели — смесь кривых учебников с весами по числу классов, на которых подобрана кривая.
 * Сумма часов по темам не меняется. Каждая тема остаётся в пределах ±hourShiftLimitPct от исходного объёма.
 * Всё детерминировано: при равном выигрыше побеждает тема с меньшим кодом.
 */

const EPS = 1e-9;

export interface HourPart {
  fit: CurveFit;
  /** Доля классов темы, которые учатся по этому учебнику */
  weight: number;
}

export interface HourInput {
  topic: string;
  /** Исходные фактические часы: среднее по классам темы */
  baseHours: number;
  parts: HourPart[];
}

export type HourState = Record<string, number>;

export type FixedReason = 'noHours' | 'fewPoints' | 'noHourVariance' | 'noFit';

export type HourRequest =
  | { kind: 'view'; current?: HourState }
  | { kind: 'auto' }
  | { kind: 'step'; topic: string; direction: 'to' | 'from'; current: HourState };

export type StopReason = 'threshold' | 'bounds' | 'iterations' | 'none';

export type TransferBlock = 'upperBound' | 'lowerBound' | 'noDonor' | 'noRecipient' | 'unknownTopic';

export interface TransferInfo {
  from: string;
  to: string;
  /** Чистый выигрыш шага: выигрыш получателя минус потеря донора, п.п. */
  netPp: number;
}

export interface HourRow {
  topic: string;
  baseHours: number;
  hours: number;
  min: number;
  max: number;
  canUp: boolean;
  canDown: boolean;
  masteryBefore: number;
  masteryAfter: number;
  deltaPp: number;
}

export interface HourView {
  hasLessons: boolean;
  rows: HourRow[];
  /** Темы без кривой: часы по ним не двигаются, причина — для подсказки */
  fixed: Array<{ topic: string; reason: FixedReason }>;
  hours: HourState;
  /** Сумма часов по учитываемым темам; при перераспределении не меняется */
  totalHours: number;
  /** Σ(доля часов темы × Δосвоения темы), п.п. Оценка модели, не факт */
  forecastPp: number;
  stop: StopReason | null;
  steps: number;
  transfer: TransferInfo | null;
  blocked: TransferBlock | null;
}

/** Освоение темы по модели: сумма по учебникам с весами. Член с β не участвует: L = L̄ */
export function topicMastery(parts: HourPart[], hours: number): number {
  let s = 0;
  for (const p of parts) s += p.weight * predictMastery(p.fit, hours, p.fit.entryMean);
  return s;
}

function boundsMap(inputs: HourInput[], limitPct: number): Map<string, { min: number; max: number }> {
  const k = limitPct / 100;
  return new Map(
    inputs.map((i) => [i.topic, { min: i.baseHours * (1 - k), max: i.baseHours * (1 + k) }] as const),
  );
}

/** Состояние по учитываемым темам: значения из запроса или исходные часы */
function stateOf(inputs: HourInput[], given: HourState | undefined): HourState {
  const out: HourState = {};
  for (const i of inputs) out[i.topic] = given?.[i.topic] ?? i.baseHours;
  return out;
}

function sortedByCode(inputs: HourInput[]): HourInput[] {
  return [...inputs].sort((a, b) => (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : 0));
}

/** Учитываемые темы — те, для которых подобрана хотя бы одна кривая */
export function hourInputs(analysis: Analysis): { inputs: HourInput[]; fixed: HourView['fixed'] } {
  const inputs: HourInput[] = [];
  const fixed: HourView['fixed'] = [];

  for (const t of analysis.topics) {
    const fits: CurveFit[] = [];
    const failed: FixedReason[] = [];
    for (const tb of TEXTBOOKS) {
      const slot = t.curves[tb];
      if (slot.ok) fits.push(slot.fit);
      else failed.push(slot.reason);
    }
    if (fits.length === 0) {
      fixed.push({ topic: t.topic, reason: failed[0] ?? 'noHours' });
      continue;
    }

    const totalN = fits.reduce((s, f) => s + f.n, 0);
    const parts: HourPart[] = fits.map((fit) => ({ fit, weight: fit.n / totalN }));
    const baseHours = parts.reduce((s, p) => s + p.weight * p.fit.meanHours, 0);
    inputs.push({ topic: t.topic, baseHours, parts });
  }

  return { inputs, fixed };
}

interface Marginals {
  /** Выигрыш от +1 часа, п.п.; есть только у тем, которые могут вырасти */
  up: Map<string, number>;
  /** Потеря от −1 часа, п.п.; есть только у тем, которые могут уменьшиться */
  down: Map<string, number>;
}

function marginals(sorted: HourInput[], state: HourState, bounds: Map<string, { min: number; max: number }>): Marginals {
  const up = new Map<string, number>();
  const down = new Map<string, number>();
  for (const i of sorted) {
    const h = state[i.topic]!;
    const b = bounds.get(i.topic)!;
    const m = topicMastery(i.parts, h);
    if (h + 1 <= b.max + EPS) up.set(i.topic, topicMastery(i.parts, h + 1) - m);
    if (h - 1 >= b.min - EPS) down.set(i.topic, m - topicMastery(i.parts, h - 1));
  }
  return { up, down };
}

/** Лучшая пара «донор → получатель» по чистому выигрышу шага */
function bestPair(sorted: HourInput[], state: HourState, bounds: Map<string, { min: number; max: number }>): TransferInfo | null {
  const { up, down } = marginals(sorted, state, bounds);
  let best: TransferInfo | null = null;
  for (const to of sorted) {
    const gain = up.get(to.topic);
    if (gain === undefined) continue;
    for (const from of sorted) {
      if (from.topic === to.topic) continue;
      const loss = down.get(from.topic);
      if (loss === undefined) continue;
      const net = gain - loss;
      if (!best || net > best.netPp + EPS) best = { from: from.topic, to: to.topic, netPp: net };
    }
  }
  return best;
}

/**
 * Авто-перераспределение (ТЗ, F6). На каждом шаге переносим 1 час от темы с наименьшей потерей
 * к теме с наибольшим выигрышем. Останавливаемся, когда чистый выигрыш шага меньше hourStepGainPp.
 */
export function optimize(
  inputs: HourInput[],
  start: HourState,
  cfg: AnalysisConfig,
): { hours: HourState; steps: TransferInfo[]; stop: StopReason } {
  const state = stateOf(inputs, start);
  const steps: TransferInfo[] = [];
  if (inputs.length < 2) return { hours: state, steps, stop: 'none' };

  const sorted = sortedByCode(inputs);
  const bounds = boundsMap(inputs, cfg.hourShiftLimitPct);
  const total = inputs.reduce((s, i) => s + state[i.topic]!, 0);
  const limit = Math.ceil(20 * total); // ARCHITECTURE.md, 7.7: 20 × общий объём часов

  for (let iter = 0; iter < limit; iter++) {
    const pair = bestPair(sorted, state, bounds);
    if (!pair) return { hours: state, steps, stop: 'bounds' };
    if (pair.netPp < cfg.hourStepGainPp) return { hours: state, steps, stop: 'threshold' };
    state[pair.from]! -= 1;
    state[pair.to]! += 1;
    steps.push(pair);
  }
  return { hours: state, steps, stop: 'iterations' };
}

/**
 * Ручной шаг ±1 час (ТЗ, HourStepper). Сумма не меняется: «+» забирает час у лучшей темы-донора,
 * «−» отдаёт час лучшему получателю. Оба выбираются по тому же чистому выигрышу, что и в авто-режиме.
 */
export function transfer(
  inputs: HourInput[],
  current: HourState,
  topic: string,
  direction: 'to' | 'from',
  cfg: AnalysisConfig,
): { ok: true; hours: HourState; info: TransferInfo } | { ok: false; blocked: TransferBlock } {
  if (!inputs.some((i) => i.topic === topic)) return { ok: false, blocked: 'unknownTopic' };

  const sorted = sortedByCode(inputs);
  const bounds = boundsMap(inputs, cfg.hourShiftLimitPct);
  const state = stateOf(inputs, current);
  const { up, down } = marginals(sorted, state, bounds);

  if (direction === 'to') {
    const gain = up.get(topic);
    if (gain === undefined) return { ok: false, blocked: 'upperBound' };
    let donor: string | null = null;
    let loss = Infinity;
    for (const i of sorted) {
      const l = i.topic === topic ? undefined : down.get(i.topic);
      if (l !== undefined && l < loss - EPS) {
        loss = l;
        donor = i.topic;
      }
    }
    if (donor === null) return { ok: false, blocked: 'noDonor' };
    state[donor]! -= 1;
    state[topic]! += 1;
    return { ok: true, hours: state, info: { from: donor, to: topic, netPp: gain - loss } };
  }

  const loss = down.get(topic);
  if (loss === undefined) return { ok: false, blocked: 'lowerBound' };
  let recipient: string | null = null;
  let best = -Infinity;
  for (const i of sorted) {
    const g = i.topic === topic ? undefined : up.get(i.topic);
    if (g !== undefined && g > best + EPS) {
      best = g;
      recipient = i.topic;
    }
  }
  if (recipient === null) return { ok: false, blocked: 'noRecipient' };
  state[topic]! -= 1;
  state[recipient]! += 1;
  return { ok: true, hours: state, info: { from: topic, to: recipient, netPp: best - loss } };
}

/** Σ(доля часов темы × Δосвоения темы), п.п. Доли — по исходным часам */
export function forecastPp(inputs: HourInput[], hours: HourState): number {
  const total = inputs.reduce((s, i) => s + i.baseHours, 0);
  if (total <= 0) return 0;
  let s = 0;
  for (const i of inputs) {
    const delta = topicMastery(i.parts, hours[i.topic]!) - topicMastery(i.parts, i.baseHours);
    s += (i.baseHours / total) * delta;
  }
  return s;
}

function rowsOf(inputs: HourInput[], hours: HourState, cfg: AnalysisConfig): HourRow[] {
  const bounds = boundsMap(inputs, cfg.hourShiftLimitPct);
  return inputs.map((i) => {
    const h = hours[i.topic]!;
    const b = bounds.get(i.topic)!;
    const before = topicMastery(i.parts, i.baseHours);
    const after = topicMastery(i.parts, h);
    return {
      topic: i.topic,
      baseHours: i.baseHours,
      hours: h,
      min: b.min,
      max: b.max,
      canUp: h + 1 <= b.max + EPS,
      canDown: h - 1 >= b.min - EPS,
      masteryBefore: before,
      masteryAfter: after,
      deltaPp: after - before,
    };
  });
}

/** Единая точка входа для воркера: один запрос — один ответ, без состояния между вызовами */
export function planView(analysis: Analysis, request: HourRequest, cfg: AnalysisConfig): HourView {
  const { inputs, fixed } = hourInputs(analysis);
  const given = request.kind === 'auto' ? undefined : request.current;
  let hours = stateOf(inputs, given);
  let stop: StopReason | null = null;
  let steps = 0;
  let transferInfo: TransferInfo | null = null;
  let blocked: TransferBlock | null = null;

  if (request.kind === 'auto') {
    const r = optimize(inputs, hours, cfg);
    hours = r.hours;
    stop = r.stop;
    steps = r.steps.length;
  } else if (request.kind === 'step') {
    const r = transfer(inputs, hours, request.topic, request.direction, cfg);
    if (r.ok) {
      hours = r.hours;
      transferInfo = r.info;
    } else {
      blocked = r.blocked;
    }
  }

  return {
    hasLessons: analysis.hasLessons,
    rows: rowsOf(inputs, hours, cfg),
    fixed,
    hours,
    totalHours: inputs.reduce((s, i) => s + hours[i.topic]!, 0),
    forecastPp: forecastPp(inputs, hours),
    stop,
    steps,
    transfer: transferInfo,
    blocked,
  };
}
