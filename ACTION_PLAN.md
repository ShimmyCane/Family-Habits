# Action Plan: Fold Allowances into the Habits Project

**Repo:** `Family-Habits` (destination)
**Target Supabase project:** `twvqvutrcobedvuhnzxq` ("Family")
**Source Supabase project:** `kbhlwannygavrnwbebtf` ("Allowance", to be archived)
**Companion plan:** `../Allowances/ACTION_PLAN.md`
**SQL:** `supabase/allowances_migration.sql`

## Status (2026-10-23)

| Step | State |
|------|-------|
| Read both live schemas and data | Done |
| Create allowance tables, view, approval function, RLS in the habits project | Done |
| Copy allowance data | Done (13 transactions) |
| Reconcile source vs destination | Done, matches |
| Test RLS and approval function | Done, passes |
| Port the Allowances app to use the new tables | Done in a draft PR: `Allowances` PR #2 (not merged, real login untested) |
| Add `app_table_registry` index to this project | Done (`supabase/app_registry.sql`) |
| Archive the Allowances project | **Not started** (yours to do, see companion plan) |

## 1. What the live schemas showed

- **Allowances** has 2 children (Athena, Felix), 13 transactions (all deposits), 0 withdrawal requests, 1 family, 1 parent. Balances: Athena 6.25 (7 rows), Felix 5.50 (6 rows). Its `transactions.type` check only allows `deposit` and `withdrawal`, so the interest rows the old app tries to create (`ensureInterest`) would be rejected, and none exist.
- **Habits** already has Athena and Felix in `family_members` (`role = 'kid'`), and every habit table uses sign-in-only (`authenticated`) policies. `habits.member_name` is a foreign key to `family_members.name`.

## 2. Decisions (resolved from the live data)

| # | Question | Decision |
|---|----------|----------|
| D1 | Anonymous or signed-in? | Signed-in only. Matches the existing habit tables. |
| D2 | Keep `family_id`? | No. The habits project is single-family. |
| D3 | Keep `legacy_id`? | Yes, until you sign off. Drop later with `alter table ... drop column legacy_id`. |
| D4 | `adjustment` sign rule? | Adds to the balance, same as the old app, and is the only type allowed to be negative (the form says "Adjustment (+/-)"). Other types must be positive. No adjustment rows exist today. |
| D5 | Separate children table? | No. The ledger links to `family_members` by name, like `habits` does. The balance view only lists `role = 'kid'`. |

## 3. What was applied to the habits project

- `allowance_transactions`, `allowance_withdrawal_requests` (foreign key to `family_members(name)`, `on update cascade`)
- `allowance_balances` view (`security_invoker`, kids only)
- `approve_allowance_withdrawal(uuid)`: idempotent, signed-in only
- RLS on both tables (signed-in full access, no anon access)
- 13 transactions copied with their original ids in `legacy_id`
- A unique index `allowance_one_interest_per_month`: one `interest` row per kid per month, because the app creates interest from the browser
- `app_table_registry` and `app_table_unregistered` (see section 7)

Notes:
- The Supabase `apply_migration` tool timed out repeatedly, so only the table creation is in the migration history (`add_allowance_tables`). The rest was applied with `execute_sql`. `supabase/allowances_migration.sql` is the complete, re-runnable record of the final state.
- Another migration (`storytime_tables`) appeared on this project while this was running. It is not part of this work and was not touched.

## 4. Verification results

- Row counts match (13 = 13) and an md5 checksum over every copied field is identical in both projects.
- Balances match: Athena 6.25, Felix 5.50.
- Anonymous read of `allowance_transactions` is denied.
- Approve while signed out is rejected. Approving the same request twice returns the same transaction and creates one withdrawal (balance 6.25 → 5.25 in the test). A declined request cannot be approved.
- Test rows were rolled back. Final state: 13 transactions, 0 requests.
- Security advisor: no new findings besides `approve_allowance_withdrawal` being callable by signed-in users, which is intentional. Existing findings (the `games` views, `update_updated_at`, leaked-password protection) predate this work.

## 5. Remaining work

- [ ] **Merge `Allowances` PR #2** (it points the Allowances app at these tables) after checking the login. This project has one auth user, so the Allowances app signs in with the same email and password as this app. Merging switches the live Allowances site; the old project is untouched, so it can be reverted.
- [ ] Copy the habit `schema.sql` from ShimmyAI (`03 Projects/Family Habits/supabase/`) into `supabase/`, or regenerate it from the live project.
- [ ] `index.html` line ~874 still points to the ShimmyAI path for `schema.sql`. Update it once the file is in `supabase/`.
- [ ] Optional: add the allowance tables to the Supabase Diagnostics panel (`app.js` ~207–225).
- [ ] After sign-off: drop `legacy_id` columns.

## 6a. Verification added after the port

- Browser test (Chromium, real `app.js`, stand-in Supabase client enforcing this schema): 23/23 passed, covering the kid picker, balances, deposit, negative adjustment, rejected negative deposit, two months of interest, no double interest, and the duplicate-interest race.
- Same reads and writes run as the `authenticated` role against this database, rolled back.
- Negative adjustment accepted; negative deposit, zero adjustment and a second interest row in a month rejected.

## 7. Table index (`app_table_registry`)

`supabase/app_registry.sql` adds an index of which app uses which table in this project:

- `app_table_registry`: one row per (app, table/view/function), with `owner` or `reads`. Seeded with habits and allowances.
- `app_table_unregistered`: a view of anything in `public` nobody has registered. Today it lists the `games`/`play_*` tables (Moment) and `storytime_*`, which still need an owner.

Convention and a reusable template for other projects: ShimmyAI `04 AI/Supabase Registry/`. When you add a table, register it in the same migration.

## 8. Security notes

- The publishable key is in `app.js`. That is only safe because of RLS, so re-check RLS on any new table before the app uses it.
- Enable leaked-password protection in Supabase Auth settings (existing advisor warning).
