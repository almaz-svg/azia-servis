import type { StatusCode } from '@/core/status';
import { t, type Lang } from '@/i18n';

/**
 * Статус: слово + цвет + форма (ТЗ: цвет никогда не несёт смысл в одиночку).
 * Форма: норма — круг, учебник — треугольник, программа — квадрат, мало данных — пунктирный круг.
 */
function Shape({ code }: { code: StatusCode }) {
  const common = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, focusable: false } as const;
  switch (code) {
    case 'norm':
      return (
        <svg {...common}><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>
      );
    case 'textbook':
      return (
        <svg {...common}><polygon points="6,1 11,11 1,11" fill="currentColor" /></svg>
      );
    case 'program':
      return (
        <svg {...common}><rect x="1" y="1" width="10" height="10" fill="currentColor" /></svg>
      );
    case 'lowdata':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 1.6" />
        </svg>
      );
  }
}

export function StatusChip({ code, lang }: { code: StatusCode; lang: Lang }) {
  return (
    <span className={`chip chip-${code}`}>
      <Shape code={code} />
      <span>{t(lang, `status.${code}`)}</span>
    </span>
  );
}
