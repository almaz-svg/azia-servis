/**
 * Точка и усы 95%-интервала относительно нуля (ТЗ, компонент CompareBar).
 * Нуль — вертикальная линия по центру: интервал, который её пересекает, разницы не показывает.
 * При переключении поправки точка переезжает (CSS-переход), усы перерисовываются сразу.
 */
export function CompareBar({
  point,
  low,
  high,
  domain,
  label,
}: {
  point: number;
  low: number;
  high: number;
  /** Половина шкалы: от −domain до +domain, п.п. */
  domain: number;
  label: string;
}) {
  const CENTER = 240;
  const HALF = 220;
  const x = (v: number) => CENTER + (Math.max(-domain, Math.min(domain, v)) / domain) * HALF;

  return (
    <svg className="cmp-bar" viewBox="0 0 480 40" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <line x1="20" x2="460" y1="20" y2="20" className="cmp-track" />
      <line x1={CENTER} x2={CENTER} y1="4" y2="36" className="cmp-zero" />
      <line x1={x(low)} x2={x(high)} y1="20" y2="20" className="cmp-whisker" />
      <line x1={x(low)} x2={x(low)} y1="13" y2="27" className="cmp-whisker" />
      <line x1={x(high)} x2={x(high)} y1="13" y2="27" className="cmp-whisker" />
      <g className="cmp-dot-wrap" style={{ transform: `translateX(${x(point) - CENTER}px)` }}>
        <circle cx={CENTER} cy="20" r="6" className="cmp-dot" />
      </g>
    </svg>
  );
}
