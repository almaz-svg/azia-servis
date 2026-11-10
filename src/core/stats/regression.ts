import { dot, invert, zeros, type Matrix } from './linalg';

/**
 * Взвешенный МНК с кластеризованными стандартными ошибками (CR1).
 * Классы одной школы не независимы: если не кластеризовать по школе, интервалы выходят слишком узкими.
 * Поправка малой выборки: G/(G−1) · (n−1)/(n−k). Степени свободы для t-квантиля: G−1.
 */

export interface WlsRow {
  y: number;
  x: number[];
  w: number;
  cluster: string;
}

export type ClusteredFit =
  | { ok: true; beta: number[]; se: number[]; df: number; clusters: number }
  | { ok: false; reason: 'singular' | 'fewClusters' };

const MIN_CLUSTERS = 3;

export function clusteredWls(rows: WlsRow[]): ClusteredFit {
  const k = rows[0]?.x.length ?? 0;
  const clusterIds = new Set(rows.map((r) => r.cluster));
  const G = clusterIds.size;
  if (k === 0 || G < MIN_CLUSTERS) return { ok: false, reason: 'fewClusters' };

  // X'WX и X'Wy
  const xtwx = zeros(k, k);
  const xtwy: number[] = new Array<number>(k).fill(0);
  for (const r of rows) {
    for (let i = 0; i < k; i++) {
      xtwy[i]! += r.w * r.x[i]! * r.y;
      for (let j = 0; j < k; j++) {
        xtwx[i]![j]! += r.w * r.x[i]! * r.x[j]!;
      }
    }
  }

  const bread = invert(xtwx);
  if (!bread) return { ok: false, reason: 'singular' };

  const beta = bread.map((row) => dot(row, xtwy));

  // Оценка (score) по каждому кластеру: сумма w·x·e внутри кластера
  const scores = new Map<string, number[]>();
  for (const r of rows) {
    const e = r.y - dot(r.x, beta);
    const s = scores.get(r.cluster) ?? new Array<number>(k).fill(0);
    for (let i = 0; i < k; i++) s[i]! += r.w * r.x[i]! * e;
    scores.set(r.cluster, s);
  }

  // Мясо: сумма s·s' по кластерам
  const meat: Matrix = zeros(k, k);
  for (const s of scores.values()) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        meat[i]![j]! += s[i]! * s[j]!;
      }
    }
  }

  const n = rows.length;
  const correction = (G / (G - 1)) * ((n - 1) / (n - k));

  // V = c · bread · meat · bread; диагональ даёт дисперсии коэффициентов
  const se: number[] = [];
  for (let i = 0; i < k; i++) {
    let v = 0;
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) {
        v += bread[i]![a]! * meat[a]![b]! * bread[b]![i]!;
      }
    }
    se.push(Math.sqrt(Math.max(0, v * correction)));
  }

  return { ok: true, beta, se, df: G - 1, clusters: G };
}
