'use client';

import { useEffect, useState } from 'react';
import type { Analysis, TopicAnalysis } from '@/core/analysis';
import { ciExcludesZero } from '@/core/stats/compare';
import { useApp } from '@/features/app/AppProvider';
import { reasonText } from '@/features/topics/reasonText';
import { StatusChip } from '@/features/topics/StatusChip';
import { analysisClient } from '@/workers/client';
import { formatNumber, formatSigned, t, type Lang } from '@/i18n';
import { CompareBar } from './CompareBar';

/**
 * Экран «Учебники» (ТЗ, F4): разница Б − А без поправки и с поправкой на уровень школ, 95%-интервал.
 * Переключатель меняет числа, точку на шкале и текст вывода. Статус темы считается по поправке.
 */

type Mode = 'adjusted' | 'raw';

export function TextbooksScreen() {
  const { lang, dataset } = useApp();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('adjusted');

  useEffect(() => {
    if (!dataset) return;
    let cancelled = false;
    setFailure(null);
    analysisClient()
      .analyze(dataset, {})
      .then((a) => {
        if (!cancelled) setAnalysis(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [dataset]);

  if (!dataset) return null;

  return (
    <section className="screen" aria-labelledby="textbooks-title">
      <h1 id="textbooks-title" className="screen-title">{t(lang, 'textbooks.title')}</h1>
      <p className="lead">{t(lang, 'textbooks.lead')}</p>

      {failure ? (
        <p className="error-line" role="alert">{t(lang, 'err.generic', { message: failure })}</p>
      ) : !analysis ? (
        <p className="muted">…</p>
      ) : (
        <Comparisons analysis={analysis} lang={lang} mode={mode} onMode={setMode} />
      )}
    </section>
  );
}

function Comparisons({
  analysis,
  lang,
  mode,
  onMode,
}: {
  analysis: Analysis;
  lang: Lang;
  mode: Mode;
  onMode: (mode: Mode) => void;
}) {
  const topics = analysis.topics;
  if (topics.length === 0) return <p className="muted">{t(lang, 'textbooks.noRows')}</p>;

  const comparable = topics.filter((x) => x.comparison !== null);
  const reliable = comparable.filter((x) => {
    const ci = intervalOf(x, mode);
    return ci !== null && ciExcludesZero({ ciLow: ci.low, ciHigh: ci.high });
  }).length;
  const domain = domainOf(topics);

  return (
    <>
      <div className="seg-toggle" role="group" aria-label={t(lang, 'textbooks.mode.label')}>
        <button
          type="button"
          className="seg-btn"
          aria-pressed={mode === 'adjusted'}
          onClick={() => onMode('adjusted')}
        >
          {t(lang, 'textbooks.mode.adjusted')}
        </button>
        <button type="button" className="seg-btn" aria-pressed={mode === 'raw'} onClick={() => onMode('raw')}>
          {t(lang, 'textbooks.mode.raw')}
        </button>
      </div>

      {comparable.length === 0 ? (
        <p className="muted">{t(lang, 'empty.textbooks')}</p>
      ) : (
        <p className="verdict-line" aria-live="polite">
          {t(lang, 'textbooks.summary', { n: formatNumber(reliable), total: formatNumber(comparable.length) })}
        </p>
      )}

      <p className="muted">{t(lang, 'textbooks.axis')}</p>

      <ul className="cmp-list">
        {topics.map((topic) => (
          <TopicCompare key={topic.topic} topic={topic} lang={lang} mode={mode} domain={domain} />
        ))}
      </ul>
    </>
  );
}

function TopicCompare({
  topic,
  lang,
  mode,
  domain,
}: {
  topic: TopicAnalysis;
  lang: Lang;
  mode: Mode;
  domain: number;
}) {
  const head = (
    <div className="cmp-head">
      <strong>{topic.topic}</strong>
      <StatusChip code={topic.status.code} lang={lang} />
    </div>
  );

  const c = topic.comparison;
  if (!c) {
    return (
      <li className="cmp-row">
        {head}
        <p className="muted">
          {topic.comparisonSkip
            ? reasonText({ key: 'why.noComparison', params: { reason: topic.comparisonSkip } }, lang)
            : t(lang, 'textbooks.noRows')}
        </p>
      </li>
    );
  }

  const ci = intervalOf(topic, mode);
  const point = mode === 'adjusted' ? c.deltaPp : c.rawDeltaPp;
  const sure = ci !== null && ciExcludesZero({ ciLow: ci.low, ciHigh: ci.high });

  // Без интервала вывод не делаем: точку без погрешности не называем разницей
  const verdict = ci === null
    ? null
    : !sure
      ? t(lang, 'textbooks.verdict.noDiff')
      : point < 0
        ? t(lang, 'textbooks.verdict.weaker', { delta: formatNumber(Math.abs(point), 1) })
        : t(lang, 'textbooks.verdict.stronger', { delta: formatNumber(point, 1) });

  const interval = ci
    ? t(lang, 'textbooks.interval', {
        delta: formatSigned(point),
        low: formatSigned(ci.low),
        high: formatSigned(ci.high),
      })
    : null;

  return (
    <li className="cmp-row">
      {head}
      {ci && (
        <CompareBar point={point} low={ci.low} high={ci.high} domain={domain} label={`${verdict ?? ''}. ${interval ?? ''}`} />
      )}
      {verdict && <p className={sure ? 'cmp-verdict is-sure' : 'cmp-verdict'}>{verdict}</p>}
      {interval && <p className="muted cmp-interval">{interval}</p>}
    </li>
  );
}

/** Интервал выбранного режима; null, если его не удалось посчитать или сравнения нет */
function intervalOf(topic: TopicAnalysis, mode: Mode): { low: number; high: number } | null {
  const c = topic.comparison;
  if (!c) return null;
  if (mode === 'adjusted') return { low: c.ciLow, high: c.ciHigh };
  if (c.rawCiLow === null || c.rawCiHigh === null) return null;
  return { low: c.rawCiLow, high: c.rawCiHigh };
}

/** Общая шкала для всех строк и обоих режимов: точка переезжает, а не масштаб */
function domainOf(topics: TopicAnalysis[]): number {
  let max = 5;
  for (const x of topics) {
    const c = x.comparison;
    if (!c) continue;
    for (const v of [c.deltaPp, c.ciLow, c.ciHigh, c.rawDeltaPp, c.rawCiLow, c.rawCiHigh]) {
      if (v !== null && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
    }
  }
  return Math.ceil(max / 5) * 5;
}
