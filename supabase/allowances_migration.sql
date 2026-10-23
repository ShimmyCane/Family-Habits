-- ============================================================================
-- DRAFT: Allowances data model inside the Family Habits project
-- Target project: twvqvutrcobedvuhnzxq
-- Status: NOT YET RUN. Review the open decisions in ACTION_PLAN.md first.
-- Run in the Supabase SQL editor. The whole file runs in one transaction.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Children (allowance profiles)
--    legacy_id keeps the UUID from the old Allowances project so the manual
--    copy can be traced and reconciled. Drop it once the migration is signed off.
-- ----------------------------------------------------------------------------
create table if not exists public.allowance_children (
    id           uuid primary key default gen_random_uuid(),
    legacy_id    uuid unique,
    name         text not null,
    is_active    boolean not null default true,
    created_at   timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- 2. Ledger: the source of truth for balances
--    Sign rule (matches the current Allowances app):
--      withdrawal           -> subtracts
--      deposit/interest/adjustment -> adds
--    amount is always positive.
-- ----------------------------------------------------------------------------
create table if not exists public.allowance_transactions (
    id               uuid primary key default gen_random_uuid(),
    legacy_id        uuid unique,
    child_id         uuid not null references public.allowance_children(id),
    type             text not null check (type in ('deposit', 'withdrawal', 'interest', 'adjustment')),
    amount           numeric(12,2) not null check (amount > 0),
    note             text,
    achievement_tag  text,
    occurred_at      timestamptz not null default timezone('utc', now()),
    created_at       timestamptz not null default timezone('utc', now())
);

create index if not exists allowance_transactions_child_idx
    on public.allowance_transactions (child_id, occurred_at);

-- ----------------------------------------------------------------------------
-- 3. Withdrawal requests
--    A pending request does not touch the ledger. Approval goes through the
--    function below, which creates exactly one withdrawal transaction.
-- ----------------------------------------------------------------------------
create table if not exists public.allowance_withdrawal_requests (
    id                       uuid primary key default gen_random_uuid(),
    legacy_id                uuid unique,
    child_id                 uuid not null references public.allowance_children(id),
    requested_amount         numeric(12,2) not null check (requested_amount > 0),
    purpose                  text,
    status                   text not null default 'pending'
                             check (status in ('pending', 'approved', 'declined')),
    approved_transaction_id  uuid references public.allowance_transactions(id),
    reviewed_at              timestamptz,
    created_at               timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- 4. Balance view (computed from the ledger, never stored)
--    security_invoker = true means the caller's RLS applies to the view.
-- ----------------------------------------------------------------------------
create or replace view public.allowance_balances
with (security_invoker = true) as
select
    c.id as child_id,
    c.name,
    coalesce(sum(
        case when t.type = 'withdrawal' then -t.amount else t.amount end
    ), 0)::numeric(12,2) as balance
from public.allowance_children c
left join public.allowance_transactions t on t.child_id = c.id
group by c.id, c.name;

-- ----------------------------------------------------------------------------
-- 5. Approve a withdrawal atomically
--    Calling it twice returns the same transaction id and creates no duplicate.
-- ----------------------------------------------------------------------------
create or replace function public.approve_allowance_withdrawal(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    r      public.allowance_withdrawal_requests%rowtype;
    tx_id  uuid;
begin
    if auth.uid() is null then
        raise exception 'not signed in';
    end if;

    select * into r
    from public.allowance_withdrawal_requests
    where id = p_request_id
    for update;

    if not found then
        raise exception 'withdrawal request % not found', p_request_id;
    end if;

    if r.status = 'approved' then
        return r.approved_transaction_id;  -- idempotent retry
    end if;

    if r.status <> 'pending' then
        raise exception 'withdrawal request is %, cannot approve', r.status;
    end if;

    insert into public.allowance_transactions (child_id, type, amount, note)
    values (r.child_id, 'withdrawal', r.requested_amount, r.purpose)
    returning id into tx_id;

    update public.allowance_withdrawal_requests
    set status = 'approved',
        approved_transaction_id = tx_id,
        reviewed_at = timezone('utc', now())
    where id = p_request_id;

    return tx_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
--    Current policy: any signed-in user can read and write. This assumes a
--    single family. If you keep the family_id model, replace these policies.
--    Anonymous (publishable key) access gets nothing.
-- ----------------------------------------------------------------------------
alter table public.allowance_children            enable row level security;
alter table public.allowance_transactions        enable row level security;
alter table public.allowance_withdrawal_requests enable row level security;

drop policy if exists "signed in full access" on public.allowance_children;
create policy "signed in full access" on public.allowance_children
    for all to authenticated using (true) with check (true);

drop policy if exists "signed in full access" on public.allowance_transactions;
create policy "signed in full access" on public.allowance_transactions
    for all to authenticated using (true) with check (true);

drop policy if exists "signed in full access" on public.allowance_withdrawal_requests;
create policy "signed in full access" on public.allowance_withdrawal_requests
    for all to authenticated using (true) with check (true);

revoke all on public.allowance_children, public.allowance_transactions,
              public.allowance_withdrawal_requests from anon;
grant select on public.allowance_balances to authenticated;

revoke execute on function public.approve_allowance_withdrawal(uuid) from public, anon;
grant execute on function public.approve_allowance_withdrawal(uuid) to authenticated;

commit;

-- ----------------------------------------------------------------------------
-- 7. Reconciliation (run after the manual copy; every row should show match = true)
--    Compare against the old project's balances before it is closed.
--    Paste the old totals into the VALUES list below.
-- ----------------------------------------------------------------------------
-- select v.name, v.expected_balance,
--        b.balance,
--        b.balance = v.expected_balance as match
-- from (values
--     ('Athena', 0.00::numeric),   -- replace with old balance
--     ('Felix',  0.00::numeric)    -- replace with old balance
-- ) as v(name, expected_balance)
-- left join public.allowance_balances b on b.name = v.name;
