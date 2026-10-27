-- ============================================================================
-- Copy the suggested amount onto each award when it is written, so changing a
-- reward's rate later does not change what past awards owe.
-- Target project: twvqvutrcobedvuhnzxq ("Family"). Safe to re-run.
-- Run after supabase/rewards_migration.sql.
-- ============================================================================

alter table public.reward_awards
    add column if not exists suggested_amount numeric(12,2) check (suggested_amount >= 0);
