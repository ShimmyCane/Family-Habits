// ==============================================================================
// REWARDS: pinned family rewards, weekly progress, and the archive of finished weeks
// Loaded after app.js and uses its globals: _supabase, $, allHabits, familyMembers,
// habitTarget, escapeHtml, showError, showToast, playPopTone, playSuccessChime,
// switchView, currentView, currentUser.
//
// Rules:
//   * Periods are Monday to Sunday. A week counts once its last day has arrived.
//   * A week a reward was met for is written to reward_awards once, then kept.
//     Voided awards stay in the archive, so they are never written again.
//   * Allowance amounts are suggestions only. Parents decide how to pay them out.
// ==============================================================================

const REWARD_SUGGESTION_NOTE = 'Suggested allowance';

let rewards = [];
let rewardAwards = [];
let allHabitCompletions = []; // every completion, so past weeks can be checked
let rewardsLoadError = '';
let rewardsTimelineFilter = 'all';
let editingRewardId = null;
let editingAwardId = null;
let rewardDraftRequirements = [];

// ------------------------------------------------------------------------------
// DATES (local calendar days as YYYY-MM-DD)
// ------------------------------------------------------------------------------
function isoOf(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseIsoLocal(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDaysIso(iso, days) {
    const d = parseIsoLocal(iso);
    d.setDate(d.getDate() + days);
    return isoOf(d);
}

// Monday to Sunday week that contains the given day
function weekBounds(iso) {
    const d = parseIsoLocal(iso);
    const distanceToMonday = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const start = addDaysIso(iso, distanceToMonday);
    return { start, end: addDaysIso(start, 6) };
}

function shortDate(iso) {
    const d = parseIsoLocal(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMoney(amount) {
    return `$${Number(amount || 0).toFixed(2)}`;
}

function rewardById(id) {
    return rewards.find(r => r.id === id) || null;
}

function byEarnedDesc(a, b) {
    return b.earned_on.localeCompare(a.earned_on) || (b.created_at || '').localeCompare(a.created_at || '');
}

// ------------------------------------------------------------------------------
// EVALUATION (reads loaded data, changes nothing)
// ------------------------------------------------------------------------------
// Tracked tasks only. Bonus tickets never count toward a family target.
function trackedHabitsFor(memberName) {
    return allHabits.filter(h => h.is_active !== false && h.member_name === memberName && h.type !== 'bonus');
}

function habitPeriodCount(habitId, start, end) {
    return allHabitCompletions.filter(c => c.habit_id === habitId && c.completed_date >= start && c.completed_date <= end).length;
}

// Percent of a member's weekly targets done in the period. Null when they have no tracked tasks.
function memberPeriodPercent(memberName, start, end) {
    let done = 0;
    let target = 0;
    trackedHabitsFor(memberName).forEach(h => {
        target += habitTarget(h);
        done += habitPeriodCount(h.id, start, end);
    });
    return target > 0 ? Math.round((done / target) * 100) : null;
}

function evaluateHabitRequirement(req, start, end) {
    const habit = allHabits.find(h => h.id === req.habit_id);
    const needed = Math.max(1, req.min_count || 1);
    const done = habit ? habitPeriodCount(habit.id, start, end) : 0;
    return {
        label: habit ? `${habit.member_name}: ${habit.name}` : 'Removed task',
        detail: `${done} of ${needed} this week`,
        done,
        needed,
        progress: Math.min(done / needed, 1),
        met: done >= needed
    };
}

// Every member with tracked tasks has to reach the percent. Members without tasks are skipped.
function evaluateFamilyRequirement(req, start, end) {
    const needed = req.min_percent;
    const scores = familyMembers
        .map(m => ({ name: m.name, percent: memberPeriodPercent(m.name, start, end) }))
        .filter(s => s.percent !== null);
    if (scores.length === 0) {
        return { label: `Everyone at ${needed}%`, detail: 'No tracked tasks yet', done: 0, needed, progress: 0, met: false };
    }
    return {
        label: `Everyone at ${needed}%`,
        detail: scores.map(s => `${s.name} ${s.percent}%`).join(' · '),
        done: Math.min(...scores.map(s => s.percent)),
        needed,
        progress: Math.min(...scores.map(s => Math.min(s.percent / needed, 1))),
        met: scores.every(s => s.percent >= needed)
    };
}

// Standard rewards need every requirement met. The progress bar shows the weakest one,
// so one person falling behind is visible even when the other is ahead.
// Extra-credit rewards pay one unit for each completion above the set number.
function evaluateReward(reward, start, end) {
    const results = reward.requirements.map(req => (
        req.kind === 'family' ? evaluateFamilyRequirement(req, start, end) : evaluateHabitRequirement(req, start, end)
    ));

    if (reward.kind === 'extra_credit') {
        const r = results[0] || { done: 0, needed: 1, progress: 0 };
        const units = Math.max(0, r.done - r.needed);
        return { results, units, met: units >= 1, progress: r.progress };
    }

    const met = results.length > 0 && results.every(r => r.met);
    const progress = results.length > 0 ? Math.min(...results.map(r => r.progress)) : 0;
    return { results, units: 1, met, progress };
}

function describeRequirement(req) {
    if (req.kind === 'family') return `Everyone at ${req.min_percent}% or more`;
    const habit = allHabits.find(h => h.id === req.habit_id);
    if (!habit) return `Removed task, ${req.min_count}× a week`;
    return `${habit.member_name}: ${habit.name}, ${req.min_count}× a week`;
}

// Weeks whose last day is today or earlier, from the week the reward was published.
function closedWeeks(reward, todayIso) {
    const weeks = [];
    let cursor = weekBounds(reward.starts_on || todayIso).start;
    while (cursor <= todayIso) {
        const week = weekBounds(cursor);
        if (week.end > todayIso) break;
        weeks.push(week);
        cursor = addDaysIso(week.end, 1);
    }
    return weeks;
}

function awardStatus(award) {
    if (award.voided) return 'voided';
    if (award.cashed_on) return 'cashed';
    return 'ready';
}

// The amount is copied onto the award when it is written, so changing a reward's rate later
// does not change what past awards owe. Rows from before that copy fall back to the rate now.
function awardSuggested(award) {
    if (award.suggested_amount != null) return Number(award.suggested_amount) * award.units;
    const reward = rewardById(award.reward_id);
    return reward && reward.allowance_amount > 0 ? reward.allowance_amount * award.units : 0;
}

// ------------------------------------------------------------------------------
// DATA: load, then lock in finished weeks
// ------------------------------------------------------------------------------
async function loadRewardAwards() {
    const { data, error } = await _supabase
        .from('reward_awards')
        .select('*')
        .order('earned_on', { ascending: false });
    if (error) throw error;
    rewardAwards = data || [];
}

async function loadRewardData() {
    if (!currentUser) {
        rewards = [];
        rewardAwards = [];
        rewardsLoadError = '';
        return;
    }
    try {
        const { data: compData, error: compError } = await _supabase
            .from('habit_completions')
            .select('habit_id, member_name, completed_date');
        if (compError) throw compError;
        allHabitCompletions = compData || [];

        const { data: rewardData, error: rewardError } = await _supabase
            .from('rewards')
            .select('*')
            .order('created_at', { ascending: true });
        if (rewardError) throw rewardError;
        rewards = rewardData || [];

        await loadRewardAwards();
        await syncRewardAwards();
        await loadRewardAwards();
        rewardsLoadError = '';
    } catch (e) {
        rewardsLoadError = e.message || String(e);
        console.warn('Rewards not loaded:', rewardsLoadError);
        rewards = [];
        rewardAwards = [];
    }
}

// Writes each finished week a published reward was met for. Existing rows, voided ones
// included, are never written again. A duplicate from another device (23505) is ignored.
async function syncRewardAwards() {
    const today = isoOf(new Date());
    for (const reward of rewards.filter(r => r.status === 'published')) {
        const memberKey = reward.member_name || null;
        for (const week of closedWeeks(reward, today)) {
            const mine = rewardAwards.filter(a => a.reward_id === reward.id && (a.member_name || null) === memberKey);
            if (mine.some(a => a.period_start === week.start)) continue;
            if (!reward.repeatable && mine.length > 0) break;

            const result = evaluateReward(reward, week.start, week.end);
            if (!result.met) continue;

            const { error } = await _supabase.from('reward_awards').insert([{
                reward_id: reward.id,
                member_name: memberKey,
                period_start: week.start,
                period_end: week.end,
                earned_on: week.end,
                units: result.units,
                suggested_amount: reward.allowance_amount,
                source: 'auto'
            }]);
            if (error && error.code !== '23505') {
                showError('Could not lock in a reward: ' + error.message);
            }
            if (!reward.repeatable) break;
        }
    }
}

async function refreshRewards() {
    await loadRewardData();
    renderHomeRewards();
    if (currentView === 'rewards') renderRewardsPage();
}

// ------------------------------------------------------------------------------
// HOME: ready-to-cash list and pinned progress cards
// ------------------------------------------------------------------------------
function renderHomeRewards() {
    const container = $('home-rewards');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = '';
        return;
    }
    if (rewardsLoadError) {
        container.innerHTML = `<div class="card reward-note">Rewards are not set up in the database yet. Run <code>supabase/rewards_migration.sql</code> in the Supabase SQL editor.</div>`;
        return;
    }

    const week = weekBounds(isoOf(new Date()));
    const ready = rewardAwards.filter(a => awardStatus(a) === 'ready').sort(byEarnedDesc);
    const pinned = rewards.filter(r => r.status === 'published' && r.pinned);

    const readyHtml = ready.length === 0 ? '' : `
        <div class="card reward-ready">
            <div class="reward-card-head">
                <strong>🎉 Ready to cash in? (${ready.length})</strong>
                ${ready.length > 1 ? '<button class="btn btn-small btn-mint" data-reward-action="cash-all">Cash all</button>' : ''}
            </div>
            ${ready.map(awardRowHtml).join('')}
        </div>`;

    container.innerHTML = `
        <div class="section-header">
            <span class="section-badge badge-rewards">🎁 Family Rewards</span>
            <button class="btn btn-small btn-white" data-reward-action="open-page">Manage</button>
        </div>
        ${readyHtml}
        ${pinned.map(r => homeRewardCardHtml(r, week)).join('') || '<div class="card reward-empty">No pinned rewards yet. Tap Manage to draft one.</div>'}
    `;
}

function homeRewardCardHtml(reward, week) {
    const result = evaluateReward(reward, week.start, week.end);
    const pct = Math.round(result.progress * 100);
    const owner = reward.member_name ? familyMembers.find(m => m.name === reward.member_name) : null;
    const color = owner && owner.color ? owner.color : 'var(--mint)';

    let status = `${pct}% this week`;
    if (result.met) {
        status = reward.kind === 'extra_credit'
            ? `✅ +${result.units} extra so far`
            : '✅ Met so far. It locks in when the week ends.';
    }

    const reqLines = result.results
        .map(r => `<div>${r.met ? '✅' : '⬜'} ${escapeHtml(r.label)} · ${escapeHtml(r.detail)}</div>`)
        .join('');

    return `
        <div class="reward-card">
            <div class="reward-card-head">
                <span class="reward-card-name">${escapeHtml(reward.name)}</span>
                <span class="badge-chip">${owner ? escapeHtml(owner.name) : 'Whole family'}</span>
            </div>
            ${reward.description ? `<div class="reward-desc">${escapeHtml(reward.description)}</div>` : ''}
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width:${pct}%; background-color:${color};"></div>
            </div>
            <div class="card-stat-text">${status}</div>
            <div class="reward-req">${reqLines}</div>
            ${suggestionLineHtml(reward)}
        </div>`;
}

function suggestionLineHtml(reward) {
    if (!(reward.allowance_amount > 0)) return '';
    const per = reward.kind === 'extra_credit' ? ' per credit' : '';
    return `<div class="reward-suggest">${REWARD_SUGGESTION_NOTE}: ${formatMoney(reward.allowance_amount)}${per}</div>`;
}

// One archive row. Used on home (ready list) and on the rewards page (timeline).
function awardRowHtml(award) {
    const reward = rewardById(award.reward_id);
    const name = reward ? reward.name : 'Removed reward';
    const status = awardStatus(award);
    const pillText = status === 'ready' ? 'Ready to cash'
        : status === 'cashed' ? `Cashed ${shortDate(award.cashed_on)}`
        : 'Voided';
    const owner = award.member_name ? escapeHtml(award.member_name) : 'Whole family';
    const units = award.units > 1 ? ` ×${award.units}` : '';
    const amount = awardSuggested(award);

    let actions = '';
    if (status === 'ready') actions += `<button class="btn btn-small btn-mint" data-reward-action="cash" data-award-id="${award.id}">Cash in</button>`;
    if (status === 'cashed') actions += `<button class="btn btn-small btn-white" data-reward-action="uncash" data-award-id="${award.id}">Undo cash</button>`;
    actions += `<button class="btn btn-small btn-white" data-reward-action="edit-award" data-award-id="${award.id}">Edit</button>`;

    return `
        <div class="reward-row">
            <div>
                <strong>${escapeHtml(name)}</strong>${units} · ${owner} · earned ${shortDate(award.earned_on)}
                <span class="reward-pill ${status}">${pillText}</span>
                ${amount > 0 ? `<div class="reward-suggest">${REWARD_SUGGESTION_NOTE}: ${formatMoney(amount)}</div>` : ''}
                ${award.note ? `<div class="reward-suggest">${escapeHtml(award.note)}</div>` : ''}
            </div>
            <div class="reward-actions">${actions}</div>
        </div>`;
}

// ------------------------------------------------------------------------------
// REWARDS PAGE: manage rewards and the timeline and bank
// ------------------------------------------------------------------------------
function openRewardsPage() {
    playPopTone();
    $('settings-modal').style.display = 'none';
    switchView('rewards');
}

function renderRewardsPage() {
    const list = $('rewards-list');
    if (!list) return;
    if (rewardsLoadError) {
        list.innerHTML = `<div class="card reward-note">Rewards are not set up in the database yet. Run <code>supabase/rewards_migration.sql</code> in the Supabase SQL editor.</div>`;
        $('rewards-filter').innerHTML = '';
        $('rewards-timeline').innerHTML = '';
        return;
    }

    const order = { published: 0, draft: 1, archived: 2 };
    const sorted = [...rewards].sort((a, b) => order[a.status] - order[b.status]);
    list.innerHTML = sorted.map(rewardManageCardHtml).join('') || '<div class="card reward-empty">No rewards yet. Tap New Reward to draft one.</div>';

    renderRewardTimeline();
}

function rewardManageCardHtml(reward) {
    const owner = reward.member_name ? escapeHtml(reward.member_name) : 'Whole family';
    const repeat = reward.kind === 'extra_credit' ? 'Extra credits each week'
        : reward.repeatable ? 'Repeats weekly' : 'One time only';
    const reqs = reward.requirements.map(r => escapeHtml(describeRequirement(r))).join('; ') || 'No requirements';

    const button = (action, label, extraClass = 'btn-white') =>
        `<button class="btn btn-small ${extraClass}" data-reward-action="${action}" data-reward-id="${reward.id}">${label}</button>`;
    let actions = '';
    if (reward.status === 'published') {
        actions = button('toggle-publish', 'Unpublish') + button('toggle-pin', reward.pinned ? 'Unpin' : 'Pin')
            + button('edit-reward', 'Edit') + button('archive-reward', 'Archive');
    } else if (reward.status === 'draft') {
        actions = button('toggle-publish', 'Publish', 'btn-mint') + button('edit-reward', 'Edit')
            + button('delete-reward', 'Delete', 'btn-danger');
    } else {
        actions = button('restore-reward', 'Restore to draft') + button('delete-reward', 'Delete', 'btn-danger');
    }

    const pinNote = reward.status === 'published' && reward.pinned ? ' · 📌 Pinned on home' : '';
    return `
        <div class="reward-card">
            <div class="reward-card-head">
                <span class="reward-card-name">${escapeHtml(reward.name)}</span>
                <span class="reward-pill ${reward.status}">${reward.status}</span>
            </div>
            ${reward.description ? `<div class="reward-desc">${escapeHtml(reward.description)}</div>` : ''}
            <div class="reward-req">For: ${owner} · Weekly · ${repeat}${pinNote}</div>
            <div class="reward-req">Needs: ${reqs}</div>
            ${suggestionLineHtml(reward)}
            <div class="reward-actions">${actions}</div>
        </div>`;
}

function renderRewardTimeline() {
    const filters = [['all', 'All'], ...familyMembers.map(m => [m.name, m.name])];
    $('rewards-filter').innerHTML = filters
        .map(([value, label]) => `<button class="btn btn-small btn-white${rewardsTimelineFilter === value ? ' active' : ''}" data-reward-action="filter" data-member="${escapeHtml(value)}">${escapeHtml(label)}</button>`)
        .join('');

    const rows = rewardAwards
        .filter(a => rewardsTimelineFilter === 'all' || a.member_name === rewardsTimelineFilter)
        .sort(byEarnedDesc);

    let summary = '';
    if (rewardsTimelineFilter !== 'all') {
        const owed = rows.filter(a => awardStatus(a) === 'ready').reduce((sum, a) => sum + awardSuggested(a), 0);
        if (owed > 0) summary = `<div class="card reward-note">Suggested amount not yet cashed in for ${escapeHtml(rewardsTimelineFilter)}: ${formatMoney(owed)}</div>`;
    }

    $('rewards-timeline').innerHTML = summary + (rows.map(awardRowHtml).join('')
        || '<div class="card reward-empty">No awards yet. A week shows up here once every requirement is met and the week has ended.</div>');
}

// ------------------------------------------------------------------------------
// REWARD EDITOR (draft, publish, edit)
// ------------------------------------------------------------------------------
function openRewardModal(rewardId) {
    playPopTone();
    editingRewardId = rewardId;
    const reward = rewardId ? rewardById(rewardId) : null;

    $('reward-modal-title').textContent = reward ? 'Edit Reward' : 'New Reward';
    $('reward-name').value = reward ? reward.name : '';
    $('reward-description').value = reward ? (reward.description || '') : '';
    $('reward-kind').value = reward ? reward.kind : 'standard';
    $('reward-allowance').value = reward ? reward.allowance_amount : 0;
    $('reward-repeatable').checked = reward ? reward.repeatable : true;
    $('reward-who').innerHTML = '<option value="">Whole family</option>'
        + familyMembers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    $('reward-who').value = reward ? (reward.member_name || '') : '';
    $('req-member').innerHTML = familyMembers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    rewardDraftRequirements = reward ? reward.requirements.map(r => ({ ...r })) : [];

    populateReqHabits();
    syncRewardFormKind();
    renderRequirementList();
    rewardFormError('');
    $('reward-modal').style.display = 'flex';
}

function rewardFormError(message) {
    $('reward-form-error').textContent = message;
}

// Extra-credit rewards track one task, belong to that task's person, and always repeat.
function syncRewardFormKind() {
    const extra = $('reward-kind').value === 'extra_credit';
    if (extra) {
        $('req-type').value = 'habit';
        $('reward-repeatable').checked = true;
    }
    $('req-type').disabled = extra;
    $('reward-repeatable').disabled = extra;
    $('reward-who-field').style.display = extra ? 'none' : 'block';

    const type = $('req-type').value;
    $('req-family-fields').style.display = type === 'family' ? 'block' : 'none';
    $('req-habit-fields').style.display = type === 'habit' ? 'block' : 'none';
}

function populateReqHabits() {
    const habits = trackedHabitsFor($('req-member').value);
    $('req-habit').innerHTML = habits.length
        ? habits.map(h => `<option value="${h.id}">${escapeHtml(h.emoji || '')} ${escapeHtml(h.name)}</option>`).join('')
        : '<option value="">No tasks for this person</option>';
    if (habits.length) $('req-count').value = habitTarget(habits[0]);
}

function renderRequirementList() {
    const list = $('req-list');
    if (rewardDraftRequirements.length === 0) {
        list.innerHTML = '<div class="reward-suggest">No requirements yet.</div>';
        return;
    }
    list.innerHTML = `<ul class="reward-req-list">${rewardDraftRequirements.map((r, i) => `
        <li>
            <span>${escapeHtml(describeRequirement(r))}</span>
            <button type="button" class="btn btn-small btn-white" data-reward-action="remove-req" data-index="${i}">Remove</button>
        </li>`).join('')}</ul>`;
}

function addRequirementFromForm() {
    const extra = $('reward-kind').value === 'extra_credit';
    let req;
    if ($('req-type').value === 'family') {
        const percent = parseInt($('req-percent').value, 10);
        if (!(percent >= 1 && percent <= 100)) return rewardFormError('Enter a percent from 1 to 100.');
        req = { kind: 'family', min_percent: percent };
    } else {
        const habitId = $('req-habit').value;
        const count = parseInt($('req-count').value, 10);
        if (!habitId) return rewardFormError('Pick a task.');
        if (!(count >= 1)) return rewardFormError('Enter how many times a week, at least 1.');
        req = { kind: 'habit', habit_id: habitId, min_count: count };
    }
    rewardFormError('');
    rewardDraftRequirements = extra ? [req] : [...rewardDraftRequirements, req];
    renderRequirementList();
}

async function saveRewardFromModal(status) {
    const name = $('reward-name').value.trim();
    const kind = $('reward-kind').value;
    const amount = parseFloat($('reward-allowance').value || '0');

    if (!name) return rewardFormError('Give the reward a name.');
    if (!(amount >= 0)) return rewardFormError('The suggested allowance cannot be negative.');
    if (rewardDraftRequirements.length === 0) return rewardFormError('Add at least one requirement.');

    let memberName = $('reward-who').value || null;
    if (kind === 'extra_credit') {
        const req = rewardDraftRequirements[0];
        const habit = rewardDraftRequirements.length === 1 && req.kind === 'habit'
            ? allHabits.find(h => h.id === req.habit_id)
            : null;
        if (!habit) return rewardFormError('An extra-credit reward tracks exactly one task.');
        memberName = habit.member_name;
    }

    const existing = editingRewardId ? rewardById(editingRewardId) : null;
    const payload = {
        name,
        description: $('reward-description').value.trim() || null,
        kind,
        member_name: memberName,
        requirements: rewardDraftRequirements,
        period: 'week',
        repeatable: kind === 'extra_credit' ? true : $('reward-repeatable').checked,
        allowance_amount: amount,
        status
    };
    if (status === 'published' && (!existing || existing.status !== 'published')) {
        payload.starts_on = isoOf(new Date());
    }

    const { error } = existing
        ? await _supabase.from('rewards').update(payload).eq('id', existing.id)
        : await _supabase.from('rewards').insert([payload]);
    if (error) return rewardFormError(error.message);

    $('reward-modal').style.display = 'none';
    showToast(status === 'published' ? '🎁 Reward published' : '💾 Draft saved');
    await refreshRewards();
}

// ------------------------------------------------------------------------------
// STATUS, PIN, DELETE, CASH-IN
// ------------------------------------------------------------------------------
async function setRewardStatus(rewardId, status) {
    const reward = rewardById(rewardId);
    if (!reward) return;
    const patch = { status };
    if (status === 'published' && reward.status !== 'published') {
        patch.starts_on = isoOf(new Date());
    }
    const { error } = await _supabase.from('rewards').update(patch).eq('id', rewardId);
    if (error) return showError('Could not update reward: ' + error.message);
    await refreshRewards();
}

async function togglePinned(rewardId) {
    const reward = rewardById(rewardId);
    if (!reward) return;
    const { error } = await _supabase.from('rewards').update({ pinned: !reward.pinned }).eq('id', rewardId);
    if (error) return showError('Could not update pin: ' + error.message);
    await refreshRewards();
}

async function deleteReward(rewardId) {
    const reward = rewardById(rewardId);
    if (!reward) return;
    if (!confirm(`Delete "${reward.name}"? This cannot be undone.`)) return;
    const { error } = await _supabase.from('rewards').delete().eq('id', rewardId);
    if (error) {
        const hasHistory = /foreign key|violates/i.test(error.message);
        return showError(hasHistory
            ? 'This reward already has entries in the archive, so archive it instead.'
            : 'Could not delete reward: ' + error.message);
    }
    await refreshRewards();
}

async function setAwardCashed(awardId, cashed) {
    const { error } = await _supabase
        .from('reward_awards')
        .update({ cashed_on: cashed ? isoOf(new Date()) : null })
        .eq('id', awardId);
    if (error) return showError('Could not update cash-in: ' + error.message);
    if (cashed) {
        playSuccessChime();
        showToast('🎉 Cashed in');
    }
    await refreshRewards();
}

async function cashAllReady() {
    const ids = rewardAwards.filter(a => awardStatus(a) === 'ready').map(a => a.id);
    if (ids.length === 0) return;
    const { error } = await _supabase
        .from('reward_awards')
        .update({ cashed_on: isoOf(new Date()) })
        .in('id', ids);
    if (error) return showError('Could not cash in: ' + error.message);
    playSuccessChime();
    showToast(`🎉 Cashed in ${ids.length}`);
    await refreshRewards();
}

// ------------------------------------------------------------------------------
// AWARD EDITOR (manual add, correct, void)
// ------------------------------------------------------------------------------
function openAwardModal(awardId) {
    playPopTone();
    editingAwardId = awardId;
    const award = awardId ? rewardAwards.find(a => a.id === awardId) : null;

    $('award-modal-title').textContent = award ? 'Edit Award' : 'Add Past Award';
    $('award-reward').innerHTML = rewards
        .map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    $('award-reward').value = award ? award.reward_id : (rewards[0] ? rewards[0].id : '');
    $('award-reward').disabled = !!award;
    $('award-earned').value = award ? award.earned_on : isoOf(new Date());
    $('award-units').value = award ? award.units : 1;
    $('award-cashed').value = award && award.cashed_on ? award.cashed_on : '';
    $('award-voided').checked = !!(award && award.voided);
    $('award-note').value = award ? (award.note || '') : '';
    $('award-error').textContent = '';
    $('award-modal').style.display = 'flex';
}

async function saveAward() {
    const earned = $('award-earned').value;
    const units = parseInt($('award-units').value, 10);
    const cashed = $('award-cashed').value || null;
    const note = $('award-note').value.trim() || null;
    const voided = $('award-voided').checked;

    if (!earned) return $('award-error').textContent = 'Pick the date it was earned.';
    if (!(units >= 1)) return $('award-error').textContent = 'Units must be 1 or more.';

    let result;
    if (editingAwardId) {
        result = await _supabase.from('reward_awards')
            .update({ earned_on: earned, units, cashed_on: cashed, note, voided })
            .eq('id', editingAwardId);
    } else {
        const reward = rewardById($('award-reward').value);
        if (!reward) return $('award-error').textContent = 'Pick a reward.';
        const week = weekBounds(earned);
        result = await _supabase.from('reward_awards').insert([{
            reward_id: reward.id,
            member_name: reward.member_name || null,
            period_start: week.start,
            period_end: week.end,
            earned_on: earned,
            units,
            suggested_amount: reward.allowance_amount,
            source: 'manual',
            note,
            cashed_on: cashed,
            voided
        }]);
    }

    if (result.error) return $('award-error').textContent = result.error.message;
    $('award-modal').style.display = 'none';
    await refreshRewards();
}

// ------------------------------------------------------------------------------
// WIRING
// ------------------------------------------------------------------------------
// Buttons carry data-reward-action, so one delegated listener covers every view and modal.
function handleRewardAction(action, data) {
    switch (action) {
        case 'open-page': return openRewardsPage();
        case 'home': playPopTone(); return switchView('home');
        case 'new-reward': return openRewardModal(null);
        case 'edit-reward': return openRewardModal(data.rewardId);
        case 'toggle-publish': {
            const reward = rewardById(data.rewardId);
            return setRewardStatus(data.rewardId, reward && reward.status === 'published' ? 'draft' : 'published');
        }
        case 'archive-reward': return setRewardStatus(data.rewardId, 'archived');
        case 'restore-reward': return setRewardStatus(data.rewardId, 'draft');
        case 'toggle-pin': return togglePinned(data.rewardId);
        case 'delete-reward': return deleteReward(data.rewardId);
        case 'filter': playPopTone(); rewardsTimelineFilter = data.member; return renderRewardsPage();
        case 'cash': return setAwardCashed(data.awardId, true);
        case 'uncash': return setAwardCashed(data.awardId, false);
        case 'cash-all': return cashAllReady();
        case 'edit-award': return openAwardModal(data.awardId);
        case 'add-award': return openAwardModal(null);
        case 'add-req': return addRequirementFromForm();
        case 'remove-req': rewardDraftRequirements.splice(parseInt(data.index, 10), 1); return renderRequirementList();
        case 'save-draft': return saveRewardFromModal('draft');
        case 'save-publish': return saveRewardFromModal('published');
        case 'save-award': return saveAward();
        case 'close-modal': $(data.modal).style.display = 'none'; return;
        default: return;
    }
}

function initRewards() {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-reward-action]');
        if (el) handleRewardAction(el.dataset.rewardAction, el.dataset);
    });

    $('reward-kind').addEventListener('change', syncRewardFormKind);
    $('req-type').addEventListener('change', syncRewardFormKind);
    $('req-member').addEventListener('change', populateReqHabits);
    $('req-habit').addEventListener('change', () => {
        const habit = allHabits.find(h => h.id === $('req-habit').value);
        if (habit) $('req-count').value = habitTarget(habit);
    });
}
