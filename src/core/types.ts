export type Textbook = 'А' | 'Б';
export type SchoolType = 'город' | 'село';

/** Лист «Результаты»: одна строка = класс × раздел × учебник */
export interface ResultRow {
  year: string;            // Учебный год, «2025-2026»
  district: string;        // Район
  school: string;          // Школа, код «Т-01»
  schoolType: SchoolType;  // Тип
  textbook: Textbook;      // Учебник
  grade: string;           // Класс, «5А»
  topic: string;           // Раздел
  students: number;        // Учеников
  sorPct: number;          // СОР %, 0–100
  entryPct: number;        // Входной уровень %, 0–100
}

/** Лист «Уроки»: одна строка = класс × раздел */
export interface LessonRow {
  year: string;
  school: string;
  grade: string;
  topic: string;
  plannedHours: number;    // Часов по плану
  actualHours: number;     // Часов по факту
}

export interface Dataset {
  /** SHA-256 нормализованного содержимого: ключ кэша расчётов и воспроизводимости экспорта */
  id: string;
  /** Управляет меткой «Демо-данные» на всех экранах и в экспорте */
  source: 'demo' | 'upload';
  results: ResultRow[];
  /** Пусто, если листа «Уроки» нет: экран «Часы» объясняет, что добавить */
  lessons: LessonRow[];
}
