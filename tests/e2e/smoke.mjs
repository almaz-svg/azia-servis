// Сквозная проверка интерфейса в настоящем браузере (Microsoft Edge через playwright-core).
// Запуск: сначала `npm run build && npx next start -p 3100`, затем `npm run e2e`.
// Переменные: BASE_URL (по умолчанию http://localhost:3100), OUT_DIR (папка для скриншотов),
// BROWSER_CHANNEL (по умолчанию msedge; на машине без Edge укажите chrome, если он установлен).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const OUT = process.env.OUT_DIR ?? join(tmpdir(), 'synaq-e2e');
mkdirSync(OUT, { recursive: true });

const RESULTS = [];
function check(name, ok, detail = '') {
  RESULTS.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const HEADERS = [
  'Учебный год', 'Район', 'Школа', 'Тип', 'Учебник', 'Класс', 'Раздел', 'Учеников', 'СОР %', 'Входной уровень %',
];
const csvPath = (name, text) => {
  const p = join(OUT, name);
  writeFileSync(p, '﻿' + text, 'utf8');
  return p;
};
const badCsv = csvPath('bad.csv', 'Учебный год,Школа\n2025-2026,Т-01\n');
const goodCsv = csvPath(
  'good.csv',
  [HEADERS.join(','), '2025-2026,Тараз,Т-01,город,А,5А,Обыкновенные дроби,26,71,68'].join('\n') + '\n',
);

const CHANNEL = process.env.BROWSER_CHANNEL || 'msedge';
const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'ru-RU' });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  // 1. Демо открывается по умолчанию, метка видна
  await page.goto(`${BASE}/data`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.demo-badge', { timeout: 15000 });
  check('демо-данные открываются по умолчанию, метка «Демо-данные» видна', true);
  await page.screenshot({ path: join(OUT, '01-data-demo.png'), fullPage: true });

  // 2. Карта тем на 1366 px
  await page.click('a.rail-link[href="/topics"]');
  await page.waitForSelector('table.heat', { timeout: 15000 });
  const rowCount = await page.$$eval('table.heat tbody tr', (trs) => trs.length);
  const colCount = await page.$$eval('table.heat thead th', (ths) => ths.length);
  check('карта тем: 10 строк (тем)', rowCount === 10, `строк=${rowCount}`);
  check('карта тем: 20 школ + колонка тем', colCount === 21, `колонок=${colCount}`);

  const widths = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollWidth,
    docClient: document.documentElement.clientWidth,
    wrapScroll: document.querySelector('.heat-wrap').scrollWidth,
    wrapClient: document.querySelector('.heat-wrap').clientWidth,
  }));
  check('на 1366 px нет горизонтальной прокрутки страницы (F2)', widths.docScroll <= widths.docClient, JSON.stringify(widths));
  check('на 1366 px карта тем помещается без прокрутки (F2)', widths.wrapScroll <= widths.wrapClient, JSON.stringify(widths));

  // 3. Статусы — чек-лист ТЗ «Продукт»
  const statuses = await page.$$eval('table.heat tbody tr', (trs) =>
    trs.map((tr) => ({
      topic: tr.querySelector('.topic-name')?.textContent ?? '',
      status: tr.querySelector('.chip')?.textContent ?? '',
    })),
  );
  const statusOf = (topic) => statuses.find((s) => s.topic === topic)?.status;
  check('«Обыкновенные дроби» — «Проблема учебника» (ТЗ)', statusOf('Обыкновенные дроби') === 'Проблема учебника', statusOf('Обыкновенные дроби'));
  check('«Проценты» — «Проблема программы» (ТЗ)', statusOf('Проценты') === 'Проблема программы', statusOf('Проценты'));

  // 4. Подсказка «почему» с числами из расчёта
  const reasonsText = await page.textContent('.reasons');
  check(
    'подсказка «почему» показывает разницу учебников с интервалом',
    /Учебник Б слабее на \d+,\d п\.п\. при равном уровне школ/.test(reasonsText),
  );

  // 5. Двуязычность: KZ переключается, lang страницы меняется
  await page.click('button.lang-btn:has-text("KZ")');
  await page.waitForFunction(() => document.documentElement.lang === 'kk');
  const kkTitle = await page.textContent('.screen-title');
  check('переключение на KZ: заголовок и атрибут lang (F9)', kkTitle === 'Тақырыптар', kkTitle);
  await page.screenshot({ path: join(OUT, '02-topics-kk.png'), fullPage: true });
  await page.click('button.lang-btn:has-text("RU")');
  await page.waitForFunction(() => document.documentElement.lang === 'ru');

  await page.screenshot({ path: join(OUT, '03-topics-ru.png'), fullPage: true });

  // 6. Ошибки загрузки: без нужных колонок
  await page.click('a.rail-link[href="/data"]');
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.setInputFiles('input[type=file]', badCsv);
  await page.waitForSelector('.errors li', { timeout: 15000 });
  const errs = await page.$$eval('.errors li', (li) => li.map((x) => x.textContent));
  const missingLine = errs.find((e) => e.includes('нет колонок'));
  check(
    'битый файл: отсутствующие колонки перечислены одной строкой',
    errs.length === 1 && missingLine?.includes('Район') && missingLine?.includes('СОР %'),
    `строк=${errs.length}`,
  );
  await page.screenshot({ path: join(OUT, '04-data-errors.png'), fullPage: true });

  // 7. Корректный файл: загружается, переживает перезагрузку (IndexedDB)
  await page.setInputFiles('input[type=file]', goodCsv);
  await page.waitForSelector('.summary', { timeout: 15000 });
  const summary = await page.textContent('.summary p');
  check('корректный файл: сводка «Загружено»', summary.includes('Загружено'), summary);
  check('после загрузки метки «Демо-данные» нет', (await page.$('.demo-badge')) === null);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.summary', { timeout: 15000 });
  check('загруженный файл переживает перезагрузку страницы', (await page.$('.demo-badge')) === null);

  // 8. «Открыть демо-данные» не удаляет загруженный файл (он вернётся после перезагрузки)
  await page.click('button:has-text("Открыть демо-данные")');
  await page.waitForSelector('.demo-badge', { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.summary', { timeout: 15000 });
  check('«Открыть демо-данные» не удаляет сохранённый файл', (await page.$('.demo-badge')) === null);

  // 9. Очистка возвращает демо
  page.once('dialog', (d) => d.accept());
  await page.click('button:has-text("Очистить данные")');
  await page.waitForSelector('.demo-badge', { timeout: 15000 });
  check('«Очистить данные» возвращает демо-данные', true);

  if (pageErrors.length > 0) check('нет ошибок JavaScript на странице', false, pageErrors.join(' | '));
  else check('нет ошибок JavaScript на странице', true);
} catch (err) {
  check('сценарий выполнился без исключений', false, err instanceof Error ? err.message : String(err));
  await page.screenshot({ path: join(OUT, 'failure.png'), fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

const failed = RESULTS.filter((r) => !r.ok).length;
console.log(`\n${RESULTS.length - failed}/${RESULTS.length} проверок пройдено. Скриншоты: ${OUT}`);
process.exit(failed === 0 ? 0 : 1);
