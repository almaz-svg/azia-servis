import { datasetId } from '@/core/datasetId';
import type { Dataset, LessonRow, ResultRow, SchoolType, Textbook } from '@/core/types';

/**
 * Синтетические демо-данные: 20 школ Жамбылской области под условными кодами,
 * математика 5–6 классов, 10 разделов, учебники «А» и «Б».
 * Реальные номера школ и издательства не используем (ТЗ).
 *
 * Генератор детерминирован: один seed — одинаковые строки на любой машине.
 * Все вычисления в целых числах или через Math.round, без Math.random.
 */

export const DEMO_SEED = 20261110;
export const DEMO_YEAR = '2025-2026';
export const DEMO_PLANNED_HOURS = 28;

export const DEMO_TOPICS = [
  'Натуральные числа',
  'Делимость',
  'Обыкновенные дроби',
  'Десятичные дроби',
  'Проценты',
  'Отношения и пропорции',
  'Положительные и отрицательные числа',
  'Рациональные числа',
  'Буквенные выражения',
  'Уравнения',
] as const;

export type DemoTopic = (typeof DEMO_TOPICS)[number];

const GRADES = ['5А', '5Б', '6А', '6Б'] as const;

/** Базовое освоение темы для учебника «А» и класса среднего уровня, % */
const TOPIC_BASE: Record<DemoTopic, number> = {
  'Натуральные числа': 78,
  'Делимость': 74,
  'Обыкновенные дроби': 74,
  'Десятичные дроби': 72,
  'Проценты': 52,              // ниже 60% у всех: «Проблема программы»
  'Отношения и пропорции': 70,
  'Положительные и отрицательные числа': 68,
  'Рациональные числа': 66,
  'Буквенные выражения': 70,
  'Уравнения': 72,
};

interface SchoolSpec {
  code: string;
  district: string;
  type: SchoolType;
  /** Вероятность учебника «Б» для школы: в сельских школах он чаще (ТЗ) */
  pBook: number;
}

function schoolSpecs(prefix: string, count: number, spec: Omit<SchoolSpec, 'code'>): SchoolSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    code: `${prefix}-${String(i + 1).padStart(2, '0')}`,
    ...spec,
  }));
}

const SCHOOLS: SchoolSpec[] = [
  ...schoolSpecs('Т', 8, { district: 'Тараз', type: 'город', pBook: 0.25 }),
  ...schoolSpecs('Ш', 6, { district: 'Шуский', type: 'село', pBook: 0.7 }),
  ...schoolSpecs('К', 6, { district: 'Кордайский', type: 'село', pBook: 0.5 }),
];

/** Поправка на учебник: «Б» на 10 п.п. слабее по дробям, на 1 п.п. по остальным темам (ТЗ) */
function textbookEffect(topic: DemoTopic, textbook: Textbook): number {
  if (textbook === 'А') return 0;
  return topic === 'Обыкновенные дроби' ? -10 : -1;
}

/** mulberry32: маленький детерминированный генератор; Math.imul даёт одинаковый результат везде */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed: number) {
  const next = mulberry32(seed);
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
  };
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export function generateDemoRows(seed: number = DEMO_SEED): { results: ResultRow[]; lessons: LessonRow[] } {
  const rng = createRng(seed);
  const results: ResultRow[] = [];
  const lessons: LessonRow[] = [];

  for (const school of SCHOOLS) {
    const textbook: Textbook = rng.next() < school.pBook ? 'Б' : 'А';

    for (const grade of GRADES) {
      // Входной уровень класса. Слабым классам (ниже 55) дают больше часов (ТЗ).
      const entry = rng.int(45, 75);
      const students = rng.int(16, 28);
      const weak = entry < 55;

      for (const topic of DEMO_TOPICS) {
        const extraHours = weak ? rng.int(2, 4) : 0;
        const actualHours = DEMO_PLANNED_HOURS + extraHours + rng.int(-2, 2);
        const noise = rng.int(-4, 4);

        // Освоение: база темы + входной уровень + учебник + небольшой эффект часов + шум.
        const raw =
          TOPIC_BASE[topic] +
          Math.round(0.4 * (entry - 60)) +
          textbookEffect(topic, textbook) +
          Math.round(0.6 * (actualHours - DEMO_PLANNED_HOURS)) +
          noise;

        results.push({
          year: DEMO_YEAR,
          district: school.district,
          school: school.code,
          schoolType: school.type,
          textbook,
          grade,
          topic,
          students,
          sorPct: clamp(raw, 0, 100),
          entryPct: entry,
        });

        lessons.push({
          year: DEMO_YEAR,
          school: school.code,
          grade,
          topic,
          plannedHours: DEMO_PLANNED_HOURS,
          actualHours,
        });
      }
    }
  }

  return { results, lessons };
}

export async function makeDemoDataset(): Promise<Dataset> {
  const { results, lessons } = generateDemoRows();
  return {
    id: await datasetId(results, lessons),
    source: 'demo',
    results,
    lessons,
  };
}
