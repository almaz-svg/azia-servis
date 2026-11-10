'use client';

import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import { useApp } from '@/features/app/AppProvider';
import type { AppError } from '@/core/errors';
import { writeTemplate } from '@/data/workbook';
import { analysisClient } from '@/workers/client';
import { formatNumber, t } from '@/i18n';
import { formatErrors } from './formatError';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBytes(bytes: ArrayBuffer, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DataScreen() {
  const { lang, dataset, setUpload, showDemo, resetToDemo } = useApp();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<AppError[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErrors([]);
    try {
      const r = await analysisClient().parse(file);
      if (r.ok) setUpload(r.dataset);
      else setErrors(r.errors);
    } catch (err) {
      setErrors([{ code: 'err.generic', params: { message: err instanceof Error ? err.message : String(err) } }]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    void handleFile(e.dataTransfer.files[0]);
  }

  const schools = dataset ? new Set(dataset.results.map((r) => r.school)).size : 0;
  const rows = dataset?.results.length ?? 0;
  const isUpload = dataset?.source === 'upload';

  return (
    <section className="screen" aria-labelledby="data-title">
      <h1 id="data-title" className="screen-title">{t(lang, 'data.title')}</h1>
      <p className="lead">{t(lang, 'data.lead')}</p>

      <div
        className={`dropzone${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <p className="dropzone-text">
          {busy ? t(lang, 'data.parsing') : t(lang, 'data.drop')}
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
            {t(lang, 'data.cta')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void showDemo()}>
            {t(lang, 'data.demo')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadBytes(writeTemplate(), 'Synaq_shablon.xlsx')}
          >
            {t(lang, 'data.template')}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      {errors.length > 0 && (
        <div className="errors" role="alert">
          <h2 className="block-title">{t(lang, 'data.errors.title')}</h2>
          <ul>
            {formatErrors(errors, lang).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {dataset && (
        <div className="summary">
          <p>
            {t(lang, isUpload ? 'data.loaded' : 'data.demoLoaded', {
              schools: formatNumber(schools),
              rows: formatNumber(rows),
            })}
          </p>
          <div className="actions">
            <Link href="/topics" className="btn btn-primary">{t(lang, 'data.next')}</Link>
            {isUpload && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  if (window.confirm(t(lang, 'data.clear.confirm'))) void resetToDemo();
                }}
              >
                {t(lang, 'data.clear')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
