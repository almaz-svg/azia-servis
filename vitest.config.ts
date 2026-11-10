import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    testTimeout: 30_000,
    // Пул по умолчанию падает на всех файлах в этом окружении (vitest 5.1.0, Windows, Node 24):
    // «Cannot read properties of undefined (reading 'config')». vmThreads проходит все тесты.
    pool: 'vmThreads',
  },
});
