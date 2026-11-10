'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Dataset } from '@/core/types';
import { makeDemoDataset } from '@/data/demo';
import { clearStoredUpload, loadStoredUpload, storeUpload } from '@/data/store';
import { DEFAULT_LANG, type Lang } from '@/i18n';

/**
 * Общее состояние приложения: язык, текущий датасет, демо как режим по умолчанию.
 * ТЗ: на защите приложение открывается сразу с демо-данными, а не с пустым экраном.
 */

const LANG_KEY = 'synaq.lang';

interface AppState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  dataset: Dataset | null;
  setUpload: (dataset: Dataset) => void;
  /** Показать демо, сохранённый файл при этом остаётся */
  showDemo: () => Promise<void>;
  /** Удалить сохранённый файл и показать демо */
  resetToDemo: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

/**
 * Язык — внешнее хранилище (localStorage), React читает его через useSyncExternalStore.
 * memoryLang держит выбор на сессию, если localStorage недоступен (приватный режим).
 */
let memoryLang: Lang | null = null;
const langListeners = new Set<() => void>();

function readLang(): Lang {
  if (memoryLang) return memoryLang;
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === 'kk' || v === 'ru' ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function subscribeLang(listener: () => void): () => void {
  langListeners.add(listener);
  return () => langListeners.delete(listener);
}

function writeLang(next: Lang): void {
  memoryLang = next;
  try {
    window.localStorage.setItem(LANG_KEY, next);
  } catch {
    // Приватный режим: язык останется на сессию
  }
  for (const listener of langListeners) listener();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => DEFAULT_LANG);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadStoredUpload().catch(() => null);
      const initial = stored ?? (await makeDemoDataset());
      if (!cancelled) setDataset(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ТЗ: атрибут lang страницы меняется вместе с языком интерфейса
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => writeLang(next), []);

  const setUpload = useCallback((next: Dataset) => {
    setDataset(next);
    void storeUpload(next).catch(() => {
      // Без IndexedDB датасет живёт до перезагрузки; экран это не блокирует
    });
  }, []);

  const showDemo = useCallback(async () => {
    setDataset(await makeDemoDataset());
  }, []);

  const resetToDemo = useCallback(async () => {
    await clearStoredUpload().catch(() => undefined);
    setDataset(await makeDemoDataset());
  }, []);

  const value = useMemo<AppState>(
    () => ({ lang, setLang, dataset, setUpload, showDemo, resetToDemo }),
    [lang, setLang, dataset, setUpload, showDemo, resetToDemo],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp вне AppProvider');
  return ctx;
}
