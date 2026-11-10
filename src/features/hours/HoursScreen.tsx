'use client';

import { useEffect, useState } from 'react';
import type { Analysis, CurveSlot } from '@/core/analysis';
import { ANALYSIS_CONFIG } from '@/core/config';
import type { HourRequest, HourRow, HourView, StopReason } from '@/core/hours';
import { TEXTBOOKS } from '@/core/status';
import { useApp } from '@/features/app/AppProvider';
import { analysisClient } from '@/workers/client';
import { formatNumber, formatSigned, t, type Lang } from '@/i18n';
import { HourCurve } from './HourCurve';

/**
 * Экран «Часы» (ТЗ, F5–F6): кривая «цена часа» по теме, перераспределение в пределах годового объёма
 * и ручные шаги ±1 час. Все числа — из воркера; экран ничего не пересчитывает сам.
 * Прогноз помечен как оценка модели.
 */

const TARGET = ANALYSIS_CONFIG.targetMasteryPct;

export function HoursScreen() {
  const { lang, dataset } = useApp();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [view, setView] = useState<HourView | null>(null);
  const [topic, setTopic] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!dataset) return;
    let cancelled = false;
    setFailure(null);
    const client = analysisClient();
    Promise.all([client.analyze(dataset, {}), client.plan(dataset, { kind: 'view' })])
      .then(([a, v]) => {
        if (cancelled) return;
        setAnalysis(a);
        setView(v);
        setTopic((prev) => (a.topics.some((x) => x.topic === prev) ? prev : (a.topics[0]?.topic ?? '')));
        setNote(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [dataset]);

  if (!dataset) return null;

  const run = (request: HourRequest) => {
    setPending(true);
    analysisClient()
      .plan(dataset, request)
      .then((v) => {
        setView(v);
        setNote(noteFor(lang, v, request));
      })
      .catch((err: unknown) => setFailure(err instanceof Error ? err.message : String(err)))
      .finally(() => setPending(false));
  };

  const step = (row: string, direction: 'to' | 'from') => {
    if (!view) return;
    run({ kind: 'step', topic: row, direction, current: view.hours });
  };

  return (
    <section className="screen" aria-labelledby="hours-title">
      <h1 id="hours-title" className="screen-title">{t(lang, 'hours.title')}</h1>
      <p className="lead">{t(lang, 'hours.lead')}</p>

      {failure ? (
        <p className="error-line" role="alert">{t(lang, 'err.generic', { message: failure })}</p>
      ) : !analysis || !view ? (
        <p className="muted">…</p>
      ) : !analysis.hasLessons ? (
        <p className="muted">{t(lang, 'empty.hours')}</p>
      ) : analysis.topics.length === 0 ? (
        <p className="muted">{t(lang, 'topics.noRows')}</p>
      ) : (
        <div className="hours-layout">
          <CurvePanel lang={lang} analysis={analysis} topic={topic} onTopic={setTopic} />
          <OptimizerPanel
            lang={lang}
            view={view}
            note={note}
            pending={pending}
            onAuto={() => run({ kind: 'auto' })}
            onReset={() => run({ kind: 'view' })}
            onStep={step}
          />
        </div>
      )}
    </section>
  );
}

function CurvePanel({
  lang,
  analysis,
  topic,
  onTopic,
}: {
  lang: Lang;
  analysis: Analysis;
  topic: string;
  onTopic: (topic: string) => void;
}) {
  const ta = analysis.topics.find((x) => x.topic === topic) ?? analysis.topics[0];
  if (!ta) return null;

  const names = { А: t(lang, 'textbook.a'), Б: t(lang, 'textbook.b') };
  const lines = TEXTBOOKS.flatMap((tb) => curveLines(ta.curves[tb], names[tb], lang));
  const summary = lines.join('. ');

  return (
    <div className="hours-main">
      <label className="topic-pick">
        <span>{t(lang, 'hours.topic')}</span>
        <select value={ta.topic} onChange={(e) => onTopic(e.target.value)}>
          {analysis.topics.map((x) => (
            <option key={x.topic} value={x.topic}>{x.topic}</option>
          ))}
        </select>
      </label>

      <p className="muted">{t(lang, 'hours.curve.caption')} · {t(lang, 'hours.curve.target', { target: TARGET })}</p>
      <div className="curve-wrap">
        <HourCurve points={ta.hourPoints} slots={ta.curves} target={TARGET} ariaLabel={summary} />
      </div>

      <ul className="curve-notes">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <details className="curve-table">
        <summary>{t(lang, 'hours.curve.table')}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t(lang, 'hours.table.textbook')}</th>
              <th scope="col">{t(lang, 'hours.table.hours')}</th>
              <th scope="col">{t(lang, 'hours.table.mastery')}</th>
            </tr>
          </thead>
          <tbody>
            {TEXTBOOKS.flatMap((tb) =>
              [...ta.hourPoints[tb]]
                .sort((a, b) => a.hours - b.hours)
                .map((p, i) => (
                  <tr key={`${tb}-${i}`}>
                    <td>{names[tb]}</td>
                    <td>{formatHours(p.hours)}</td>
                    <td>{formatNumber(p.sorPct)}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function OptimizerPanel({
  lang,
  view,
  note,
  pending,
  onAuto,
  onReset,
  onStep,
}: {
  lang: Lang;
  view: HourView;
  note: string | null;
  pending: boolean;
  onAuto: () => void;
  onReset: () => void;
  onStep: (topic: string, direction: 'to' | 'from') => void;
}) {
  const canOptimize = view.rows.length >= 2;

  return (
    <aside className="hours-side">
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onAuto} disabled={pending || !canOptimize}>
          {t(lang, 'hours.optimize')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onReset} disabled={pending}>
          {t(lang, 'hours.reset')}
        </button>
      </div>

      <p className="verdict-line" aria-live="polite">
        {t(lang, 'hours.forecast', { gain: formatSigned(view.forecastPp, 2) })}
      </p>
      <p className="muted">{t(lang, 'hours.sum', { total: formatHours(view.totalHours) })}</p>
      {note && <p className="muted" aria-live="polite">{note}</p>}

      <ul className="stepper-list">
        {view.rows.map((row) => (
          <StepperRow key={row.topic} lang={lang} row={row} disabled={pending} onStep={onStep} />
        ))}
      </ul>

      {view.fixed.length > 0 && (
        <p className="muted">{t(lang, 'hours.fixed', { topics: view.fixed.map((f) => f.topic).join(', ') })}</p>
      )}
    </aside>
  );
}

function StepperRow({
  lang,
  row,
  disabled,
  onStep,
}: {
  lang: Lang;
  row: HourRow;
  disabled: boolean;
  onStep: (topic: string, direction: 'to' | 'from') => void;
}) {
  return (
    <li className="stepper-row">
      <div className="stepper-name">
        <strong>{row.topic}</strong>
        <span className="muted">
          {t(lang, 'hours.row.change', { before: formatHours(row.baseHours), after: formatHours(row.hours) })}
        </span>
        <span className="muted">
          {t(lang, 'hours.row.effect', { delta: formatSigned(row.deltaPp, 2) })}
        </span>
      </div>
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn"
          aria-label={t(lang, 'hours.aria.minus', { topic: row.topic })}
          disabled={disabled || !row.canDown}
          onClick={() => onStep(row.topic, 'from')}
        >
          −
        </button>
        <span className="stepper-value">{formatHours(row.hours)}</span>
        <button
          type="button"
          className="stepper-btn"
          aria-label={t(lang, 'hours.aria.plus', { topic: row.topic })}
          disabled={disabled || !row.canUp}
          onClick={() => onStep(row.topic, 'to')}
        >
          +
        </button>
      </div>
    </li>
  );
}

/** Строки под графиком: прогноз достижения цели и предупреждения о форме кривой */
function curveLines(slot: CurveSlot, name: string, lang: Lang): string[] {
  if (!slot.ok) {
    return [t(lang, 'hours.reason.line', { book: name, reason: t(lang, `hours.reason.${slot.reason}`) })];
  }
  const f = slot.fit;
  const out: string[] = [];
  if (f.h70 === null) {
    out.push(t(lang, 'hours.curve.noReach', { book: name, target: TARGET }));
  } else {
    const reach = t(lang, 'hours.curve.reach', { book: name, target: TARGET, h: formatNumber(Math.round(f.h70)) });
    out.push(f.h70Extrapolated ? `${reach} (${t(lang, 'hours.curve.extrapolated')})` : reach);
  }
  out.push(t(lang, 'hours.curve.next', { gain: formatNumber(f.nextHourGainPp, 1) }));
  if (f.tauAtLimit === 'low') out.push(t(lang, 'hours.curve.flat'));
  if (f.tauAtLimit === 'high') out.push(t(lang, 'hours.curve.linear'));
  return out;
}

/** Текст после действия: что передано, почему остановились или почему нельзя */
function noteFor(lang: Lang, view: HourView, request: HourRequest): string | null {
  if (request.kind === 'auto') {
    const stop = stopText(lang, view.stop);
    return [t(lang, 'hours.steps', { n: formatNumber(view.steps) }), stop].filter(Boolean).join('. ');
  }
  if (request.kind === 'step') {
    if (view.blocked) return t(lang, `hours.blocked.${view.blocked}`);
    if (view.transfer) {
      const { from, to, netPp } = view.transfer;
      const net = formatSigned(netPp, 2);
      return request.direction === 'to'
        ? t(lang, 'hours.transfer.to', { topic: from, net })
        : t(lang, 'hours.transfer.from', { topic: to, net });
    }
  }
  return null;
}

function stopText(lang: Lang, stop: StopReason | null): string {
  switch (stop) {
    case 'threshold':
      return t(lang, 'hours.stop.threshold', { threshold: formatNumber(ANALYSIS_CONFIG.hourStepGainPp, 1) });
    case 'bounds':
      return t(lang, 'hours.stop.bounds');
    case 'iterations':
      return t(lang, 'hours.stop.iterations');
    case 'none':
      return t(lang, 'hours.stop.none');
    default:
      return '';
  }
}

/** Часы: целые — без запятой, дробные (после шагов от фактического среднего) — с одним знаком */
function formatHours(v: number): string {
  const r = Math.round(v);
  return Math.abs(v - r) < 0.05 ? formatNumber(r) : formatNumber(v, 1);
}
