-- ============================================================================
-- Week history for habits, and weekly overrides.
-- Target project: twvqvutrcobedvuhnzxq ("Family")
--
-- Why: habits were edited in place, so a new target, an archived task or a
-- change of owner rewrote every past week's score. Now:
--   * habit_revisions: one row per habit per change. A change takes effect
--     from the Monday after it was made (valid_from), so earlier weeks keep
--     the values that applied then. A week is scored with the latest revision
--     whose valid_from is on or before that week's Monday.
--   * The first revision of every existing habit is seeded from its current
--     values with valid_from 2000-01-01, so today's scores do not move.
--     Targets from before this migration were overwritten and cannot be
--     recovered by this step.
--   * week_overrides: a fixed percent for one person in one week (for example
--     a week a parent has confirmed as 100%). Done/target counts still show.
--   * Access follows the habit tables: signed-in users only, no anon.
--   * Safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Revisions
-- ----------------------------------------------------------------------------
create table if not exists public.habit_revisions (
    id               uuid primary key default gen_random_uuid(),
    habit_id         uuid not null references public.habits (id) on delete cascade,
    valid_from       date not null,
    member_name      text not null
                     references public.family_members (name) on update cascade on delete cascade,
    type             text not null check (type in ('chore', 'goal', 'bonus')),
    target_frequency text not null check (target_frequency in ('daily', 'x_days_week', 'x_days_month')),
    target_count     integer not null default 0,
    is_active        boolean not null,
    created_at       timestamptz not null default timezone('utc', now()),
    constraint habit_revisions_one_per_start unique (habit_id, valid_from)
);

create index if not exists habit_revisions_habit_idx on public.habit_revisions (habit_id, valid_from);

-- Seed: the current state of every habit, valid for all past weeks.
-- Scores stay exactly as they are today. Re-running adds nothing.
insert into public.habit_revisions (habit_id, valid_from, member_name, type, target_frequency, target_count, is_active)
select h.id, date '2000-01-01', h.member_name, h.type, h.target_frequency, h.target_count, coalesce(h.is_active, true)
from public.habits h
on conflict (habit_id, valid_from) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Weekly overrides
-- ----------------------------------------------------------------------------
create table if not exists public.week_overrides (
    member_name  text not null
                 references public.family_members (name) on update cascade on delete cascade,
    week_start   date not null,
    percent      integer not null check (percent between 0 and 1000),
    note         text,
    created_at   timestamptz not null default timezone('utc', now()),
    primary key (member_name, week_start)
);

-- Parent-confirmed weeks: Athena and Felix at 100% for the two full weeks
-- since tracking started (weeks beginning 2026-10-19 and 2026-10-26).
insert into public.week_overrides (member_name, week_start, percent, note) values
    ('Athena', date '2026-10-19', 100, 'Confirmed by parent: 100%'),
    ('Athena', date '2026-10-26', 100, 'Confirmed by parent: 100%'),
    ('Felix',  date '2026-10-19', 100, 'Confirmed by parent: 100%'),
    ('Felix',  date '2026-10-26', 100, 'Confirmed by parent: 100%')
on conflict (member_name, week_start) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (same model as habits / rewards)
-- ----------------------------------------------------------------------------
alter table public.habit_revisions enable row level security;
alter table public.week_overrides  enable row level security;

drop policy if exists "Authenticated can manage habit_revisions" on public.habit_revisions;
create policy "Authenticated can manage habit_revisions"
    on public.habit_revisions for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated can manage week_overrides" on public.week_overrides;
create policy "Authenticated can manage week_overrides"
    on public.week_overrides for all to authenticated using (true) with check (true);

revoke all on public.habit_revisions, public.week_overrides from anon;

-- ----------------------------------------------------------------------------
-- 4. Register in the app table index
-- ----------------------------------------------------------------------------
insert into public.app_table_registry (app, object_name, object_type, access, description, repo) values
('habits', 'habit_revisions', 'table', 'owner', 'Dated history of each habit (owner, type, target, active). Changes start the Monday after they are made.', 'ShimmyCane/Family-Habits'),
('habits', 'week_overrides',  'table', 'owner', 'Per-person weekly percent set by a parent, used instead of the calculated score.', 'ShimmyCane/Family-Habits')
on conflict (app, object_name) do nothing;
