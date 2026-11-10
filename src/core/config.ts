/**
 * Настройки методики. Меняются только через новую версию: версия пишется
 * в каждый экспорт и в текст обоснования, поэтому любую записку можно воспроизвести.
 * Пороги утверждает методист (ТЗ), в UI не редактируются («админка порогов — не делаем»).
 */
export interface AnalysisConfig {
  version: string;
  /** «Мало данных»: меньше классов на одном из учебников */
  minClassesPerTextbook: number;
  /** «Проблема учебника»: порог разницы с поправкой, п.п. */
  textbookGapPp: number;
  /** «Проблема программы»: освоение ниже порога на обоих учебниках, % */
  programMasteryPct: number;
  /** Целевое освоение для «часов до 70%», % */
  targetMasteryPct: number;
  /** Остановка оптимизатора: чистый выигрыш шага меньше порога, п.п. */
  hourStepGainPp: number;
  /** Ограничение переноса часов по теме, ±% от исходного объёма */
  hourShiftLimitPct: number;
  /** Апробация: минимум ответов в каждой группе для «Вывод надёжен» */
  trialMinPerGroup: number;
  /** Апробация: группы меньше этого размера не раскрываются (приватность) */
  trialMinGroupForStats: number;
}

export const ANALYSIS_CONFIG: AnalysisConfig = {
  version: '1.0.0',
  minClassesPerTextbook: 8,
  textbookGapPp: 7,
  programMasteryPct: 60,
  targetMasteryPct: 70,
  hourStepGainPp: 0.3,
  hourShiftLimitPct: 20,
  trialMinPerGroup: 20,
  trialMinGroupForStats: 5,
};
