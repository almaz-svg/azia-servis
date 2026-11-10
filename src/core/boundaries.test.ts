import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Правило слоёв из ARCHITECTURE.md (раздел 3): core ← workers ← features ← app.
 * Ядро импортирует только собственные файлы (относительные пути внутри src/core).
 * Ни React, ни Next, ни SheetJS, ни другие слои. Это проверка тестом, а не ESLint.
 */

const CORE_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function importsOf(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      if (m[1]) specs.push(m[1]);
    }
  }
  return specs;
}

describe('границы слоёв', () => {
  it('src/core импортирует только файлы внутри src/core', () => {
    // Тесты импортируют vitest и node; правило касается рабочего кода
    const files = walk(CORE_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const spec of importsOf(source)) {
        const isRelative = spec.startsWith('./') || spec.startsWith('../');
        const target = isRelative ? resolve(dirname(file), spec) : null;
        const inside = target !== null && (target === CORE_DIR || target.startsWith(CORE_DIR + sep));
        if (!inside) violations.push(`${file.slice(CORE_DIR.length)} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
