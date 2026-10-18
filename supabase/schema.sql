-- ==============================================================================
-- FAMILY HABITS — SUPABASE DATABASE SCHEMA
-- Target Database: https://twvqvutrcobedvuhnzxq.supabase.co
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Drop existing tables if recreating (safe start)
-- drop table if exists public.habit_completions cascade;
-- drop table if exists public.habits cascade;
-- drop table if exists public.family_members cascade;

-- 3. Create family_members table
create table if not exists public.family_members (
    id uuid default uuid_generate_v4() primary key,
    name text not null unique,
    avatar text not null default '⭐',
    color text not null default '#4cc9f0',
    role text not null default 'member' check (role in ('kid', 'parent', 'member')),
    display_order integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create habits table (covers both chores and goals)
create table if not exists public.habits (
    id uuid default uuid_generate_v4() primary key,
    member_name text not null references public.family_members(name) on update cascade on delete cascade,
    name text not null,
    description text,
    emoji text not null default '✨',
    type text not null default 'chore' check (type in ('chore', 'goal')),
    target_frequency text not null default 'daily' check (target_frequency in ('daily', 'x_days_week', 'x_days_month')),
    target_count integer not null default 7,
    is_active boolean not null default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Create habit_completions table (logs every completed habit by date)
create table if not exists public.habit_completions (
    id uuid default uuid_generate_v4() primary key,
    habit_id uuid not null references public.habits(id) on delete cascade,
    member_name text not null,
    completed_date date not null default current_date,
    completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
    notes text,
    cheer_emoji text default '😊',
    constraint uq_habit_date unique (habit_id, completed_date)
);

-- 6. Create family_reflections table (Sunday night weekly family reflections/journal)
create table if not exists public.family_reflections (
    id uuid default uuid_generate_v4() primary key,
    week_start_date date not null unique,
    reflection_text text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Enable Row Level Security (RLS)
alter table public.family_members enable row level security;
alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;
alter table public.family_reflections enable row level security;

-- 8. RLS Policies: Authenticated users have full access to family tables
create policy "Authenticated can read family_members"
on public.family_members for select to authenticated using (true);

create policy "Authenticated can read family_reflections"
on public.family_reflections for select to authenticated using (true);

create policy "Authenticated can manage family_reflections"
on public.family_reflections for all to authenticated using (true);

create policy "Authenticated can manage family_members"
on public.family_members for all to authenticated using (true);

create policy "Authenticated can read habits"
on public.habits for select to authenticated using (true);

create policy "Authenticated can manage habits"
on public.habits for all to authenticated using (true);

create policy "Authenticated can read habit_completions"
on public.habit_completions for select to authenticated using (true);

create policy "Authenticated can manage habit_completions"
on public.habit_completions for all to authenticated using (true);

-- (Optional) If you want public read/write for local testing without login, you can uncomment:
-- create policy "Anon can read family_members" on public.family_members for select to anon using (true);
-- create policy "Anon can read habits" on public.habits for select to anon using (true);
-- create policy "Anon can read habit_completions" on public.habit_completions for select to anon using (true);

-- 8. Seed Initial Family Members
insert into public.family_members (name, avatar, color, role, display_order)
values
    ('Athena', '🦄', '#ff6b9d', 'kid', 1),
    ('Felix',  '🦊', '#6bd8a0', 'kid', 2),
    ('Ying',   '🌸', '#ffd23f', 'parent', 3),
    ('Jimmy',  '☕', '#4cc9f0', 'parent', 4)
on conflict (name) do nothing;

-- 9. Seed Initial Habits & Goals (Customized for Jimmy's Family)
insert into public.habits (member_name, name, description, emoji, type, target_frequency, target_count)
values
    -- Athena
    ('Athena', 'Brush Teeth (Morning & Night)', '7 days a week', '🪥', 'chore', 'daily', 7),
    ('Athena', 'Clean Table', '1 time per week', '🍽️', 'chore', 'x_days_week', 1),
    ('Athena', 'Piano Practice', '2 days per week', '🎹', 'goal', 'x_days_week', 2),
    ('Athena', 'Good Listener', '7 days a week', '👂', 'goal', 'daily', 7),
    ('Athena', 'Run 10 Laps (Running Club)', 'Running club training', '🏃‍♀️', 'goal', 'x_days_week', 1),

    -- Felix
    ('Felix',  'Brush Teeth (Morning & Night)', '7 days a week', '🪥', 'chore', 'daily', 7),
    ('Felix',  'Don''t Suck Thumb', '3 days a week habit challenge', '👍', 'goal', 'x_days_week', 3),
    ('Felix',  'No Hitting Friends (Be Kind)', '7 days a week', '🤝', 'goal', 'daily', 7),

    -- Jimmy
    ('Jimmy',  'Clean Rickon Poop', '3 times per week', '🐕', 'chore', 'x_days_week', 3),
    ('Jimmy',  'Vacuum House', '1 time per week', '🧹', 'chore', 'x_days_week', 1),
    ('Jimmy',  'Wake Up Before 7:00 AM', '5 days per week', '⏰', 'goal', 'x_days_week', 5),

    -- Ying
    ('Ying',   'Water Plants', '2 times per week', '🪴', 'chore', 'x_days_week', 2)
on conflict do nothing;

