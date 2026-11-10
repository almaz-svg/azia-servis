import type { Dataset } from '@/core/types';

/**
 * Загруженный файл остаётся в браузере между перезагрузками (ARCHITECTURE.md, раздел 4.1).
 * Хранится только разобранный датасет, без исходного файла. Демо не сохраняем: оно генерируется кодом.
 * Все вызовы могут упасть (приватный режим, блокировка хранилища): вызывающий код это учитывает.
 */

const DB_NAME = 'synaq';
const STORE = 'kv';
const KEY = 'upload';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function storeUpload(dataset: Dataset): Promise<void> {
  await withStore('readwrite', (s) => s.put(dataset, KEY));
}

export async function loadStoredUpload(): Promise<Dataset | null> {
  const value: unknown = await withStore('readonly', (s) => s.get(KEY));
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<Dataset>;
  if (d.source !== 'upload' || !Array.isArray(d.results) || !Array.isArray(d.lessons) || typeof d.id !== 'string') {
    return null;
  }
  return d as Dataset;
}

export async function clearStoredUpload(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY));
}
