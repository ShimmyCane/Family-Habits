-- ============================================================================
-- Rewards: pinned family rewards, the award archive, and cash-in.
-- Target project: twvqvutrcobedvuhnzxq ("Family")
--
-- Design:
--   * rewards: what can be earned. Requirements are stored as jsonb so the
--     rewards page can edit them without a join table. Two kinds:
--       habit  -> { "kind": "habit", "habit_id": "...", "min_count": 3 }
--       family -> { "kind": "family", "min_percent": 100 }
--                 (every member who has tracked tasks must reach min_percent)
--   * reward_awards: one row per earned period (the archive). A period is
--     locked in by the app once it has ended. cashed_on = null means unclaimed.
--     voided = true keeps the row for history but removes it from the dashboard.
--   * Awards never change the allowance ledger. Owed money is shown in the app
--     and paid out in the Allowances app.
--   * Access follows the habit tables: signed-in users only, no anon.
--   * rewards cannot be deleted while awards reference them (history is kept);
--     the app archives them instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rewards
-- ----------------------------------------------------------------------------
create table if not exists public.rewards (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    description      text,
    kind             text not null default 'standard'
                     check (kind in ('standard', 'extra_credit')),
    -- Who receives it. Null = the whole family.
    member_name      text
                     references public.family_members (name) on update cascade on delete cascade,
    requirements     jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(requirements) = 'array'),
    period           text not null default 'week'
                     check (period in ('week', 'month')),
    repeatable       boolean not null default true,
    -- Money the reward adds when cashed in (for example 0.50 to double a 50c allowance).
    allowance_amount numeric(12,2) not null default 0 check (allowance_amount >= 0),
    status           text not null default 'draft'
                     check (status in ('draft', 'published', 'archived')),
    pinned           boolean not null default true,
    -- Set when the reward is published. Periods that end before this are not evaluated.
    starts_on        date,
    created_at       timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- 2. Awards (the archive)
-- ----------------------------------------------------------------------------
create table if not exists public.reward_awards (
    id            uuid primary key default gen_random_uuid(),
    reward_id     uuid not null
                  references public.rewards (id) on delete restrict,
    member_name   text
                  references public.family_members (name) on update cascade on delete cascade,
    period_start  date not null,
    period_end    date not null,
    earned_on     date not null,
    units         integer not null default 1 check (units >= 1),
    source        text not null default 'auto' check (source in ('auto', 'manual')),
    note          text,
    cashed_on     date,
    voided        boolean not null default false,
    suggested_amount numeric(12,2) check (suggested_amount >= 0),
    created_at    timestamptz not null default timezone('utc', now()),
    constraint reward_awards_period_check check (period_end >= period_start)
);

create index if not exists reward_awards_reward_idx on public.reward_awards (reward_id);
create index if not exists reward_awards_member_idx on public.reward_awards (member_name, earned_on);

-- The app locks a period in once. A second device running the same check
-- gets a unique violation (23505), which the app ignores.
create unique index if not exists reward_awards_one_auto_per_period
    on public.reward_awards (reward_id, coalesce(member_name, ''), period_start)
    where source = 'auto';

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (same model as habits / allowances)
-- ----------------------------------------------------------------------------
alter table public.rewards       enable row level security;
alter table public.reward_awards enable row level security;

drop policy if exists "Authenticated can manage rewards" on public.rewards;
create policy "Authenticated can manage rewards"
    on public.rewards for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated can manage reward_awards" on public.reward_awards;
create policy "Authenticated can manage reward_awards"
    on public.reward_awards for all to authenticated using (true) with check (true);

revoke all on public.rewards, public.reward_awards from anon;

-- ----------------------------------------------------------------------------
-- 4. Register in the app table index
-- ----------------------------------------------------------------------------
insert into public.app_table_registry (app, object_name, object_type, access, description, repo) values
('habits', 'rewards',       'table', 'owner', 'Family rewards with requirements (habit or whole-family targets), pinned to the home page.', 'ShimmyCane/Family-Habits'),
('habits', 'reward_awards', 'table', 'owner', 'Archive of earned reward periods, with cashed-in and voided state. Owed money is computed in the app.', 'ShimmyCane/Family-Habits')
on conflict (app, object_name) do nothing;
