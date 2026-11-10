import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Проверка схемы апробации на PostgreSQL (pglite, в Node без Docker).
 * Здесь проверяется логика и права. Параллельные входы (блокировка в join_trial)
 * проверяются на настоящем Supabase в интеграционном прогоне (К3).
 */

const migration = readFileSync(
  new URL('../migrations/20261110000000_trial.sql', import.meta.url),
  'utf8',
);

let db: PGlite;

// Одна база на файл: запуск Postgres в pglite занимает секунды, поэтому не на каждый тест.
beforeAll(async () => {
  db = new PGlite();
  // Роли, которые Supabase создаёт сам
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end $$;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(migration);
}, 120_000);

// Сброс состояния перед каждым тестом. Эталон: вопрос 1 → 2, вопрос 2 → 0, вопрос 3 → 3.
// В проекте эталон задаёт методист; здесь — тестовые значения.
beforeEach(async () => {
  await db.exec(`
    truncate public.trial_answers, public.trial_members, public.trial_sessions;
    delete from public.trial_keys;
    insert into public.trial_keys (question, correct_choice) values (1, 2), (2, 0), (3, 3);
  `);
});

/** Выполняет запрос от роли anon, как это делает клиент с публичным ключом */
async function asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await db.exec('set role anon');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function newSession(): Promise<string> {
  const r = await asAnon<{ create_trial_session: string }>('select create_trial_session()');
  return r.rows[0]!.create_trial_session;
}

const device = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('создание сессии', () => {
  it('код из 6 символов без похожих на 0/O/1/I/L', async () => {
    const id = await newSession();
    expect(id).toMatch(/^[A-Z2-9]{6}$/);
    const row = await db.query<{ status: string }>(
      'select status from public.trial_sessions where id = $1', [id],
    );
    expect(row.rows[0]?.status).toBe('open');
  });

  it('коды не повторяются на сотне сессий', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(await newSession());
    expect(ids.size).toBe(100);
  });
});

describe('вход участника', () => {
  it('повторный вход того же устройства возвращает ту же группу', async () => {
    const s = await newSession();
    const first = await asAnon<{ join_trial: string }>('select join_trial($1, $2)', [s, device(1)]);
    const again = await asAnon<{ join_trial: string }>('select join_trial($1, $2)', [s, device(1)]);
    expect(again.rows[0]?.join_trial).toBe(first.rows[0]?.join_trial);
  });

  it('после 11 входов группы отличаются не больше чем на 1', async () => {
    const s = await newSession();
    for (let i = 1; i <= 11; i++) {
      await asAnon('select join_trial($1, $2)', [s, device(i)]);
    }
    const counts = await db.query<{ grp: string; n: number }>(
      `select grp, count(*)::int as n from public.trial_members
        where session_id = $1 group by grp`, [s],
    );
    const a = counts.rows.find((r) => r.grp === 'A')?.n ?? 0;
    const b = counts.rows.find((r) => r.grp === 'B')?.n ?? 0;
    expect(a + b).toBe(11);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('несуществующая сессия — ошибка session_unavailable', async () => {
    await expect(asAnon('select join_trial($1, $2)', ['ZZZZZZ', device(1)]))
      .rejects.toThrow(/session_unavailable/);
  });

  it('закрытая сессия не принимает новых участников', async () => {
    const s = await newSession();
    await db.query(`update public.trial_sessions set status = 'closed' where id = $1`, [s]);
    await expect(asAnon('select join_trial($1, $2)', [s, device(1)]))
      .rejects.toThrow(/session_unavailable/);
  });
});

describe('ответ участника', () => {
  it('ответ считается на сервере по эталону: 2 верных из 3', async () => {
    const s = await newSession();
    await asAnon('select join_trial($1, $2)', [s, device(1)]);
    await asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'ru', [2, 0, 1]]);
    const row = await db.query<{ correct: number }>(
      'select correct from public.trial_answers where session_id = $1', [s],
    );
    expect(row.rows[0]?.correct).toBe(2);
  });

  it('повторная отправка не меняет первый ответ', async () => {
    const s = await newSession();
    await asAnon('select join_trial($1, $2)', [s, device(1)]);
    await asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'kk', [2, 0, 3]]);
    await asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'kk', [0, 1, 2]]);
    const rows = await db.query<{ correct: number }>(
      'select correct from public.trial_answers where session_id = $1', [s],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.correct).toBe(3);
  });

  it('ответ без входа в сессию — not_member', async () => {
    const s = await newSession();
    await expect(asAnon('select submit_trial($1, $2, $3, $4)', [s, device(9), 'ru', [0, 0, 0]]))
      .rejects.toThrow(/not_member/);
  });

  it('неверный формат ответов отклоняется', async () => {
    const s = await newSession();
    await asAnon('select join_trial($1, $2)', [s, device(1)]);
    await expect(asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'ru', [4, 0, 0]]))
      .rejects.toThrow(/bad_choices/);
    await expect(asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'ru', [1, 1]]))
      .rejects.toThrow(/bad_choices/);
  });

  it('язык вне kk/ru отклоняется', async () => {
    const s = await newSession();
    await asAnon('select join_trial($1, $2)', [s, device(1)]);
    await expect(asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'en', [0, 0, 0]]))
      .rejects.toThrow(/bad_lang/);
  });

  it('без эталона ответы не принимаются — keys_missing', async () => {
    await db.exec('delete from public.trial_keys');
    const s = await newSession();
    await asAnon('select join_trial($1, $2)', [s, device(1)]);
    await expect(asAnon('select submit_trial($1, $2, $3, $4)', [s, device(1), 'ru', [0, 0, 0]]))
      .rejects.toThrow(/keys_missing/);
  });
});

