'use client';

import { useState } from 'react';
import type { Analysis } from '@/core/analysis';
import type { HourView } from '@/core/hours';
import { buildNoteFacts } from '@/core/note';
import { t, type Lang } from '@/i18n';
import { renderTemplateNote } from './noteText';

/**
 * Обоснование (ТЗ, F7): текст по шаблону из тех же Analysis и HourView, что рисует экран,
 * и кнопка «Скопировать обоснование». Текст виден целиком: если буфер обмена недоступен,
 * его можно выделить и скопировать вручную.
 */
export function NotePanel({ lang, analysis, view }: { lang: Lang; analysis: Analysis; view: HourView }) {
  const text = renderTemplateNote(lang, buildNoteFacts(analysis, view));
  // Статус относится к конкретному тексту: после шага ±1 час или смены языка он сбрасывается сам
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const status = result?.text === text ? result : null;

  const copy = () => {
    copyText(text).then(
      () => setResult({ text, ok: true }),
      () => setResult({ text, ok: false }),
    );
  };

  return (
    <section className="note-panel" aria-labelledby="note-title">
      <h2 id="note-title" className="block-title">{t(lang, 'note.title')}</h2>
      <p className="muted">{t(lang, 'note.lead')}</p>
      <pre className="note-text" tabIndex={0}>{text}</pre>
      <div className="actions">
        <button type="button" className="btn" onClick={copy}>
          {t(lang, 'note.copy')}
        </button>
        <span className={status && !status.ok ? 'error-line' : 'muted'} role="status">
          {status ? t(lang, status.ok ? 'note.copied' : 'note.copyFailed') : ''}
        </span>
      </div>
    </section>
  );
}

/** Буфер обмена: современный API, а там, где он недоступен (http без localhost), — запасной способ через выделение */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Нет разрешения или документ не в фокусе: пробуем запасной способ
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}
