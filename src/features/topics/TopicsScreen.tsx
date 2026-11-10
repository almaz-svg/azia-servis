'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/features/app/AppProvider';
import type { Analysis, ScopeFilter } from '@/core/analysis';
import { analysisClient } from '@/workers/client';
import { formatNumber, t, tp, type Lang } from '@/i18n';
import { StatusChip } from './StatusChip';
import { TopicHeatTable } from './TopicHeatTable';
import { reasonText } from './reasonText';

/**
 * Экран «Темы»: фильтры, карта тем, статусы и подсказки «почему».
 * Фильтры сужают данные до расчёта: статусы считаются по выбранной выборке.
 */

export function TopicsScreen() {
  const { lang, dataset } = useApp();
  const [scope, setScope] = useState<ScopeFilter>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const grades = useMemo(() => [...new Set(dataset?.results.map((r) => r.grade) ?? [])].sort(), [dataset]);
  const districts = useMemo(() => [...new Set(dataset?.results.map((r) => r.district) ?? [])].sort(), [dataset]);

  useEffect(() => {
    if (!dataset) return;
    let cancelled = false;
    setFailure(null);
    analysisClient()
      .analyze(dataset, scope)
      .then((a) => {
        if (!cancelled) setAnalysis(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [dataset, scope]);

  if (!dataset) return null;

  if (failure) {
    return (
      <section className="screen">
        <p className="error-line" role="alert">{t(lang, 'err.generic', { message: failure })}</p>
      </section>
    );
  }

  const topicsNeedAttention = analysis?.topics.filter((x) => x.status.code !== 'norm').length ?? 0;

  return (
    <section className="screen" aria-labelledby="topics-title">
      <h1 id="topics-title" className="screen-title">{t(lang, 'topics.title')}</h1>

      <Filters
        lang={lang}
        scope={scope}
        grades={grades}
        districts={districts}
        onChange={setScope}
      />

      {!analysis ? (
        <p className="muted">…</p>
      ) : analysis.topics.length === 0 ? (
        <p className="muted">{t(lang, 'topics.noRows')}</p>
      ) : (
        <>
          <p className="verdict-line" aria-live="polite">
            {topicsNeedAttention > 0
              ? tp(lang, 'topics.summary', topicsNeedAttention, { n: formatNumber(topicsNeedAttention) })
              : t(lang, 'topics.summary.none')}
          </p>
          <p className="muted">
            {t(lang, 'topics.scope', {
              rows: formatNumber(analysis.counts.resultRows),
              schools: formatNumber(analysis.counts.schools),
            })}
          </p>

          <div className="heat-wrap">
            <TopicHeatTable analysis={analysis} lang={lang} />
          </div>

          <h2 className="block-title">{t(lang, 'topics.reasons')}</h2>
          <ul className="reasons">
            {analysis.topics.map((topic) => (
              <li key={topic.topic} className="reason">
                <div className="reason-head">
                  <strong>{topic.topic}</strong>
                  <StatusChip code={topic.status.code} lang={lang} />
                </div>
                <ul>
                  {topic.status.reasons.map((r, i) => (
                    <li key={i}>{reasonText(r, lang)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted">
        <Link href="/data">{t(lang, 'topics.empty.cta')}</Link>
      </p>
    </section>
  );
}

function Filters({
  lang,
  scope,
  grades,
  districts,
  onChange,
}: {
  lang: Lang;
  scope: ScopeFilter;
  grades: string[];
  districts: string[];
  onChange: (next: ScopeFilter) => void;
}) {
  return (
    <form className="filters" onSubmit={(e) => e.preventDefault()}>
      <label>
        <span>{t(lang, 'topics.filter.grade')}</span>
        <select
          value={scope.grades?.[0] ?? ''}
          onChange={(e) => onChange({ ...scope, grades: e.target.value ? [e.target.value] : undefined })}
        >
          <option value="">{t(lang, 'topics.filter.all')}</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <label>
        <span>{t(lang, 'topics.filter.textbook')}</span>
        <select
          value={scope.textbook ?? ''}
          onChange={(e) => onChange({ ...scope, textbook: (e.target.value || undefined) as ScopeFilter['textbook'] })}
        >
          <option value="">{t(lang, 'topics.filter.all')}</option>
          <option value="А">{t(lang, 'textbook.a')}</option>
          <option value="Б">{t(lang, 'textbook.b')}</option>
        </select>
      </label>
      <label>
        <span>{t(lang, 'topics.filter.district')}</span>
        <select
          value={scope.district ?? ''}
          onChange={(e) => onChange({ ...scope, district: e.target.value || undefined })}
        >
          <option value="">{t(lang, 'topics.filter.all')}</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
    </form>
  );
}