describe('агрегаты для проектора', () => {
  it('группы меньше 5 ответов не раскрываются', async () => {
    const s = await newSession();
    for (let i = 1; i <= 3; i++) {
      await asAnon('select join_trial($1, $2)', [s, device(i)]);
      await asAnon('select submit_trial($1, $2, $3, $4)', [s, device(i), 'ru', [2, 0, 3]]);
    }
    const r = await asAnon<{ trial_stats: { groups: Record<string, { n: number; sum: number | null }> } }>(
      'select trial_stats($1)', [s],
    );
    const groups = r.rows[0]!.trial_stats.groups;
    const totalN = Object.values(groups).reduce((acc, g) => acc + g.n, 0);
    expect(totalN).toBe(3);
    for (const g of Object.values(groups)) {
      if (g.n < 5) expect(g.sum).toBeNull();
    }
  });

  it('группы не меньше 5 отдают суммы', async () => {
    const s = await newSession();
    for (let i = 1; i <= 12; i++) {
      await asAnon('select join_trial($1, $2)', [s, device(i)]);
      await asAnon('select submit_trial($1, $2, $3, $4)', [s, device(i), 'ru', [2, 0, 3]]);
    }
    const r = await asAnon<{ trial_stats: { status: string; groups: Record<string, { n: number; sum: number; sumsq: number }> } }>(
      'select trial_stats($1)', [s],
    );
    const stats = r.rows[0]!.trial_stats;
    expect(stats.status).toBe('open');
    // Все ответы верны на 3, поэтому сумма = 3 * n, сумма квадратов = 9 * n
    for (const g of Object.values(stats.groups)) {
      if (g.n >= 5) {
        expect(g.sum).toBe(3 * g.n);
        expect(g.sumsq).toBe(9 * g.n);
      }
    }
  });

  it('несуществующая сессия — ошибка', async () => {
    await expect(asAnon('select trial_stats($1)', ['ZZZZZZ'])).rejects.toThrow(/session_unavailable/);
  });
});

describe('права доступа: anon не читает и не пишет таблицы напрямую', () => {
  it('чтение ответов запрещено', async () => {
    await expect(asAnon('select * from public.trial_answers')).rejects.toThrow(/permission denied/);
  });

  it('чтение эталона запрещено', async () => {
    await expect(asAnon('select * from public.trial_keys')).rejects.toThrow(/permission denied/);
  });

  it('прямая вставка участника запрещена (нельзя выбрать группу в обход функции)', async () => {
    const s = await newSession();
    await expect(
      asAnon(
        'insert into public.trial_members (session_id, device_key, grp) values ($1, $2, $3)',
        [s, device(1), 'A'],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('прямая вставка ответа запрещена (нельзя подставить correct)', async () => {
    const s = await newSession();
    await expect(
      asAnon(
        'insert into public.trial_answers (session_id, device_key, lang, correct) values ($1, $2, $3, $4)',
        [s, device(1), 'ru', 3],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('функции не выполняются ролью authenticated (в MVP входа нет)', async () => {
    await db.exec('set role authenticated');
    try {
      await expect(db.query('select create_trial_session()')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});
