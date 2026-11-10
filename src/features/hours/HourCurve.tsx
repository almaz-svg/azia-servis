import { predictMastery, type CurvePoint } from '@/core/curve';
import type { CurveSlot } from '@/core/analysis';
import { TEXTBOOKS } from '@/core/status';
import type { Textbook } from '@/core/types';

/**
 * График «цена часа» (ТЗ, HourCurve): точки классов, кривые учебников и линия цели.
 * Сплошная часть кривой — в пределах наблюдённых часов, пунктир — экстраполяция.
 * Сетка — клетка 8 px (CSS .curve-wrap).
 */

const W = 640;
const H = 320;
const PL = 44;
const PR = 16;
const PT = 16;
const PB = 36;
const PLOT_W = W - PL - PR;
const PLOT_H = H - PT - PB;
const SAMPLES = 120;

const cls = (tb: Textbook) => (tb === 'А' ? 'a' : 'b');

function niceMax(v: number): number {
  return Math.ceil(v / 10) * 10;
}

export function HourCurve({
  points,
  slots,
  target,
  ariaLabel,
}: {
  points: Record<Textbook, CurvePoint[]>;
  slots: Record<Textbook, CurveSlot>;
  target: number;
  ariaLabel: string;
}) {
  const fits = TEXTBOOKS.flatMap((tb) => {
    const s = slots[tb];
    return s.ok ? [{ tb, fit: s.fit }] : [];
  });

  const observed = TEXTBOOKS.flatMap((tb) => points[tb].map((p) => p.hours));
  const reach = fits.flatMap((f) => (f.fit.h70 !== null ? [f.fit.h70] : []));
  const xMax = niceMax(Math.max(10, ...observed, ...fits.map((f) => f.fit.hoursMax), ...reach) * 1.1);

  const x = (h: number) => PL + (h / xMax) * PLOT_W;
  const y = (m: number) => PT + (1 - Math.max(0, Math.min(100, m)) / 100) * PLOT_H;
  const tickStep = xMax <= 40 ? 5 : xMax <= 100 ? 10 : 20;
  const ticks: number[] = [];
  for (let h = 0; h <= xMax; h += tickStep) ticks.push(h);

  const curves = fits.map(({ tb, fit }) => {
    const solid: string[] = [];
    const dashed: string[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const h = (xMax * i) / SAMPLES;
      const cmd = `${x(h).toFixed(1)},${y(predictMastery(fit, h, fit.entryMean)).toFixed(1)}`;
      if (h <= fit.hoursMax + 1e-9) solid.push(cmd);
      if (h >= fit.hoursMax - 1e-9) dashed.push(cmd);
    }
    return { tb, solid: `M${solid.join(' L')}`, dashed: `M${dashed.join(' L')}` };
  });

  return (
    <svg className="curve-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {[0, 20, 40, 60, 80, 100].map((m) => (
        <g key={`m${m}`}>
          <line x1={PL} x2={W - PR} y1={y(m)} y2={y(m)} className="curve-grid" />
          <text x={PL - 8} y={y(m) + 4} className="curve-tick" textAnchor="end">{m}</text>
        </g>
      ))}
      {ticks.map((h) => (
        <g key={`h${h}`}>
          <line x1={x(h)} x2={x(h)} y1={PT} y2={PT + PLOT_H} className="curve-grid curve-grid-v" />
          <text x={x(h)} y={H - PB + 18} className="curve-tick" textAnchor="middle">{h}</text>
        </g>
      ))}

      <line x1={PL} x2={W - PR} y1={y(target)} y2={y(target)} className="curve-target" />

      {fits.map(({ tb, fit }) =>
        fit.h70 !== null && fit.h70 <= xMax ? (
          <line
            key={`mark-${tb}`}
            x1={x(fit.h70)}
            x2={x(fit.h70)}
            y1={y(target)}
            y2={y(0)}
            className={`curve-mark curve-mark-${cls(tb)}`}
          />
        ) : null,
      )}

      {curves.map((c) => (
        <g key={`curve-${c.tb}`} className={`curve curve-${cls(c.tb)}`}>
          <path d={c.solid} className="curve-line" />
          <path d={c.dashed} className="curve-line curve-line-extra" />
        </g>
      ))}

      {TEXTBOOKS.flatMap((tb) =>
        points[tb].map((p, i) => (
          <circle
            key={`${tb}-${i}`}
            cx={x(p.hours)}
            cy={y(p.sorPct)}
            r={3.5}
            className={`curve-point curve-point-${cls(tb)}`}
          />
        )),
      )}
    </svg>
  );
}
