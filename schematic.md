# Family Habits — Project Schematic

## 1. Purpose & Vision
A playful, kid-friendly weekly habit, chore, and aspirational goal tracker for all four family members: **Athena, Felix, Ying, and Jimmy**.
The goal is to foster positive habits and facilitate productive, celebratory family conversations during weekly Sunday night meetings. Gamification focuses on encouragement, happy faces, positive affirmations, and streak tracking without penalization.

---

## 2. Architecture & Tech Stack
- **Frontend**: Zero-build static web app (`index.html`, `app.js`) hosted on GitHub Pages.
- **Styling**: Playful, kid-friendly tactile aesthetic matching Allowances (Bank Gothic / Orbitron typography, soft pastel color palette, 2.5–3.5px solid ink borders, 3D pill buttons, generous touch targets for iPad/iPhone).
- **Backend / Database**: Supabase (`https://twvqvutrcobedvuhnzxq.supabase.co`) for auth and cloud persistence across devices.
- **Authentication**: Shared family login for MVP (`wiggleling@gmail.com`).
- **Audio**: Browser-native Web Audio API synthesizer for positive, playful feedback tones.
- **Reliability & Diagnostics**: Built-in visual schema validation and error panel on-screen to catch missing tables or RLS policy mismatches instantly.

---

## 3. Data Model (Supabase)
1. **`family_members`**
   - `id`: UUID (Primary Key)
   - `name`: Text ('Athena', 'Felix', 'Ying', 'Jimmy')
   - `avatar`: Text (Emoji)
   - `color`: Text (Hex/CSS color)
   - `display_order`: Integer
2. **`habits`**
   - `id`: UUID (Primary Key)
   - `member_name`: Text (or link to `family_members.name`)
   - `name`: Text (e.g. "Brush Teeth", "Read Book", "Fold Laundry")
   - `description`: Text
   - `emoji`: Text
   - `type`: Text (`chore` or `goal`)
   - `target_frequency`: Text (`daily`, `weekly_count`, `monthly_count`)
   - `target_count`: Integer (e.g. 7 for daily, 3 for 3x/week)
   - `is_active`: Boolean (default `true`)
   - `created_at`: Timestamp
3. **`habit_completions`**
   - `id`: UUID (Primary Key)
   - `habit_id`: UUID (References `habits.id`)
   - `member_name`: Text
   - `completed_date`: Date (YYYY-MM-DD)
   - `completed_at`: Timestamp
   - `notes`: Text (optional)
   - `cheer_emoji`: Text (optional smiley / praise)

---

## 4. Scope & Milestones
- [x] Initial schematic, directory setup, and schema creation.
- [x] Supabase connection & live table health check panel under Settings (`⚙️`).
- [x] Front Page Hub with family snapshot and completion rate progress bars.
- [x] Title click (`✨ Family Habits`) navigates back to Home Hub.
- [x] Member selection bar (Athena, Felix, Ying, Jimmy) with distinct color themes.
- [x] Weekly view (Monday – Sunday) showing active chores and aspirational goals.
- [x] 1-Tap completion toggle with Web Audio chime, happy face reactions, and positive affirmations.
- [x] Affirmations externalized to `public/affirmations.json`.
- [x] "Add Habit / Chore" modal form (name, emoji, type, target cadence).
- [x] Task deletion with confirmation modal dialog.
- [x] Task Bank & Working Folder: non-depleting shared catalog of all tasks (active & archived) across the family.
- [x] Task Bank Popularity Algorithm: most popular chores & goals rise to the top based on active assignment count and completed logs.
- [x] Non-Depleting Assignment: assigning or cloning tasks to family members leaves the bank catalog intact and updates popularity rankings immediately.
- [x] Live Task Bank Search & Quick Creation: filter by keyword/member/type, and add brand-new task templates directly into the bank.
- [x] Indefinite carry-over: habits persist across all weeks seamlessly.
- [x] Sunday Progress Check sequence: 5-second celebration reel per family member with praises, fanfare, and stats.
- [x] Sunday Family Leaderboard (friendly competition for Athena) and card-by-card goal breakdown.
- [x] Weekly Family Reflection & Wins Journal (`family_reflections` table).
- [x] 8.5" x 11" Refrigerator Chart printout view.
- [x] Profile Customizer (Avatar emoji & theme color).
- [x] Full JSON Data Export & Backup.

