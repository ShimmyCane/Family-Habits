-- ============================================================================
-- Weekly task snapshots: a locked record of each task's week.
-- Target project: twvqvutrcobedvuhnzxq ("Family")
--
-- The app writes one row per task per week when the first load happens after
-- 11:30 pm on that week's Sunday. Rows are insert-only (no update or delete
-- policy), so a snapshot cannot change afterwards. Deleting a task later does
-- not remove its history, because there is no foreign key to habits.
--
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.week_task_snapshots (
    id          uuid primary key default gen_random_uuid(),
    habit_id    uuid not null,
    week_start  date not null,
    member_name text not null,
    name        text not null,
    emoji       text,
    type        text not null check (type in ('chore', 'goal', 'bonus')),
    target_frequency text,
    target      integer not null default 0 check (target >= 0),
    done        integer not null default 0 check (done >= 0),
    locked_at   timestamptz not null default timezone('utc', now()),
    constraint week_task_snapshots_one_per_task_week unique (habit_id, week_start)
);

create index if not exists week_task_snapshots_week_idx on public.week_task_snapshots (week_start, member_name);

alter table public.week_task_snapshots enable row level security;

drop policy if exists "Authenticated can read week_task_snapshots" on public.week_task_snapshots;
create policy "Authenticated can read week_task_snapshots"
    on public.week_task_snapshots for select to authenticated using (true);

drop policy if exists "Authenticated can add week_task_snapshots" on public.week_task_snapshots;
create policy "Authenticated can add week_task_snapshots"
    on public.week_task_snapshots for insert to authenticated with check (true);

-- No update or delete policy: with RLS on, those are refused for everyone signed in.
revoke all on public.week_task_snapshots from anon;
revoke update, delete on public.week_task_snapshots from authenticated;

insert into public.app_table_registry (app, object_name, object_type, access, description, repo) values
('habits', 'week_task_snapshots', 'table', 'owner', 'Locked record of each task for each week (name, target, done), written after Sunday 11:30 pm. Insert-only; survives task deletion.', 'ShimmyCane/Family-Habits')
on conflict (app, object_name) do nothing;

-- ----------------------------------------------------------------------------
-- Start dates. The first revision of each task was seeded with 2000-01-01, so a
-- task counted in weeks before it existed. Tracking started on 2026-10-01, so the
-- earliest start is 2026-10-01, and a task starts the week after it was created.
-- Runs once: it only touches rows still on the seed date.
-- ----------------------------------------------------------------------------
update public.habit_revisions r
   set valid_from = greatest(date '2026-10-01',
                             date_trunc('week', h.created_at at time zone 'America/Los_Angeles')::date + 7)
  from public.habits h
 where h.id = r.habit_id
   and r.valid_from = date '2000-01-01';
