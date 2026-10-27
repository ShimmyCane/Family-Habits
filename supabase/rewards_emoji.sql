-- ============================================================================
-- Each reward gets an emoji. The app copies the first linked task's emoji when
-- the reward has none. Target project: twvqvutrcobedvuhnzxq ("Family").
-- Safe to re-run. Run after supabase/rewards_suggested_amount.sql.
-- ============================================================================

alter table public.rewards
    add column if not exists emoji text not null default '🎁';

update public.rewards set emoji = '🥡'     where name = 'China buffet night';
update public.rewards set emoji = '⭐'     where name = 'Gold star doubles allowance';
update public.rewards set emoji = '🎹'     where name = 'Piano extra credit';
update public.rewards set emoji = '🧹🏠'   where name = 'Cleaning House extra credit';
