-- ============================================================================
-- Allowances data model inside the Family Habits project
-- Target project: twvqvutrcobedvuhnzxq ("Family")
--
-- Design (based on the live schemas of both projects):
--   * Children are NOT copied. Athena and Felix already exist in
--     public.family_members (role = 'kid'). The ledger links to them by name,
--     the same way public.habits does (member_name -> family_members.name).
--   * Access follows the existing habit tables: signed-in users only, no anon.
--   * No family_id / parents tables: this project is single-family.
--   * legacy_id keeps the row id from the old Allowances project so the copy
--     can be reconciled. Drop it once the migration is signed off.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ledger: the source of truth for balances
--    Sign rule (matches the old app): withdrawal subtracts; everything else adds.
--    amount is always positive.
-- ----------------------------------------------------------------------------
create table if not exists public.allowance_transactions (
    id               uuid primary key default gen_random_uuid(),
    legacy_id        uuid unique,
    member_name      text not null
                     references public.family_members (name) on update cascade,
    type             text not null
                     check (type in ('deposit', 'withdrawal', 'interest', 'adjustment')),
    amount           numeric(12,2) not null check (amount > 0),
    note             text,
    achievement_tag  text,
    occurred_at      timestamptz not null default timezone('utc', now()),
    created_at       timestamptz not null default timezone('utc', now())
);

create index if not exists allowance_transactions_member_idx
    on public.allowance_transactions (member_name, occurred_at);

-- ----------------------------------------------------------------------------
-- 2. Withdrawal requests
--    A pending request does not touch the ledger. Approval goes through the
--    function below, which creates exactly one withdrawal transaction.
-- ----------------------------------------------------------------------------
create table if not exists public.allowance_withdrawal_requests (
    id                       uuid primary key default gen_random_uuid(),
    legacy_id                uuid unique,
    member_name              text not null
                             references public.family_members (name) on update cascade,
    requested_amount         numeric(12,2) not null check (requested_amount > 0),
    purpose                  text,
    status                   text not null default 'pending'
                             check (status in ('pending', 'approved', 'declined')),
    approved_transaction_id  uuid references public.allowance_transactions (id),
    reviewed_at              timestamptz,
    created_at               timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- 3. Balance view (computed from the ledger, never stored)
--    security_invoker = true means the caller's RLS applies to the view.
-- ----------------------------------------------------------------------------
create or replace view public.allowance_balances
with (security_invoker = true) as
select
    m.name as member_name,
    coalesce(sum(
        case when t.type = 'withdrawal' then -t.amount else t.amount end
    ), 0)::numeric(12,2) as balance
from public.family_members m
left join public.allowance_transactions t on t.member_name = m.name
where m.role = 'kid'
group by m.name;

-- ----------------------------------------------------------------------------
-- 4. Approve a withdrawal atomically
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

    insert into public.allowance_transactions (member_name, type, amount, note)
    values (r.member_name, 'withdrawal', r.requested_amount, r.purpose)
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
-- 5. Row Level Security (same model as habits / habit_completions)
--    Signed-in users get full access; anon gets nothing.
-- ----------------------------------------------------------------------------
alter table public.allowance_transactions        enable row level security;
alter table public.allowance_withdrawal_requests enable row level security;

drop policy if exists "Authenticated can manage allowance_transactions"
    on public.allowance_transactions;
create policy "Authenticated can manage allowance_transactions"
    on public.allowance_transactions
    for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated can manage allowance_withdrawal_requests"
    on public.allowance_withdrawal_requests;
create policy "Authenticated can manage allowance_withdrawal_requests"
    on public.allowance_withdrawal_requests
    for all to authenticated using (true) with check (true);

revoke all on public.allowance_transactions,
              public.allowance_withdrawal_requests,
              public.allowance_balances from anon;
grant select on public.allowance_balances to authenticated;

revoke execute on function public.approve_allowance_withdrawal(uuid) from public, anon;
grant execute on function public.approve_allowance_withdrawal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Reconciliation (run after the data copy; every row should show match = true)
--    Expected values are the Allowances balances read on 2026-10-23.
-- ----------------------------------------------------------------------------
-- select v.member_name, v.expected_balance, v.expected_rows,
--        b.balance, c.rows,
--        b.balance = v.expected_balance and c.rows = v.expected_rows as match
-- from (values ('Athena', 6.25::numeric, 7), ('Felix', 5.50::numeric, 6))
--      as v(member_name, expected_balance, expected_rows)
-- left join public.allowance_balances b on b.member_name = v.member_name
-- left join (select member_name, count(*) as rows
--            from public.allowance_transactions group by member_name) c
--        on c.member_name = v.member_name;
