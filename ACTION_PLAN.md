# Action Plan: Fold Allowances into the Habits Project

**Repo:** `Family-Habits` (destination)
**Target Supabase project:** `twvqvutrcobedvuhnzxq`
**Source Supabase project:** `kbhlwannygavrnwbebtf` (Allowances, to be archived)
**Companion plan:** `../Allowances/ACTION_PLAN.md`
**Draft SQL:** `supabase/allowances_migration.sql`

Status: draft. Nothing has been run or changed in either database.

---

## 0. Open decisions (answer before running anything)

| # | Question | Default assumed in the draft SQL |
|---|----------|----------------------------------|
| D1 | Is the habits app parent-only (sign-in), or does it stay anonymous? | Signed-in users only. Anon gets nothing. |
| D2 | Is this single-family, so `family_id` can go? | Yes, single family. `family_id` dropped. |
| D3 | Keep `legacy_id` columns after the copy? | Yes, until reconciliation is signed off. |
| D4 | Sign rule for `adjustment`? | Adds to balance (matches current app). |
| D5 | Do Athena and Felix link to existing `family_members` rows? | No link for now. Plain `name` on `allowance_children`. |

---

## 1. Prerequisites

- [ ] Connect the **Supabase** connector (claude.ai connector settings) so the live schema of both projects can be read directly.
- [ ] Back up the habits project (Dashboard → Database → Backups, or `pg_dump --schema-only` and a data dump).
- [ ] Back up the Allowances project the same way. Keep the backup until the archive is final.
- [ ] Confirm the live `family_members`, `habits`, `habit_completions` and `family_reflections` columns match what `app.js` writes. The habit `schema.sql` is not in this repo. Its only copy is in ShimmyAI (`03 Projects/Family Habits/supabase/schema.sql`). Copy it into `supabase/` here.

## 2. Database changes (habits project)

File: `supabase/allowances_migration.sql`

- [ ] Review decisions D1–D5 and edit the SQL if any answer differs.
- [ ] Verify no existing table or function is named `allowance_*` or `approve_allowance_withdrawal`. The script uses `if not exists` for tables but `create or replace` for the function, so a name clash would overwrite it.
- [ ] Run the script in the SQL editor. It runs in one transaction.
- [ ] Test RLS:
  - anonymous request to `allowance_transactions` returns nothing or is denied
  - signed-in request returns rows
- [ ] Test `approve_allowance_withdrawal` twice on the same pending request. Expect one withdrawal row and the same returned id.
- [ ] Test approving a declined request. Expect an exception.

## 3. Manual data copy (you do this)

Copy in this order, because of foreign keys:

1. `allowance_children` ← old `children` (keep old `id` as `legacy_id`, `name` from the live column)
2. `allowance_transactions` ← old `transactions` (keep old `id` as `legacy_id`, map `child_id` through step 1)
3. `allowance_withdrawal_requests` ← old `withdrawal_requests` (map `child_id`; for approved rows, set `approved_transaction_id` to the matching copied withdrawal, or leave it null and note it)

Watch for these:
- [ ] **Interest rows.** The old app creates monthly interest on the client (`ensureInterest`) and can create duplicates if two browsers open at once. Check for duplicate `interest` rows per child per month and remove them before copying. Keep one per month.
- [ ] **Interest rate.** It is stored in each browser's localStorage, not the database. Record the current rate (default 5%) so future interest can be set in the habits project.
- [ ] Do not copy `family_id` or `created_by`. Drop them.

## 4. Reconciliation

- [ ] Run the reconciliation query at the bottom of `supabase/allowances_migration.sql` with the old balances from the Allowances app (per child).
- [ ] Every row must show `match = true`. Do not archive the old project until they do.

## 5. Changes to this repo (`Family-Habits`)

Nothing here needs to change for the data move itself. These are needed so the repo matches the new state:

- [ ] `supabase/`: add the habit schema copied from ShimmyAI, and `allowances_migration.sql`.
- [ ] `index.html` line ~874: the diagnostics text points to `03 Projects/Family Habits/supabase/schema.sql` in ShimmyAI. Change it to `supabase/` in this repo.
- [ ] `app.js` lines ~207–225: add the new tables to the diagnostics check (`allowance_children`, `allowance_transactions`, `allowance_withdrawal_requests`). This is only a health check, not a feature.
- [ ] Decide whether to port the allowance screens (deposit, history, withdrawal review) into this app. That is a separate, later step. The data move does not depend on it.

## 6. Security follow-ups

- [ ] The publishable key is in `app.js` (line 6–7). That is acceptable only if RLS is correct. Re-check every table after the change, including the existing habit tables.
- [ ] If the habits app stays anonymous (D1), the allowance tables are unreachable from it. That is intentional, but the allowance UI will need sign-in when it is ported.

## 7. Done when

- [ ] Reconciliation is all `match = true`.
- [ ] RLS tests pass.
- [ ] Repo changes in section 5 are committed.
- [ ] Old Allowances project is archived (see companion plan, section 6).
