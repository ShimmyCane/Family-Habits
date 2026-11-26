---
name: Update Emojis
description: Replace placeholder star emojis (⭐) on Family Habits tasks with unique, fitting emojis in the habits table, so every task in the Task Bank has its own emoji.
---

# Update Emojis

The Task Bank is built from the `public.habits` table in the Supabase project **Family** (`twvqvutrcobedvuhnzxq`). Tasks are grouped by name (case-insensitive), and each task's emoji comes from its rows. A `⭐` is a placeholder and must be replaced. Every task name should have one emoji, and no two different task names should share one.

## Steps

1. **Find placeholders and current emojis.**
   ```sql
   select member_name, name, emoji, type, is_active
   from public.habits
   order by name, member_name;
   ```
   Treat these as placeholders: `⭐`, plain words such as `Book`, and corrupted strings such as `💊⚚`.

2. **Pick one emoji per task name.** Choose something that fits the task. Don't reuse an emoji already used by a different task name. Check the full list first:
   ```sql
   select emoji, string_agg(distinct name, ' | ') from public.habits group by emoji;
   ```
   Near-duplicate tasks (for example "Piano Practice" and "Play Piano") still need different emojis.

3. **Update by name, across every member's row.** A task's rows for all members should match.
   ```sql
   with m(name, emoji) as (values
     ('Task name exactly as stored', '🎯')
     -- one row per task name
   )
   update public.habits h set emoji = m.emoji
   from m where lower(trim(h.name)) = lower(trim(m.name));
   ```
   Run a `select` with the same join first to preview the change.

4. **Verify.**
   ```sql
   select 'remaining_stars' as check, count(*)::text from public.habits where emoji in ('⭐','Book','💊⚚')
   union all
   select 'names_with_multiple_emojis', count(*)::text from (select lower(trim(name)) from public.habits group by 1 having count(distinct emoji) > 1) x
   union all
   select 'emojis_shared_by_tasks', count(*)::text from (select emoji from public.habits group by emoji having count(distinct lower(trim(name))) > 1) y;
   ```
   All three should be `0`. If `emojis_shared_by_tasks` is above `0`, fix the listed tasks and run the check again.

5. **Report** each task name with its old and new emoji. Include inactive tasks too, since the Task Bank shows them.

## Notes

- Use Supabase MCP `execute_sql` on project `twvqvutrcobedvuhnzxq`. Don't touch the `xabgankckrcuhcgdolrg` (Architecture) project.
- `habit_revisions` has no emoji column, so no revision entry is needed.
- Use one emoji for a short task name. For a sentence-style name, two or more emojis are fine (for example `✍️📖` for "Write one book report"). Compound emojis such as `🧹🏠` are also fine.
- Keep emoji choices consistent with the task's meaning, and don't create duplicates.
