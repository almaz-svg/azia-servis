-- Апробация: таблицы, функции доступа и права (ARCHITECTURE.md, раздел 6.3).
--
-- Принцип: anon не видит и не меняет таблицы напрямую. Всё идёт через четыре функции.
-- RLS включён на всех таблицах, политик для anon нет: закрыто по умолчанию.

-- ---------------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------------

create table if not exists public.trial_sessions (
  id         text primary key check (id ~ '^[A-Z2-9]{6}$'),  -- код для QR
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- Назначение группы при входе. Группа фиксируется в момент входа.
create table if not exists public.trial_members (
  session_id text not null references public.trial_sessions (id) on delete cascade,
  device_key uuid not null,
  grp        char(1) not null check (grp in ('A', 'B')),
  created_at timestamptz not null default now(),
  primary key (session_id, device_key)
);

-- Один ответ с устройства на сессию. Считается на сервере, клиент присылает только выбор.
create table if not exists public.trial_answers (
  session_id text not null,
  device_key uuid not null,
  lang       text not null check (lang in ('kk', 'ru')),
  correct    smallint not null check (correct between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (session_id, device_key),
  foreign key (session_id, device_key)
    references public.trial_members (session_id, device_key) on delete cascade
);

-- Эталонные ответы. Ни одна клиентская роль их не читает.
create table if not exists public.trial_keys (
  question       smallint primary key check (question between 1 and 3),
  correct_choice smallint not null check (correct_choice between 0 and 3)
);

alter table public.trial_sessions enable row level security;
alter table public.trial_members  enable row level security;
alter table public.trial_answers  enable row level security;
alter table public.trial_keys     enable row level security;

-- ---------------------------------------------------------------------------
-- Функции
-- ---------------------------------------------------------------------------

-- Создание сессии: короткий случайный код без похожих символов (без 0, O, 1, I, L).
create or replace function public.create_trial_session()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_id text;
  i int;
begin
  loop
    v_id := '';
    for i in 1..6 loop
      -- gen_random_uuid() — криптостойкий источник случайных байтов (PostgreSQL 13+)
      v_id := v_id || substr(
        alphabet,
        1 + (get_byte(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 0) % length(alphabet)),
        1
      );
    end loop;
    exit when not exists (select 1 from public.trial_sessions s where s.id = v_id);
  end loop;

  insert into public.trial_sessions (id) values (v_id);
  return v_id;
end $$;

-- Вход участника. Назначение группы атомарно: блокируем строку сессии,
-- поэтому параллельные входы выстраиваются в очередь и не получают одну и ту же группу.
-- Правило: в меньшую группу; при равенстве — случайно. Тогда |A − B| ≤ 1 всегда.
create or replace function public.join_trial(p_session text, p_device uuid)
returns char(1)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grp char(1);
  v_a   int;
  v_b   int;
begin
  perform 1 from public.trial_sessions s
   where s.id = p_session and s.status = 'open'
   for update;
  if not found then
    raise exception 'session_unavailable' using errcode = 'P0001';
  end if;

  -- Повторный вход того же устройства возвращает его группу
  select m.grp into v_grp
    from public.trial_members m
   where m.session_id = p_session and m.device_key = p_device;
  if found then
    return v_grp;
  end if;

  select count(*) filter (where m.grp = 'A'),
         count(*) filter (where m.grp = 'B')
    into v_a, v_b
    from public.trial_members m
   where m.session_id = p_session;

  if v_a < v_b then
    v_grp := 'A';
  elsif v_b < v_a then
    v_grp := 'B';
  elsif random() < 0.5 then
    v_grp := 'A';
  else
    v_grp := 'B';
  end if;

  insert into public.trial_members (session_id, device_key, grp)
  values (p_session, p_device, v_grp);

  return v_grp;
end $$;

-- Ответ участника. Идемпотентно: повтор не меняет первый ответ.
-- Результат участнику не показываем (ТЗ: результат — на большом экране).
create or replace function public.submit_trial(
  p_session text,
  p_device  uuid,
  p_lang    text,
  p_choices smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correct smallint;
begin
  if p_lang not in ('kk', 'ru') then
    raise exception 'bad_lang' using errcode = '22023';
  end if;

  if coalesce(array_length(p_choices, 1), 0) <> 3
     or exists (select 1 from unnest(p_choices) c where c < 0 or c > 3) then
    raise exception 'bad_choices' using errcode = '22023';
  end if;

  if (select count(*) from public.trial_keys) <> 3 then
    raise exception 'keys_missing';
  end if;

  perform 1 from public.trial_sessions s
   where s.id = p_session and s.status = 'open';
  if not found then
    raise exception 'session_unavailable' using errcode = 'P0001';
  end if;

  perform 1 from public.trial_members m
   where m.session_id = p_session and m.device_key = p_device;
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  -- Повтор: первый ответ остаётся
  if exists (
    select 1 from public.trial_answers a
     where a.session_id = p_session and a.device_key = p_device
  ) then
    return;
  end if;

  select count(*)::smallint into v_correct
    from generate_subscripts(p_choices, 1) as q(i)
    join public.trial_keys k on k.question = q.i
   where p_choices[q.i] = k.correct_choice;

  insert into public.trial_answers (session_id, device_key, lang, correct)
  values (p_session, p_device, p_lang, v_correct)
  on conflict (session_id, device_key) do nothing;
end $$;

-- Агрегаты для проектора: только суммы по группам, без отдельных ответов.
-- Группа меньше 5 ответов не раскрывается: один ответ — это сам ответ человека.
-- Порог 5 совпадает с ANALYSIS_CONFIG.trialMinGroupForStats (src/core/config.ts).
create or replace function public.trial_stats(p_session text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_status text;
  v_grp    char(1);
  v_n      int;
  v_sum    int;
  v_sumsq  int;
  v_groups jsonb := '{}'::jsonb;
  v_min    constant int := 5;
begin
  select s.status into v_status
    from public.trial_sessions s
   where s.id = p_session;
  if not found then
    raise exception 'session_unavailable' using errcode = 'P0001';
  end if;

  foreach v_grp in array array['A', 'B']::char(1)[] loop
    select count(*)::int,
           coalesce(sum(a.correct), 0)::int,
           coalesce(sum(a.correct * a.correct), 0)::int
      into v_n, v_sum, v_sumsq
      from public.trial_answers a
      join public.trial_members m
        on m.session_id = a.session_id and m.device_key = a.device_key
     where a.session_id = p_session and m.grp = v_grp;

    if v_n >= v_min then
      v_groups := v_groups || jsonb_build_object(
        v_grp, jsonb_build_object('n', v_n, 'sum', v_sum, 'sumsq', v_sumsq));
    else
      v_groups := v_groups || jsonb_build_object(
        v_grp, jsonb_build_object('n', v_n, 'sum', null, 'sumsq', null));
    end if;
  end loop;

  return jsonb_build_object('status', v_status, 'groups', v_groups);
end $$;

-- ---------------------------------------------------------------------------
-- Права: anon вызывает только функции
-- ---------------------------------------------------------------------------

revoke all on public.trial_sessions, public.trial_members,
              public.trial_answers, public.trial_keys
  from anon, authenticated;

revoke all on function public.create_trial_session() from public;
revoke all on function public.join_trial(text, uuid) from public;
revoke all on function public.submit_trial(text, uuid, text, smallint[]) from public;
revoke all on function public.trial_stats(text) from public;

grant execute on function public.create_trial_session() to anon;
grant execute on function public.join_trial(text, uuid) to anon;
grant execute on function public.submit_trial(text, uuid, text, smallint[]) to anon;
grant execute on function public.trial_stats(text) to anon;
