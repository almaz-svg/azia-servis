import { describe, expect, it } from 'vitest';
import type { NoteFacts } from '@/core/note';
import { renderTemplateNote } from './noteText';

const facts: NoteFacts = {
  demo: true,
  configVersion: '1.0.0',
  analysisKey: 'abcdef0123456789ffff:1.0.0',
  schools: 20,
  resultRows: 800,
  topics: 10,
  textbookProblems: [{ topic: 'Обыкновенные дроби', weak: 'Б', deltaPp: -10.27, ciLow: -11.58, ciHigh: -8.96 }],
  programProblems: [{ topic: 'Проценты', mastery: { А: 51.2, Б: 50.6 } }],
  lowData: [],
  hours: {
    moves: [
      { topic: 'Проценты', before: 12, after: 14, deltaPp: 1.234 },
      { topic: 'Натуральные числа', before: 12, after: 10, deltaPp: -0.31 },
    ],
    totalHours: 120,
    forecastPp: 0.0923,
  },
};

describe('renderTemplateNote', () => {
  it('ru: числа в том же формате, что на экранах, метка демо и версия методики', () => {
    const text = renderTemplateNote('ru', facts);
    expect(text).toContain('Демо-данные');
    expect(text).toContain('учебник Б слабее на 10,3 п.п.');
    expect(text).toContain('от −11,6 до −9,0');
    expect(text).toContain('освоение 51% на учебнике А и 51% на учебнике Б');
    expect(text).toContain('«Проценты»: 12 → 14 ч, освоение +1,23 п.п.');
    expect(text).toContain('«Натуральные числа»: 12 → 10 ч, освоение −0,31 п.п.');
    expect(text).toContain('+0,09 п.п. за год');
    expect(text).toContain('оценка модели');
    expect(text).toContain('Версия методики 1.0.0, расчёт abcdef012345.');
  });

  it('в тексте не остаётся неподставленных параметров и ключей словаря', () => {
    for (const lang of ['ru', 'kk'] as const) {
      const text = renderTemplateNote(lang, facts);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).not.toMatch(/\bnote\.\w+/);
    }
  });

  it('без демо, без проблем и без изменений часов', () => {
    const text = renderTemplateNote('ru', {
      ...facts,
      demo: false,
      textbookProblems: [],
      programProblems: [],
      hours: { moves: [], totalHours: 120, forecastPp: 0 },
    });
    expect(text).not.toContain('Демо-данные');
    expect(text).toContain('Все темы в норме');
    expect(text).toContain('Часы не менялись.');
    expect(text).not.toContain('Прогноз');
  });

  it('без листа «Уроки» раздела про часы нет', () => {
    const text = renderTemplateNote('ru', { ...facts, hours: null });
    expect(text).not.toContain('Перераспределение часов');
  });
});
