-- ============================================================================
-- App table registry for the Family Supabase project (twvqvutrcobedvuhnzxq)
--
-- One shared project hosts several apps (habits, allowances, ...). This table
-- is the index of which app uses which database object, so you can answer
-- "what breaks if I change X?" and spot tables nobody has claimed.
--
-- Applied 2026-10-23. Re-runnable: create statements are guarded and the
-- seed inserts skip rows that already exist.
-- Generic template for new projects: ShimmyAI / 04 AI / Supabase Registry.
-- ============================================================================

create table if not exists public.app_table_registry (
    id           uuid primary key default gen_random_uuid(),
    app          text not null,                       -- short slug: 'habits', 'allowances', ...
    object_name  text not null,                       -- table, view or function name in public
    object_type  text not null check (object_type in ('table', 'view', 'function')),
    access       text not null default 'owner'
                 check (access in ('owner', 'reads')), -- owner defines/writes it; reads only reads another app's object
    description  text,
    repo         text,
    created_at   timestamptz not null default timezone('utc', now()),
    unique (app, object_name)
);

comment on table public.app_table_registry is
    'Index of which app uses which database object. owner = the app defines/writes it; reads = the app only reads a table another app owns. Check public.app_table_unregistered for anything missing.';

alter table public.app_table_registry enable row level security;

drop policy if exists "Authenticated can manage app_table_registry" on public.app_table_registry;
create policy "Authenticated can manage app_table_registry"
    on public.app_table_registry for all to authenticated using (true) with check (true);

revoke all on public.app_table_registry from anon;

-- Anything in public that is not listed in the registry. Should be empty once
-- every app has registered its objects.
create or replace view public.app_table_unregistered
with (security_invoker = true) as
select
    c.relname::text as object_name,
    case c.relkind when 'v' then 'view' else 'table' end as object_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v')
  and not exists (
      select 1 from public.app_table_registry r where r.object_name = c.relname::text
  )
order by 1;

revoke all on public.app_table_unregistered from anon;
grant select on public.app_table_unregistered to authenticated;

-- ----------------------------------------------------------------------------
-- Seed: habits and allowances (the other apps in this project, games and
-- storytime, have not been registered yet and show up in app_table_unregistered)
-- ----------------------------------------------------------------------------
insert into public.app_table_registry (app, object_name, object_type, access, description, repo) values
('habits',     'family_members',                 'table',    'owner', 'Family roster (kids and parents) with avatar, colour and display order. Shared lookup for other apps.', 'ShimmyCane/Family-Habits'),
('habits',     'habits',                         'table',    'owner', 'Chores and goals assigned to a family member (member_name -> family_members.name).', 'ShimmyCane/Family-Habits'),
('habits',     'habit_completions',              'table',    'owner', 'One row per habit completed on a date.', 'ShimmyCane/Family-Habits'),
('allowances', 'family_members',                 'table',    'reads', 'Kids (role = kid) are the allowance accounts. Owned by habits.', 'ShimmyCane/Allowances'),
('allowances', 'allowance_transactions',         'table',    'owner', 'Ledger of deposits, withdrawals, interest and adjustments. Source of truth for balances.', 'ShimmyCane/Allowances'),
('allowances', 'allowance_withdrawal_requests',  'table',    'owner', 'Withdrawal requests; approval goes through approve_allowance_withdrawal().', 'ShimmyCane/Allowances'),
('allowances', 'allowance_balances',             'view',     'owner', 'Balance per kid computed from the ledger.', 'ShimmyCane/Allowances'),
('allowances', 'approve_allowance_withdrawal',   'function', 'owner', 'Atomically approves a pending request and creates exactly one withdrawal transaction.', 'ShimmyCane/Allowances'),
('platform',   'app_table_registry',             'table',    'owner', 'This index: which app uses which database object.', 'ShimmyCane/Family-Habits'),
('platform',   'app_table_unregistered',         'view',     'owner', 'Public tables and views not yet listed in app_table_registry.', 'ShimmyCane/Family-Habits')
on conflict (app, object_name) do nothing;

-- Usage:
--   select * from public.app_table_registry order by app, object_name;   -- who uses what
--   select * from public.app_table_unregistered;                          -- anything unclaimed
--   select app from public.app_table_registry where object_name = 'family_members';  -- impact of a change
