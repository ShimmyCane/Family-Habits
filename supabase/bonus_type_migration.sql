-- Adds the 'bonus' habit type: stretch tickets with no target.
-- Bonus rows store target_count = 0 and are left out of weekly targets and percentages.
-- Target project: twvqvutrcobedvuhnzxq ("Family")
-- Safe to re-run.

alter table public.habits drop constraint if exists habits_type_check;

alter table public.habits
    add constraint habits_type_check check (type in ('chore', 'goal', 'bonus'));
