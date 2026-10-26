-- ============================================================================
-- Habits tables as they exist in the Family project (twvqvutrcobedvuhnzxq)
-- Snapshot taken 2026-10-24 from the live database. Re-runnable.
--
-- Data is NOT included. This file only describes structure and access.
--
-- Not in the live project (defined in the older ShimmyAI copy of the habit
-- schema, but never created here): public.family_reflections. app.js still
-- queries it and the Supabase Diagnostics panel checks it; the app falls back
-- to localStorage for weekly reflections, so they are not shared between devices.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- family_members: the roster (kids, parents, other members)
-- ----------------------------------------------------------------------------
create table if not exists public.family_members (
    id            uuid primary key default uuid_generate_v4(),
    name          text not null unique,
    avatar        text not null default '⭐',
    color         text not null default '#4cc9f0',
    role          text not null default 'member'
                  check (role in ('kid', 'parent', 'member')),
    display_order integer default 0,
    created_at    timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- habits: chores and goals per member
-- ----------------------------------------------------------------------------
create table if not exists public.habits (
    id                uuid primary key default uuid_generate_v4(),
    member_name       text not null
                      references public.family_members (name) on update cascade on delete cascade,
    name              text not null,
    description       text,
    emoji             text not null default '✨',
    type              text not null default 'chore' check (type in ('chore', 'goal', 'bonus')),
    target_frequency  text not null default 'daily'
                      check (target_frequency in ('daily', 'x_days_week', 'x_days_month')),
    target_count      integer not null default 7,
    is_active         boolean not null default true,
    created_at        timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- habit_completions: one row per habit per day
-- ----------------------------------------------------------------------------
create table if not exists public.habit_completions (
    id              uuid primary key default uuid_generate_v4(),
    habit_id        uuid not null references public.habits (id) on delete cascade,
    member_name     text not null,
    completed_date  date not null default current_date,
    completed_at    timestamptz not null default timezone('utc', now()),
    notes           text,
    cheer_emoji     text default '😊',
    constraint uq_habit_date unique (habit_id, completed_date)
);

-- ----------------------------------------------------------------------------
-- Row Level Security: signed-in users only, full access (single family).
-- Anonymous users get nothing.
-- ----------------------------------------------------------------------------
alter table public.family_members    enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_completions enable row level security;

drop policy if exists "Authenticated can read family_members" on public.family_members;
create policy "Authenticated can read family_members"
    on public.family_members for select to authenticated using (true);

drop policy if exists "Authenticated can manage family_members" on public.family_members;
create policy "Authenticated can manage family_members"
    on public.family_members for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated can read habits" on public.habits;
create policy "Authenticated can read habits"
    on public.habits for select to authenticated using (true);

drop policy if exists "Authenticated can manage habits" on public.habits;
create policy "Authenticated can manage habits"
    on public.habits for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated can read habit_completions" on public.habit_completions;
create policy "Authenticated can read habit_completions"
    on public.habit_completions for select to authenticated using (true);

drop policy if exists "Authenticated can manage habit_completions" on public.habit_completions;
create policy "Authenticated can manage habit_completions"
    on public.habit_completions for all to authenticated using (true) with check (true);

revoke all on public.family_members, public.habits, public.habit_completions from anon;
