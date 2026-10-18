# Family Habits — Project Plan

**Target Audience:** Athena, Felix, Ying, Jimmy  
**Platform:** Static Web App (GitHub Pages) + Supabase  
**Design Philosophy:** Playful, kid-friendly iPad UI, positive affirmations, streak encouragement without punishment, Sunday night weekly reset with persistent logs.

---

## 1. Objectives
- Establish healthy daily habits and responsibilities for kids and parents.
- Track weekly chores (routines) and aspirational goals (stretch habits).
- Facilitate an upbeat, celebratory family conversation every Sunday night.
- Provide a clean, delightful iPad interface with tactile buttons, uplifting audio chimes, and instant feedback.

---

## 2. Technical Stack
- **Frontend:** Pure HTML5 / CSS3 / Vanilla JavaScript (zero build step).
- **Backend:** Supabase Auth, PostgreSQL, Row Level Security.
- **Audio:** Web Audio API synth (zero external audio file dependencies).
- **Storage & Hosting:** GitHub Pages static hosting.

---

## 3. Database Schema Overview
- `family_members`: `id, name, avatar, color, role, display_order`
- `habits`: `id, member_name, name, description, emoji, type, target_frequency, target_count, is_active`
- `habit_completions`: `id, habit_id, member_name, completed_date, completed_at, notes, cheer_emoji` (unique on `habit_id + completed_date`)

---

## 4. Milestones
- **Milestone 1 (Current - MVP):**
  - Scaffold project, Supabase SQL schema, and client app.
  - Implement 4-member profile switcher.
  - Monday–Sunday weekly habit matrix with one-tap completion bubbles.
  - Web Audio sound effects and celebratory cheers.
  - Live Supabase diagnostic panel to verify tables and RLS.
- **Milestone 2 (Sunday Review & Streaks):**
  - "Sunday Meeting Mode" summary screen reviewing week-over-week wins.
  - Extended streak counters and visual happy face milestones.
- **Milestone 3 (Polish & Offline Resilience):**
  - Offline localStorage caching if network is unavailable.
  - PWA home screen icon support for iPad.

