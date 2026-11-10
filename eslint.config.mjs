import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Правила Next.js и TypeScript плюс граница слоёв из ARCHITECTURE.md, раздел 3:
 * src/core не импортирует ничего, кроме себя. То же проверяет src/core/boundaries.test.ts.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'] },
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*', 'react', 'react-dom', 'next', 'next/*'], message: 'src/core — чистая логика: только импорты внутри core.' },
          ],
        },
      ],
    },
  },
];

export default config;
