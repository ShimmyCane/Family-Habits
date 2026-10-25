// ==============================================================================
// FAMILY HABITS — CLIENT APPLICATION v0.4
// Features: Task Bank / Working Folder & Indefinite Habit Carry-Over
// ==============================================================================

const SUPABASE_URL = 'https://twvqvutrcobedvuhnzxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eqUo8HEdEB1hMQM4CpSVqA_9i6b0qCo';

// Initialize Supabase Client
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Default Family Members
const DEFAULT_MEMBERS = [
    { name: 'Athena', avatar: '🦄', color: '#ff6b9d', role: 'kid' },
    { name: 'Felix',  avatar: '🦊', color: '#6bd8a0', role: 'kid' },
    { name: 'Ying',   avatar: '🌸', color: '#ffd23f', role: 'parent' },
    { name: 'Jimmy',  avatar: '☕', color: '#4cc9f0', role: 'parent' }
];

const AVATAR_OPTIONS = ['🦄', '🦊', '🌸', '☕', '🐼', '🦁', '🐯', '🚀', '🌟', '🎨', '⚽', '🎸', '👑', '🦖', '🍦'];
const COLOR_OPTIONS = ['#ff6b9d', '#6bd8a0', '#ffd23f', '#4cc9f0', '#9b5de5', '#ff7b54'];

// Affirmations Data
let affirmationsData = {
    general: ["🌟 Way to go!", "🎉 Awesome job!", "🙌 You're on a roll!", "✨ Great habit power!"],
    chores: ["🧹 Chore champion!", "🛏️ Tidy space, happy mind!"],
    goals: ["🎯 Goal crushed!", "📚 Knowledge power leveling up!"],
    meetingReel: ["🏆 Outstanding effort this week!", "🔥 Pure dedication and consistency!"]
};

// Application State
let currentUser = null;
let currentView = 'home'; // 'home' | 'member' | 'meeting'
let currentMember = 'Athena';
let weekOffset = 0; // 0 = current week (habits carry over indefinitely to all offsets)
let familyMembers = [...DEFAULT_MEMBERS];
let allHabits = []; // all habits (both active and bank/inactive)
let memberHabits = [];
let allCompletions = [];
let currentWeeklyReflection = '';
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let gracePeriodDays = parseInt(localStorage.getItem('gracePeriodDays'), 10) || 14;
let habitToDelete = null;

// Profile Customization Staging State
let selectedCustomAvatar = '🦄';
let selectedCustomColor = '#ff6b9d';

// Celebration Reel State
let reelIndex = 0;
let reelProgressTimer = null;
let reelPaused = false;
let reelElapsedMs = 0; // time in the current scene
let reelPersonElapsedMs = 0; // time through the whole reel for the current person
let reelPersonMs = 0; // total length of the current person's reel
let reelScenes = [];
let reelSceneIndex = 0;
let reelSceneMs = 0;
let reelSceneToken = 0;
let reelPreviousCompletions = null; // last week's completions, null if they could not be loaded
const REEL_STEP_MS = 100;

// Helper DOM selector
const $ = (id) => document.getElementById(id);

// Load Affirmations JSON
async function loadAffirmations() {
    try {
        const res = await fetch('affirmations.json');
        if (res.ok) {
            const data = await res.json();
            affirmationsData = data;
        }
    } catch (e) {
        console.warn('Using fallback affirmations:', e);
    }
}

// ==============================================================================
// WEB AUDIO SYNTHESIZER
// ==============================================================================
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playPopTone() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
        console.warn('Audio play error', e);
    }
}

function playSuccessChime() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
            gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.07);
            osc.stop(ctx.currentTime + idx * 0.07 + 0.25);
        });
    } catch (e) {
        console.warn('Audio play error', e);
    }
}

function playFanfare() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const chords = [
            [523.25, 659.25, 783.99],
            [587.33, 739.99, 880.00],
            [659.25, 830.61, 987.77],
            [783.99, 1046.50, 1318.51]
        ];
        chords.forEach((chord, i) => {
            const time = ctx.currentTime + i * 0.12;
            chord.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.15, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(time);
                osc.stop(time + 0.35);
            });
        });
    } catch (e) {
        console.warn('Fanfare error', e);
    }
}

// ==============================================================================
// ERROR HANDLING & DIAGNOSTICS
// ==============================================================================
function showError(msg) {
    console.error(msg);
    const banner = $('error-banner');
    if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = '⚠️ <strong>Notice:</strong> ' + msg;
    }
}

function clearError() {
    const banner = $('error-banner');
    if (banner) banner.style.display = 'none';
}

function showToast(text) {
    const toast = $('cheer-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
}

async function runDiagnostics() {
    const panel = $('diag-panel');
    panel.style.display = 'block';
    $('diag-auth').innerHTML = '<span style="color:#888;">Checking...</span>';
    $('diag-members').innerHTML = '<span style="color:#888;">Checking...</span>';
    $('diag-habits').innerHTML = '<span style="color:#888;">Checking...</span>';
    $('diag-completions').innerHTML = '<span style="color:#888;">Checking...</span>';
    $('diag-reflections').innerHTML = '<span style="color:#888;">Checking...</span>';
    $('diag-sql-hint').style.display = 'none';

    let hasErrors = false;

    // Check Auth
    const { data: authData } = await _supabase.auth.getSession();
    if (authData && authData.session) {
        $('diag-auth').innerHTML = '<span class="diag-status-ok">Logged in as ' + (authData.session.user.email || 'user') + '</span>';
    } else {
        $('diag-auth').innerHTML = '<span class="diag-status-fail">Not logged in (Anon mode)</span>';
    }

    const checkTable = async (tableName, elemId) => {
        try {
            const { error } = await _supabase.from(tableName).select('count');
            if (error) {
                $(elemId).innerHTML = '<span class="diag-status-fail">Error: ' + error.message + '</span>';
                hasErrors = true;
            } else {
                $(elemId).innerHTML = '<span class="diag-status-ok">Table OK</span>';
            }
        } catch (e) {
            $(elemId).innerHTML = '<span class="diag-status-fail">' + e.message + '</span>';
            hasErrors = true;
        }
    };

    await checkTable('family_members', 'diag-members');
    await checkTable('habits', 'diag-habits');
    await checkTable('habit_completions', 'diag-completions');
    await checkTable('family_reflections', 'diag-reflections');

    if (hasErrors) {
        $('diag-sql-hint').style.display = 'block';
    }
}

// ==============================================================================
// DATE / WEEK CALCULATION (SUNDAY NIGHT RESET)
// ==============================================================================
function getWeekDates(offset = 0) {
    const now = new Date();
    now.setDate(now.getDate() + offset * 7);

    const dayOfWeek = now.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);

    const weekDays = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const isoDate = `${yyyy}-${mm}-${dd}`;

        const todayObj = new Date();
        const isToday = d.toDateString() === todayObj.toDateString();

        weekDays.push({
            name: dayNames[i],
            dateNum: d.getDate(),
            monthNum: d.getMonth() + 1,
            iso: isoDate,
            isToday: isToday
        });
    }
    return weekDays;
}

// ==============================================================================
// DATA FETCHING & SYNC
// ==============================================================================
async function loadFamilyMembers() {
    try {
        const { data, error } = await _supabase
            .from('family_members')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.warn('Could not load family members, using defaults:', error.message);
            familyMembers = DEFAULT_MEMBERS;
        } else if (data && data.length > 0) {
            familyMembers = data;
        } else {
            familyMembers = DEFAULT_MEMBERS;
        }
    } catch (e) {
        console.warn('Error loading members:', e);
        familyMembers = DEFAULT_MEMBERS;
    }
}

async function loadAllData() {
    clearError();
    const currentWeek = getWeekDates(weekOffset);
    const startDate = currentWeek[0].iso;
    const endDate = currentWeek[6].iso;

    try {
        // Load all habits (active and archived/banked)
        const { data: habitsData, error: habitsError } = await _supabase
            .from('habits')
            .select('*')
            .order('created_at', { ascending: true });

        if (habitsError) {
            showError('Could not load habits: ' + habitsError.message);
            allHabits = [];
        } else {
            allHabits = habitsData || [];
        }

        // Load completions for the current week
        const { data: compData, error: compError } = await _supabase
            .from('habit_completions')
            .select('*')
            .gte('completed_date', startDate)
            .lte('completed_date', endDate);

        if (compError) {
            console.warn('Error loading completions:', compError.message);
            allCompletions = [];
        } else {
            allCompletions = compData || [];
        }

        await loadWeeklyReflection(startDate);

    } catch (e) {
        showError('Network/DB Exception: ' + e.message);
        allHabits = [];
        allCompletions = [];
    }

    // Active habits carry over indefinitely
    memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
    renderCurrentView();
}

async function loadWeeklyReflection(startDate) {
    try {
        const { data, error } = await _supabase
            .from('family_reflections')
            .select('reflection_text')
            .eq('week_start_date', startDate)
            .maybeSingle();

        if (data && data.reflection_text) {
            currentWeeklyReflection = data.reflection_text;
        } else {
            currentWeeklyReflection = localStorage.getItem(`reflection_${startDate}`) || '';
        }
    } catch (e) {
        currentWeeklyReflection = localStorage.getItem(`reflection_${startDate}`) || '';
    }

    const input = $('weekly-reflection-input');
    if (input) input.value = currentWeeklyReflection;
}

// ==============================================================================
// BADGE & STREAK CALCULATIONS
// ==============================================================================
function calculateMemberBadges(memberName) {
    const badges = [];
    const mHabits = allHabits.filter(h => h.is_active !== false && h.member_name === memberName);
    if (mHabits.length === 0) return badges;

    const currentWeek = getWeekDates(weekOffset);
    const weekIsoDates = currentWeek.map(d => d.iso);
    const mCompletions = allCompletions.filter(c => c.member_name === memberName && weekIsoDates.includes(c.completed_date));

    // Badge 1: Starter
    if (mCompletions.length >= 1) {
        badges.push({ icon: '🌟', label: 'Starter' });
    }

    // Badge 2: Habit Streaker (3+ days)
    const has3Streak = mHabits.some(h => {
        const count = mCompletions.filter(c => c.habit_id === h.id).length;
        return count >= 3;
    });
    if (has3Streak) {
        badges.push({ icon: '🔥', label: 'Streak 3+' });
    }

    // Badge 3: Goal Crusher
    const goals = mHabits.filter(h => h.type === 'goal');
    const goalMet = goals.some(g => {
        const count = mCompletions.filter(c => c.habit_id === g.id).length;
        return count >= (g.target_count || 3);
    });
    if (goalMet) {
        badges.push({ icon: '🎯', label: 'Goal Met' });
    }

    // Badge 4: Chore Champ
    const chores = mHabits.filter(h => h.type === 'chore');
    if (chores.length > 0) {
        const allChoresMet = chores.every(c => {
            const count = mCompletions.filter(comp => comp.habit_id === c.id).length;
            return count >= (c.target_count || 7);
        });
        if (allChoresMet) {
            badges.push({ icon: '🧹', label: 'Chore Champ' });
        }
    }

    return badges;
}

// ==============================================================================
// VIEW SWITCHING & RENDERING
// ==============================================================================
function switchView(viewName) {
    currentView = viewName;
    $('home-view').style.display = viewName === 'home' ? 'block' : 'none';
    $('member-view').style.display = viewName === 'member' ? 'block' : 'none';
    $('meeting-view').style.display = viewName === 'meeting' ? 'block' : 'none';

    if (viewName === 'home') {
        renderHomeView();
    } else if (viewName === 'member') {
        renderMemberPicker();
        renderWeek();
        renderHabitLists();
    } else if (viewName === 'meeting') {
        startSundayMeeting();
    }
}

function renderCurrentView() {
    if (currentView === 'home') {
        renderHomeView();
    } else if (currentView === 'member') {
        renderMemberPicker();
        renderWeek();
        renderHabitLists();
    }
}

// ------------------------------------------------------------------------------
// VIEW 1: FRONT PAGE / HOME DASHBOARD
// ------------------------------------------------------------------------------
// Weekly score for one member. Every completion counts, including extra ones
// (bonuses), so extra work on one task can make up for a shortfall on another.
// The percent can go above 100.
function memberWeekScore(memberName) {
    const memberHabitsList = allHabits.filter(h => h.is_active !== false && h.member_name === memberName);
    let done = 0;
    let target = 0;
    memberHabitsList.forEach(habit => {
        target += habit.target_count || (habit.target_frequency === 'daily' ? 7 : 3);
        done += allCompletions.filter(c => c.habit_id === habit.id).length;
    });
    const percent = target > 0 ? Math.round((done / target) * 100) : 0;
    return { done, target, percent };
}

function renderHomeView() {
    const week = getWeekDates(weekOffset);
    const first = week[0];
    const last = week[6];
    $('home-week-label').textContent = `${first.monthNum}/${first.dateNum} – ${last.monthNum}/${last.dateNum}`;

    const container = $('home-summary-grid');
    container.innerHTML = '';

    familyMembers.forEach(member => {
        const { done, target, percent } = memberWeekScore(member.name);
        const badges = calculateMemberBadges(member.name);

        const card = document.createElement('div');
        card.className = 'family-member-card';
        card.style.borderTop = `6px solid ${member.color || 'var(--sun)'}`;

        let badgesHtml = badges.map(b => `<span class="badge-chip">${b.icon} ${b.label}</span>`).join('');

        card.innerHTML = `
            <div class="card-avatar">${member.avatar}</div>
            <div class="card-name">${member.name}</div>
            <div class="badge-chips">${badgesHtml}</div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width:${Math.min(percent, 100)}%; background-color:${member.color || 'var(--mint)'};"></div>
            </div>
            <div class="card-stat-text">${done}/${target} done (${percent}%)</div>
        `;

        card.addEventListener('click', () => {
            playPopTone();
            currentMember = member.name;
            memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
            switchView('member');
        });

        container.appendChild(card);
    });
}

// ------------------------------------------------------------------------------
// VIEW 2: INDIVIDUAL MEMBER TRACKER
// ------------------------------------------------------------------------------
function renderMemberPicker() {
    const container = $('member-picker');
    container.innerHTML = '';

    familyMembers.forEach((member) => {
        const btn = document.createElement('button');
        btn.className = 'member-btn' + (member.name === currentMember ? ' active' : '');
        btn.style.borderColor = 'var(--ink)';
        if (member.name === currentMember) {
            btn.style.backgroundColor = member.color || 'var(--sun)';
        }

        btn.innerHTML = `
            <span class="avatar">${member.avatar}</span>
            <span class="name">${member.name}</span>
        `;

        btn.addEventListener('click', () => {
            playPopTone();
            currentMember = member.name;
            memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
            renderMemberPicker();
            updateBanner();
            renderHabitLists();
        });

        container.appendChild(btn);
    });

    updateBanner();
}

function updateBanner() {
    const member = familyMembers.find(m => m.name === currentMember) || DEFAULT_MEMBERS[0];
    $('banner-avatar').textContent = member.avatar;
    $('banner-name').textContent = member.name;
    $('member-banner').style.backgroundColor = member.color || 'var(--sun)';

    const badges = calculateMemberBadges(member.name);
    $('banner-badges').innerHTML = badges.map(b => `<span class="badge-chip">${b.icon} ${b.label}</span>`).join('');
}

function renderWeek() {
    const week = getWeekDates(weekOffset);
    const headerContainer = $('week-days-header');
    headerContainer.innerHTML = '';

    const first = week[0];
    const last = week[6];
    let label = `${first.monthNum}/${first.dateNum} – ${last.monthNum}/${last.dateNum}`;
    if (weekOffset === 0) label = `This Week (${label})`;
    else if (weekOffset === -1) label = `Last Week (${label})`;
    else if (weekOffset === 1) label = `Next Week (${label})`;
    $('week-label').textContent = label;

    week.forEach(day => {
        const col = document.createElement('div');
        col.className = 'day-col' + (day.isToday ? ' today' : '');
        col.innerHTML = `
            <span class="day-name">${day.name}</span>
            <span class="day-date">${day.dateNum}</span>
        `;
        headerContainer.appendChild(col);
    });
}

function renderHabitLists() {
    const choresList = $('chores-list');
    const goalsList = $('goals-list');
    choresList.innerHTML = '';
    goalsList.innerHTML = '';

    const week = getWeekDates(weekOffset);
    const chores = memberHabits.filter(h => h.type === 'chore');
    const goals = memberHabits.filter(h => h.type === 'goal');

    $('chores-count').textContent = `${chores.length} active`;
    $('goals-count').textContent = `${goals.length} active`;

    if (chores.length === 0) {
        choresList.innerHTML = '<div class="card" style="text-align:center;padding:16px;color:#777;font-family:\'Patrick Hand\',cursive;font-size:18px;">No chores assigned yet. Tap "+ Add Task" or pick from the Task Bank!</div>';
    } else {
        chores.forEach(chore => choresList.appendChild(createHabitCard(chore, week)));
    }

    if (goals.length === 0) {
        goalsList.innerHTML = '<div class="card" style="text-align:center;padding:16px;color:#777;font-family:\'Patrick Hand\',cursive;font-size:18px;">No aspirational goals set yet. Tap "+ Add Task" or pick from the Task Bank!</div>';
    } else {
        goals.forEach(goal => goalsList.appendChild(createHabitCard(goal, week)));
    }
}

function createHabitCard(habit, week) {
    const card = document.createElement('div');
    card.className = 'habit-card';

    // Calculate completions this week
    const weekIsoDates = week.map(d => d.iso);
    const habitCompletionsThisWeek = allCompletions.filter(c => c.habit_id === habit.id && weekIsoDates.includes(c.completed_date));
    const completedCount = habitCompletionsThisWeek.length;
    const targetCount = habit.target_count || (habit.target_frequency === 'daily' ? 7 : 3);

    // Header info
    const topRow = document.createElement('div');
    topRow.className = 'habit-top';

    topRow.innerHTML = `
        <div class="habit-info">
            <span class="habit-emoji">${habit.emoji || '✨'}</span>
            <div>
                <div class="habit-title">${escapeHtml(habit.name)}</div>
                ${habit.description ? `<div class="habit-desc">${escapeHtml(habit.description)}</div>` : ''}
            </div>
        </div>
        <div class="habit-actions-right">
            <span class="streak-pill">${completedCount}/${targetCount} done</span>
            <button class="icon-btn edit-habit-btn" title="Edit Task">✏️</button>
            <button class="icon-btn delete-habit-btn" title="Remove to Task Bank">🗑️</button>
        </div>
    `;

    // Hook up Edit
    const editBtn = topRow.querySelector('.edit-habit-btn');
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditHabitModal(habit);
    });

    // Hook up Delete / Archive
    const deleteBtn = topRow.querySelector('.delete-habit-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptDeleteHabit(habit);
    });

    card.appendChild(topRow);

    // 7-day check bubble row
    const checkRow = document.createElement('div');
    checkRow.className = 'habit-check-row';

    week.forEach(day => {
        const isDone = allCompletions.some(c => c.habit_id === habit.id && c.completed_date === day.iso);
        const bubble = document.createElement('div');
        const isGoal = habit.type === 'goal';
        bubble.className = 'check-bubble' + (isDone ? (isGoal ? ' checked goal-checked' : ' checked') : '');
        bubble.innerHTML = isDone ? '⭐' : '';
        bubble.title = `${day.name} (${day.iso})`;

        bubble.addEventListener('click', async () => {
            await toggleCompletion(habit, day.iso, isDone);
        });

        checkRow.appendChild(bubble);
    });

    card.appendChild(checkRow);
    return card;
}

// ==============================================================================
// COMPLETION TOGGLE LOGIC
// ==============================================================================
async function toggleCompletion(habit, dateIso, currentlyDone) {
    playPopTone();

    if (!currentlyDone) {
        const newRecord = {
            habit_id: habit.id,
            member_name: currentMember,
            completed_date: dateIso,
            cheer_emoji: '😊'
        };
        allCompletions.push(newRecord);
        playSuccessChime();

        const list = (habit.type === 'chore' ? affirmationsData.chores : affirmationsData.goals) || affirmationsData.general;
        const phrase = list[Math.floor(Math.random() * list.length)] || "Awesome job!";
        showToast(`${phrase} ${currentMember}!`);
        renderHabitLists();
        updateBanner();

        try {
            const { error } = await _supabase.from('habit_completions').insert([newRecord]);
            if (error) {
                showError('Could not save completion to cloud: ' + error.message);
                allCompletions = allCompletions.filter(c => !(c.habit_id === habit.id && c.completed_date === dateIso));
                renderHabitLists();
                updateBanner();
            }
        } catch (e) {
            showError('Cloud save error: ' + e.message);
        }
    } else {
        allCompletions = allCompletions.filter(c => !(c.habit_id === habit.id && c.completed_date === dateIso));
        renderHabitLists();
        updateBanner();

        try {
            const { error } = await _supabase
                .from('habit_completions')
                .delete()
                .eq('habit_id', habit.id)
                .eq('completed_date', dateIso);

            if (error) {
                showError('Could not delete completion: ' + error.message);
                loadAllData();
            }
        } catch (e) {
            showError('Cloud delete error: ' + e.message);
        }
    }
}

// ==============================================================================
// IN-PLACE TASK EDITING & ADDING
// ==============================================================================
function openEditHabitModal(habit) {
    playPopTone();
    $('edit-habit-id').value = habit.id;
    $('task-modal-title').textContent = '✏️ Edit Chore / Goal';
    $('task-modal-submit').textContent = 'Update Task ✨';

    $('habit-member').value = habit.member_name;
    $('habit-type').value = habit.type;
    $('habit-name').value = habit.name;
    $('habit-emoji').value = habit.emoji || '✨';
    $('habit-desc').value = habit.description || '';
    $('habit-freq').value = habit.target_frequency || 'daily';
    $('habit-target').value = habit.target_count || 7;

    $('add-modal').style.display = 'flex';
}

function openAddHabitModal() {
    playPopTone();
    $('edit-habit-id').value = '';
    $('task-modal-title').textContent = '✨ Add Chore / Goal';
    $('task-modal-submit').textContent = 'Save Task ✨';
    $('new-habit-form').reset();
    $('habit-member').value = currentMember;
    $('add-modal').style.display = 'flex';
}

async function handleHabitFormSubmit(e) {
    e.preventDefault();
    playPopTone();

    const editId = $('edit-habit-id').value;
    const memberName = $('habit-member').value;
    const habitType = $('habit-type').value;
    const habitName = $('habit-name').value.trim();
    const habitEmoji = $('habit-emoji').value.trim() || '✨';
    const habitDesc = $('habit-desc').value.trim();
    const habitFreq = $('habit-freq').value;
    const habitTarget = parseInt($('habit-target').value, 10) || 7;

    if (!habitName) return;

    if (editId) {
        const updateData = {
            member_name: memberName,
            type: habitType,
            name: habitName,
            emoji: habitEmoji,
            description: habitDesc,
            target_frequency: habitFreq,
            target_count: habitTarget
        };

        const idx = allHabits.findIndex(h => h.id === editId);
        if (idx !== -1) {
            allHabits[idx] = { ...allHabits[idx], ...updateData };
        }
        memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
        renderHabitLists();
        $('add-modal').style.display = 'none';
        showToast('✨ Task updated!');

        try {
            const { error } = await _supabase
                .from('habits')
                .update(updateData)
                .eq('id', editId);

            if (error) {
                showError('Failed to update task: ' + error.message);
                loadAllData();
            }
        } catch (e) {
            showError('Network error updating task: ' + e.message);
        }
    } else {
        const newHabit = {
            member_name: memberName,
            type: habitType,
            name: habitName,
            emoji: habitEmoji,
            description: habitDesc,
            target_frequency: habitFreq,
            target_count: habitTarget,
            is_active: true
        };

        try {
            const { data, error } = await _supabase.from('habits').insert([newHabit]).select();
            if (error) {
                showError('Failed to add task: ' + error.message);
            } else {
                showToast('✨ Task created successfully!');
                if (data && data[0]) allHabits.push(data[0]);
                $('new-habit-form').reset();
                $('add-modal').style.display = 'none';

                if (memberName !== currentMember) {
                    currentMember = memberName;
                }
                memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
                renderMemberPicker();
                updateBanner();
                renderHabitLists();
                renderHomeView();
            }
        } catch (e) {
            showError('Network error adding habit: ' + e.message);
        }
    }
}

// ==============================================================================
// TASK BANK & WORKING FOLDER (Soft Delete & Reassignment)
// ==============================================================================
function promptDeleteHabit(habit) {
    playPopTone();
    habitToDelete = habit;
    $('delete-task-msg').textContent = `Remove "${habit.name}" from ${habit.member_name}?`;
    $('delete-modal').style.display = 'flex';
}

async function confirmArchiveHabit() {
    if (!habitToDelete) return;
    playPopTone();

    const habitId = habitToDelete.id;
    $('delete-modal').style.display = 'none';

    // Soft delete: move to Task Bank
    const habit = allHabits.find(h => h.id === habitId);
    if (habit) habit.is_active = false;

    memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
    renderHabitLists();
    renderHomeView();
    updateBanner();
    showToast('📦 Saved into Task Bank / Working Folder!');

    try {
        const { error } = await _supabase
            .from('habits')
            .update({ is_active: false })
            .eq('id', habitId);

        if (error) {
            showError('Failed to archive task: ' + error.message);
            loadAllData();
        }
    } catch (e) {
        showError('Archive error: ' + e.message);
    } finally {
        habitToDelete = null;
    }
}

async function confirmDeleteHabit() {
    if (!habitToDelete) return;
    playPopTone();

    const habitId = habitToDelete.id;
    $('delete-modal').style.display = 'none';

    allHabits = allHabits.filter(h => h.id !== habitId);
    memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
    allCompletions = allCompletions.filter(c => c.habit_id !== habitId);
    renderHabitLists();
    renderHomeView();
    showToast('Task permanently deleted');

    try {
        const { error } = await _supabase.from('habits').delete().eq('id', habitId);
        if (error) {
            showError('Failed to delete task: ' + error.message);
            loadAllData();
        }
    } catch (e) {
        showError('Delete error: ' + e.message);
    } finally {
        habitToDelete = null;
    }
}

let bankFilterQuery = '';

function openTaskBankModal() {
    playPopTone();
    bankFilterQuery = '';
    const searchInput = $('bank-search-input');
    if (searchInput) searchInput.value = '';
    $('bank-modal').style.display = 'flex';
    renderTaskBank();
}

function getUniqueBankTasks() {
    const taskMap = new Map();

    allHabits.forEach(habit => {
        const normKey = (habit.name || '').trim().toLowerCase();
        if (!normKey) return;

        if (!taskMap.has(normKey)) {
            taskMap.set(normKey, {
                key: normKey,
                name: habit.name.trim(),
                emoji: habit.emoji || '⭐',
                type: habit.type || 'chore',
                description: habit.description || '',
                target_frequency: habit.target_frequency || 'daily',
                target_count: habit.target_count || 7,
                activeMembers: [],
                inactiveMembers: [],
                habitIds: [],
                habits: [],
                totalCompletions: 0,
                popularityScore: 0
            });
        }

        const entry = taskMap.get(normKey);
        entry.habitIds.push(habit.id);
        entry.habits.push(habit);
        if (habit.emoji && habit.emoji !== '⭐') entry.emoji = habit.emoji;
        if (habit.description) entry.description = habit.description;

        if (habit.is_active !== false) {
            if (!entry.activeMembers.includes(habit.member_name)) {
                entry.activeMembers.push(habit.member_name);
            }
        } else {
            if (!entry.inactiveMembers.includes(habit.member_name)) {
                entry.inactiveMembers.push(habit.member_name);
            }
        }
    });

    // Calculate completions and popularity score
    taskMap.forEach(entry => {
        const comps = allCompletions.filter(c => entry.habitIds.includes(c.habit_id));
        entry.totalCompletions = comps.length;
        // Popularity formula:
        // - active members count (15 pts each)
        // - total completions across all time / current logs (2 pts each)
        // - total assignment records in family history (1 pt each)
        entry.popularityScore = (entry.activeMembers.length * 15) + (entry.totalCompletions * 2) + entry.habits.length;
    });

    // Convert to array and sort descending by popularityScore
    const tasks = Array.from(taskMap.values());
    tasks.sort((a, b) => {
        if (b.popularityScore !== a.popularityScore) {
            return b.popularityScore - a.popularityScore;
        }
        return a.name.localeCompare(b.name);
    });

    return tasks;
}

function renderTaskBank(filterQuery = bankFilterQuery) {
    const bankList = $('bank-list');
    if (!bankList) return;
    bankList.innerHTML = '';

    let tasks = getUniqueBankTasks();

    if (filterQuery && filterQuery.trim()) {
        const q = filterQuery.trim().toLowerCase();
        tasks = tasks.filter(t =>
            t.name.toLowerCase().includes(q) ||
            (t.description && t.description.toLowerCase().includes(q)) ||
            t.activeMembers.some(m => m.toLowerCase().includes(q)) ||
            t.type.toLowerCase().includes(q)
        );
    }

    if (tasks.length === 0) {
        bankList.innerHTML = `
            <div style="text-align:center;padding:28px 16px;color:#777;font-family:'Patrick Hand',cursive;font-size:18px;">
                ${filterQuery ? '🔍 No tasks match your search.' : 'Your Task Bank is empty right now.<br>Click "➕ New Task" to add your first chore or habit!'}
            </div>
        `;
        return;
    }

    tasks.forEach((task, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '14px';
        card.style.marginBottom = '12px';
        card.style.boxShadow = '3px 3px 0 var(--ink)';
        card.style.position = 'relative';

        const typeBadge = task.type === 'chore' ? '🧹 Chore' : '🎯 Goal';
        const freqBadge = task.target_frequency === 'daily' ? 'Daily' : `${task.target_count}x/wk`;

        // Active members summary
        let activeBadgesHtml = '';
        if (task.activeMembers.length > 0) {
            const memberChips = task.activeMembers.map(m => {
                const mem = familyMembers.find(f => f.name === m);
                const avatar = mem ? mem.avatar : '👤';
                return `<span style="font-weight:bold;">${avatar} ${escapeHtml(m)}</span>`;
            }).join(', ');
            activeBadgesHtml = `<span class="badge-chip" style="background:#d4edda;color:#155724;font-size:11px;border-color:#c3e6cb;">🔥 Active: ${memberChips}</span>`;
        } else {
            activeBadgesHtml = `<span class="badge-chip" style="background:#f8f9fa;color:#6c757d;font-size:11px;">📦 In Bank (0 active)</span>`;
        }

        // Top rank badge
        const isTopPopular = index === 0 && task.popularityScore > 0;
        const topBadgeHtml = isTopPopular ? `<span class="badge-chip" style="background:#fff3cd;color:#856404;font-weight:bold;font-size:11px;border-color:#ffeeba;">⭐ Top Task</span>` : '';

        // Completion count badge
        const compBadgeHtml = task.totalCompletions > 0 ? `<span class="badge-chip" style="font-size:10px;">🏆 ${task.totalCompletions} logged</span>` : '';

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                <div style="flex:1;padding-right:8px;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:22px;">${task.emoji}</span>
                        <strong style="font-size:16px;">${escapeHtml(task.name)}</strong>
                        ${topBadgeHtml}
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;align-items:center;">
                        <span class="badge-chip" style="font-size:10px;">${typeBadge}</span>
                        <span class="badge-chip" style="font-size:10px;">${freqBadge}</span>
                        ${compBadgeHtml}
                        ${activeBadgesHtml}
                    </div>
                    ${task.description ? `<div style="font-family:'Patrick Hand',cursive;font-size:14px;color:#555;margin-top:4px;">${escapeHtml(task.description)}</div>` : ''}
                </div>
                <button class="icon-btn delete-perm-btn" title="Delete from Bank" style="color:#d32f2f;font-size:16px;padding:4px;">🗑️</button>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px dashed #ddd;flex-wrap:wrap;">
                <label style="font-size:12px;margin:0;white-space:nowrap;font-weight:bold;">Assign to:</label>
                <select class="bank-assign-select" style="padding:6px 10px;font-size:13px;margin:0;flex:1;min-width:130px;">
                    ${familyMembers.map(m => `<option value="${escapeHtml(m.name)}" ${m.name === currentMember ? 'selected' : ''}>${m.avatar} ${escapeHtml(m.name)}</option>`).join('')}
                </select>
                <button class="btn btn-small btn-mint bank-assign-btn" style="min-height:34px;padding:4px 12px;font-size:13px;white-space:nowrap;">➕ Add to Routine</button>
            </div>
        `;

        const select = card.querySelector('.bank-assign-select');
        const assignBtn = card.querySelector('.bank-assign-btn');

        const updateBtnState = () => {
            const selectedMember = select.value;
            const isAlreadyActive = task.activeMembers.includes(selectedMember);
            if (isAlreadyActive) {
                assignBtn.textContent = `✓ On ${selectedMember}'s Routine`;
                assignBtn.style.opacity = '0.75';
            } else {
                assignBtn.textContent = `➕ Add to ${selectedMember}`;
                assignBtn.style.opacity = '1';
            }
        };

        select.addEventListener('change', updateBtnState);
        updateBtnState();

        assignBtn.addEventListener('click', async () => {
            await assignTaskFromBank(task, select.value);
        });

        const permDeleteBtn = card.querySelector('.delete-perm-btn');
        permDeleteBtn.addEventListener('click', async () => {
            await permanentlyDeleteCatalogTask(task);
        });

        bankList.appendChild(card);
    });
}

async function assignTaskFromBank(task, targetMember) {
    playPopTone();

    // Check if targetMember already has this task active
    const existingActive = allHabits.find(h =>
        h.is_active !== false &&
        h.member_name === targetMember &&
        (h.name || '').trim().toLowerCase() === task.key
    );

    if (existingActive) {
        playPopTone();
        showToast(`ℹ️ "${task.name}" is already active for ${targetMember}!`);
        return;
    }

    // Check if targetMember has an inactive instance we can reactivate
    const existingInactive = allHabits.find(h =>
        h.is_active === false &&
        h.member_name === targetMember &&
        (h.name || '').trim().toLowerCase() === task.key
    );

    if (existingInactive) {
        existingInactive.is_active = true;
        existingInactive.target_frequency = task.target_frequency;
        existingInactive.target_count = task.target_count;
        existingInactive.emoji = task.emoji;

        try {
            await _supabase
                .from('habits')
                .update({
                    is_active: true,
                    target_frequency: task.target_frequency,
                    target_count: task.target_count,
                    emoji: task.emoji
                })
                .eq('id', existingInactive.id);
        } catch (e) {
            console.warn('DB error reactivating habit:', e);
        }
    } else {
        const newHabit = {
            member_name: targetMember,
            name: task.name,
            emoji: task.emoji,
            type: task.type,
            description: task.description || '',
            target_frequency: task.target_frequency,
            target_count: task.target_count,
            is_active: true
        };

        try {
            const { data, error } = await _supabase
                .from('habits')
                .insert([newHabit])
                .select();

            if (data && data[0]) {
                allHabits.push(data[0]);
            } else {
                newHabit.id = 'local_' + Date.now();
                allHabits.push(newHabit);
            }
        } catch (e) {
            console.warn('DB error inserting assigned habit:', e);
            newHabit.id = 'local_' + Date.now();
            allHabits.push(newHabit);
        }
    }

    // Update member routines & UI
    memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);
    renderMemberPicker();
    updateBanner();
    renderHabitLists();
    renderHomeView();

    playSuccessChime();
    showToast(`✨ Added "${task.name}" to ${targetMember}!`);

    // Bank catalog does NOT deplete! Re-render bank with updated popularity & active members
    renderTaskBank(bankFilterQuery);
}

async function copyTaskFromBank(habitOrTask, targetMember) {
    // Kept for backward compatibility
    const taskObj = habitOrTask.key ? habitOrTask : {
        key: (habitOrTask.name || '').trim().toLowerCase(),
        name: habitOrTask.name,
        emoji: habitOrTask.emoji,
        type: habitOrTask.type,
        description: habitOrTask.description,
        target_frequency: habitOrTask.target_frequency,
        target_count: habitOrTask.target_count
    };
    await assignTaskFromBank(taskObj, targetMember);
}

async function permanentlyDeleteCatalogTask(task) {
    playPopTone();
    if (!confirm(`Permanently delete "${task.name}" from the family Task Bank? This will remove it for all family members. This cannot be undone.`)) {
        return;
    }

    const idsToDelete = [...task.habitIds];
    allHabits = allHabits.filter(h => !idsToDelete.includes(h.id));
    allCompletions = allCompletions.filter(c => !idsToDelete.includes(c.habit_id));
    memberHabits = allHabits.filter(h => h.is_active !== false && h.member_name === currentMember);

    renderHabitLists();
    renderHomeView();
    renderTaskBank(bankFilterQuery);
    showToast(`🗑️ "${task.name}" removed from bank`);

    try {
        await _supabase.from('habits').delete().in('id', idsToDelete);
    } catch (e) {
        console.warn('DB error deleting task from bank:', e);
        loadAllData();
    }
}

async function permanentlyDeleteFromBank(habit) {
    await permanentlyDeleteCatalogTask({
        name: habit.name,
        habitIds: [habit.id]
    });
}

// ==============================================================================
// VIEW 3: SUNDAY MEETING & CELEBRATION REEL (Round 2, Item 1)
// ==============================================================================
async function startSundayMeeting() {
    clearInterval(reelProgressTimer);
    reelIndex = 0;
    reelPaused = false;
    reelElapsedMs = 0;
    $('reel-pause-btn').textContent = '⏸️ Pause';

    $('reel-container').style.display = 'block';
    $('comparison-board').style.display = 'none';

    reelPreviousCompletions = await loadPreviousWeekCompletions();
    showNextReel();
}

// Last week's completions, used to spot goals that were hard last week and hit this week.
// Returns null (and the reel skips those highlights) if the data cannot be loaded.
async function loadPreviousWeekCompletions() {
    const currentStart = getWeekDates(weekOffset)[0].iso;
    try {
        const { data, error } = await _supabase
            .from('habit_completions')
            .select('*')
            .gte('completed_date', shiftIsoDate(currentStart, -7))
            .lt('completed_date', currentStart);

        if (error) {
            console.warn('Could not load last week for the meeting:', error.message);
            return null;
        }
        return data || [];
    } catch (e) {
        console.warn('Network notice loading last week for the meeting:', e);
        return null;
    }
}

function shiftIsoDate(iso, days) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// Mirrors the target shown on each habit card
function habitTarget(habit) {
    return habit.target_count || (habit.target_frequency === 'daily' ? 7 : 3);
}

// Builds the sequence of scenes for one person: intro, tally, up to three highlights, encouragement.
function buildReelScenes(member) {
    const currentStart = getWeekDates(weekOffset)[0].iso;
    const memberHabitsList = allHabits.filter(h => h.is_active !== false && h.member_name === member.name);

    const rows = memberHabitsList.map(habit => {
        const done = allCompletions.filter(c => c.habit_id === habit.id).length;
        const target = habitTarget(habit);
        const lastDone = reelPreviousCompletions
            ? reelPreviousCompletions.filter(c => c.habit_id === habit.id).length
            : null;
        const existedLastWeek = (habit.created_at || '').slice(0, 10) < currentStart;
        return {
            habit,
            done,
            target,
            extra: Math.max(done - target, 0),
            met: done >= target,
            breakthrough: done >= target && existedLastWeek && lastDone !== null && lastDone < target,
            lastDone
        };
    });

    const choresRows = rows.filter(r => r.habit.type === 'chore');
    const goalsRows = rows.filter(r => r.habit.type === 'goal');
    const sum = (list, key) => list.reduce((total, r) => total + r[key], 0);
    const choresDone = sum(choresRows, 'done');
    const choresTotal = sum(choresRows, 'target');
    const goalsDone = sum(goalsRows, 'done');
    const goalsTotal = sum(goalsRows, 'target');
    const totalDone = choresDone + goalsDone;
    const totalTarget = choresTotal + goalsTotal;
    const percent = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;
    const allMet = rows.length > 0 && rows.every(r => r.met);
    const anyExtra = rows.some(r => r.extra > 0);
    const name = escapeHtml(member.name);

    const scenes = [];

    scenes.push({
        ms: 2400,
        html: `
            <div class="reel-scene">
                <div class="reel-kicker">Sunday Progress Check</div>
                <div class="reel-big reel-pop">Let's see how ${name} did!</div>
                <div class="reel-sparkles"><span class="reel-pop" style="--i:1">✨</span><span class="reel-pop" style="--i:2">🎉</span><span class="reel-pop" style="--i:3">✨</span></div>
            </div>`
    });

    scenes.push({
        ms: 3200,
        html: `
            <div class="reel-scene">
                <div class="reel-stats-box">
                    <div class="reel-stat reel-pop" style="--i:0">
                        <div class="reel-stat-num" style="color:var(--mint);"><span data-count-to="${choresDone}">0</span><span class="reel-of">/${choresTotal}</span></div>
                        <div class="reel-stat-label">Chores Done</div>
                    </div>
                    <div class="reel-stat reel-pop" style="--i:1">
                        <div class="reel-stat-num" style="color:var(--coral);"><span data-count-to="${goalsDone}">0</span><span class="reel-of">/${goalsTotal}</span></div>
                        <div class="reel-stat-label">Goals Done</div>
                    </div>
                </div>
                <div class="reel-overall-bar"><div class="reel-overall-fill" style="--w:${Math.min(percent, 100)}%;"></div></div>
                <div class="reel-caption reel-pop" style="--i:2">${percent}% of this week's targets</div>
            </div>`,
        onMount: token => {
            document.querySelectorAll('#reel-stage [data-count-to]').forEach(el => {
                animateCount(el, Number(el.dataset.countTo), 1200, token);
            });
        }
    });

    // Highlights: extra work first, then breakthroughs, then targets hit. Only habits with some progress.
    const highlights = [
        ...rows.filter(r => r.extra > 0).sort((a, b) => b.extra - a.extra).map(r => ({
            row: r,
            tag: `⭐ Above and beyond! ${r.done}/${r.target}, +${r.extra} extra`
        })),
        ...rows.filter(r => r.breakthrough && r.extra === 0).map(r => ({
            row: r,
            tag: `💪 Breakthrough! Last week ${r.lastDone}/${r.target}, this week ${r.done}/${r.target}`
        })),
        ...rows.filter(r => r.met && !r.breakthrough && r.extra === 0).map(r => ({
            row: r,
            tag: r.habit.type === 'goal' ? '🎯 Goal reached!' : '🧹 Chore target reached!'
        }))
    ].slice(0, 3);

    highlights.forEach((item, idx) => {
        const h = item.row.habit;
        scenes.push({
            ms: 2600,
            html: `
                <div class="reel-scene">
                    <div class="reel-kicker">Highlight ${idx + 1} of ${highlights.length}</div>
                    <div class="reel-highlight-emoji reel-bounce">${h.emoji || '✨'}</div>
                    <div class="reel-highlight-name">${escapeHtml(h.name)}</div>
                    <div class="reel-highlight-score reel-pop" style="--i:1">${item.row.done}/${item.row.target} done</div>
                    <div class="reel-tag reel-pop" style="--i:2">${item.tag}</div>
                </div>`,
            onMount: () => playSuccessChime()
        });
    });

    const praises = affirmationsData.meetingReel || ["Outstanding effort this week!"];
    const praise = praises[Math.floor(Math.random() * praises.length)];

    let encouragement;
    if (rows.length === 0) {
        encouragement = `No tasks yet, ${name}. Add some from the Task Bank and we'll cheer you on next week!`;
    } else if (allMet && anyExtra) {
        encouragement = `You hit every target and went the extra mile, ${name}!`;
    } else if (allMet) {
        encouragement = `Every target hit this week, ${name}. Amazing!`;
    } else if (percent >= 60) {
        encouragement = `Solid week, ${name}! Pick one thing to push a little further next week.`;
    } else if (totalDone > 0) {
        encouragement = `Every step counts, ${name}. Next week is a fresh start!`;
    } else {
        encouragement = `A fresh week is ahead, ${name}. We're cheering you on!`;
    }

    scenes.push({
        ms: 4200,
        html: `
            <div class="reel-scene">
                <div class="reel-praise reel-pop">"${escapeHtml(praise)}"</div>
                <div class="reel-caption reel-pop" style="--i:1">${encouragement}</div>
            </div>`,
        onMount: () => burstConfetti()
    });

    return scenes;
}

function showNextReel() {
    if (reelIndex >= familyMembers.length) {
        showComparisonBoard();
        return;
    }

    const member = familyMembers[reelIndex];
    $('reel-avatar').textContent = member.avatar;
    $('reel-name').textContent = member.name;
    $('reel-card').style.borderColor = member.color || 'var(--ink)';

    reelScenes = buildReelScenes(member);
    reelSceneIndex = 0;
    // The bottom bar covers this person's whole reel, so it only resets here
    reelPersonMs = reelScenes.reduce((total, scene) => total + scene.ms, 0);
    reelPersonElapsedMs = 0;
    $('reel-timer-fill').style.width = '0%';
    playFanfare();
    playReelScene();
}

function playReelScene() {
    clearInterval(reelProgressTimer);
    const scene = reelScenes[reelSceneIndex];
    reelSceneToken++;
    reelSceneMs = scene.ms;
    reelElapsedMs = 0;

    $('reel-stage').innerHTML = scene.html;
    if (scene.onMount) scene.onMount(reelSceneToken);

    reelProgressTimer = setInterval(() => {
        if (reelPaused) return;
        reelElapsedMs += REEL_STEP_MS;
        reelPersonElapsedMs += REEL_STEP_MS;
        const pct = Math.min((reelPersonElapsedMs / reelPersonMs) * 100, 100);
        $('reel-timer-fill').style.width = `${pct}%`;

        if (reelElapsedMs >= reelSceneMs) {
            advanceReel();
        }
    }, REEL_STEP_MS);
}

function advanceReel() {
    clearInterval(reelProgressTimer);
    reelSceneIndex++;
    if (reelSceneIndex < reelScenes.length) {
        playReelScene();
    } else {
        reelIndex++;
        showNextReel();
    }
}

// Counts a number up on screen. Stops early if the scene has changed.
function animateCount(el, to, durationMs, token) {
    const start = performance.now();
    const step = now => {
        if (token !== reelSceneToken) return;
        const progress = Math.min((now - start) / durationMs, 1);
        el.textContent = Math.round(to * progress);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// Confetti pieces fall over the stage and remove themselves when finished.
function burstConfetti() {
    const stage = $('reel-stage');
    for (let i = 0; i < 36; i++) {
        const piece = document.createElement('span');
        piece.className = 'reel-confetti';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = COLOR_OPTIONS[i % COLOR_OPTIONS.length];
        piece.style.animationDelay = `${Math.random() * 0.6}s`;
        piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
        piece.addEventListener('animationend', () => piece.remove());
        stage.appendChild(piece);
    }
}

function showComparisonBoard() {
    clearInterval(reelProgressTimer);
    playFanfare();

    $('reel-container').style.display = 'none';
    $('comparison-board').style.display = 'block';

    $('weekly-reflection-input').value = currentWeeklyReflection;

    const leaderboardContainer = $('leaderboard-list');
    leaderboardContainer.innerHTML = '';

    const memberStats = familyMembers.map(member => {
        const { done, target, percent: rate } = memberWeekScore(member.name);
        return { member, done, target, rate };
    });

    const sorted = [...memberStats].sort((a, b) => b.rate - a.rate);

    sorted.forEach((item, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⭐';
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.style.borderLeft = `8px solid ${item.member.color || 'var(--sun)'}`;

        row.innerHTML = `
            <span style="font-size:20px;">${medal}</span>
            <span class="leaderboard-avatar">${item.member.avatar}</span>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${item.member.name} (${item.done}/${item.target} done)</div>
                <div class="leaderboard-bar-bg">
                    <div class="leaderboard-bar-fill" style="width:${Math.min(item.rate, 100)}%;background-color:${item.member.color || 'var(--mint)'};"></div>
                </div>
            </div>
            <div class="leaderboard-rate">${item.rate}%</div>
        `;
        leaderboardContainer.appendChild(row);
    });

    const breakdownContainer = $('breakdown-list');
    breakdownContainer.innerHTML = '';

    familyMembers.forEach(member => {
        const mHabits = allHabits.filter(h => h.is_active !== false && h.member_name === member.name);
        if (mHabits.length === 0) return;

        const card = document.createElement('div');
        card.className = 'card';
        card.style.borderLeft = `6px solid ${member.color || 'var(--sun)'}`;
        card.style.marginBottom = '14px';

        let habitsHtml = '';
        mHabits.forEach(h => {
            const doneCount = allCompletions.filter(c => c.habit_id === h.id).length;
            const target = h.target_count || 7;
            const badge = h.type === 'chore' ? '🧹 Chore' : '🎯 Goal';
            habitsHtml += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed #ddd;">
                    <div>
                        <span style="font-size:18px;margin-right:6px;">${h.emoji}</span>
                        <strong>${escapeHtml(h.name)}</strong>
                        <span style="font-size:12px;color:#777;margin-left:6px;">(${badge})</span>
                    </div>
                    <span class="streak-pill" style="font-size:12px;">${doneCount}/${target} done</span>
                </div>
            `;
        });

        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <span style="font-size:32px;">${member.avatar}</span>
                <h4 style="margin:0;font-size:18px;text-transform:uppercase;">${member.name}'s Goals & Chores</h4>
            </div>
            ${habitsHtml}
        `;
        breakdownContainer.appendChild(card);
    });
}

// Save Weekly Reflection
async function handleSaveReflection() {
    playPopTone();
    const text = $('weekly-reflection-input').value.trim();
    const startDate = getWeekDates(weekOffset)[0].iso;

    currentWeeklyReflection = text;
    localStorage.setItem(`reflection_${startDate}`, text);
    showToast('📝 Reflection saved!');

    try {
        const { error } = await _supabase
            .from('family_reflections')
            .upsert({
                week_start_date: startDate,
                reflection_text: text,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.warn('DB reflection save notice:', error.message);
        }
    } catch (e) {
        console.warn('Network notice saving reflection:', e);
    }
}

// ==============================================================================
// REFRIGERATOR PRINTABLE VIEW (8.5" x 11")
// ==============================================================================
function triggerFridgePrint() {
    playPopTone();
    const week = getWeekDates(weekOffset);
    const first = week[0];
    const last = week[6];

    $('print-date-range').textContent = `Week of: Monday ${first.monthNum}/${first.dateNum} to Sunday ${last.monthNum}/${last.dateNum}`;

    const table = $('print-table-content');
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width:30%;">Family Member & Task</th>
                <th style="width:12%;">Type</th>
                <th style="width:10%;">Target</th>
                <th>Mon</th>
                <th>Tue</th>
                <th>Wed</th>
                <th>Thu</th>
                <th>Fri</th>
                <th>Sat</th>
                <th>Sun</th>
            </tr>
        </thead>
        <tbody id="print-table-body"></tbody>
    `;

    const tbody = $('print-table-body');

    familyMembers.forEach(member => {
        const mHabits = allHabits.filter(h => h.is_active !== false && h.member_name === member.name);

        const mHeader = document.createElement('tr');
        mHeader.innerHTML = `<td colspan="10" class="print-member-header">${member.avatar} ${member.name} (${member.role})</td>`;
        tbody.appendChild(mHeader);

        if (mHabits.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="10" style="color:#777;padding:6px 12px;font-style:italic;">No active tasks. Check the Task Bank to add some!</td>`;
            tbody.appendChild(emptyRow);
        } else {
            mHabits.forEach(h => {
                const tr = document.createElement('tr');
                const targetText = h.target_frequency === 'daily' ? 'Daily' : `${h.target_count}x/wk`;
                const typeText = h.type === 'chore' ? '🧹 Chore' : '🎯 Goal';

                tr.innerHTML = `
                    <td><strong>${h.emoji} ${escapeHtml(h.name)}</strong></td>
                    <td style="text-align:center;">${typeText}</td>
                    <td style="text-align:center;">${targetText}</td>
                    <td><div class="print-bubble"></div></td>
                    <td><div class="print-bubble"></div></td>
                    <td><div class="print-bubble"></div></td>
                    <td><div class="print-bubble"></div></td>
                    <td><div class="print-bubble"></div></td>
                    <td><div class="print-bubble"></div></td>
                    <td><div class="print-bubble"></div></td>
                `;
                tbody.appendChild(tr);
            });
        }
    });

    window.print();
}

// ==============================================================================
// PROFILE CUSTOMIZATION (Avatar & Color)
// ==============================================================================
function initProfileCustomizer() {
    const avatarGrid = $('avatar-grid');
    avatarGrid.innerHTML = '';

    AVATAR_OPTIONS.forEach(avatar => {
        const div = document.createElement('div');
        div.className = 'avatar-option' + (avatar === selectedCustomAvatar ? ' selected' : '');
        div.textContent = avatar;
        div.addEventListener('click', () => {
            playPopTone();
            selectedCustomAvatar = avatar;
            document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
        });
        avatarGrid.appendChild(div);
    });

    const swatchGrid = $('color-swatches');
    swatchGrid.innerHTML = '';

    COLOR_OPTIONS.forEach(color => {
        const div = document.createElement('div');
        div.className = 'color-swatch' + (color === selectedCustomColor ? ' selected' : '');
        div.style.backgroundColor = color;
        div.addEventListener('click', () => {
            playPopTone();
            selectedCustomColor = color;
            document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
        });
        swatchGrid.appendChild(div);
    });

    $('settings-profile-member').addEventListener('change', () => {
        const memName = $('settings-profile-member').value;
        const mem = familyMembers.find(m => m.name === memName);
        if (mem) {
            selectedCustomAvatar = mem.avatar;
            selectedCustomColor = mem.color || '#ff6b9d';
            initProfileCustomizer();
        }
    });
}

async function handleSaveProfile() {
    playPopTone();
    const memName = $('settings-profile-member').value;
    const mem = familyMembers.find(m => m.name === memName);

    if (mem) {
        mem.avatar = selectedCustomAvatar;
        mem.color = selectedCustomColor;

        renderMemberPicker();
        updateBanner();
        renderHomeView();
        showToast(`✨ ${memName}'s profile updated!`);

        try {
            await _supabase
                .from('family_members')
                .update({ avatar: selectedCustomAvatar, color: selectedCustomColor })
                .eq('name', memName);
        } catch (e) {
            console.warn('Notice saving profile to DB:', e);
        }
    }
}

// ==============================================================================
// DATA BACKUP (JSON EXPORT)
// ==============================================================================
function handleExportJSON() {
    playPopTone();
    const backupData = {
        exportedAt: new Date().toISOString(),
        familyMembers: familyMembers,
        habits: allHabits,
        completions: allCompletions,
        currentWeeklyReflection: currentWeeklyReflection,
        settings: {
            gracePeriodDays: gracePeriodDays,
            soundEnabled: soundEnabled
        }
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `family_habits_backup_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('💾 Backup downloaded!');
}

// ==============================================================================
// PAST WEEKS ARCHIVE MODAL
// ==============================================================================
async function openArchiveModal() {
    playPopTone();
    const list = $('archive-list');
    list.innerHTML = '<div style="text-align:center;padding:16px;">Loading archive...</div>';
    $('archive-modal').style.display = 'flex';

    let html = '';
    for (let offset = 0; offset >= -5; offset--) {
        const week = getWeekDates(offset);
        const first = week[0];
        const last = week[6];
        const label = offset === 0 ? 'This Week' : offset === -1 ? 'Last Week' : `${Math.abs(offset)} Weeks Ago`;
        const dateRange = `${first.monthNum}/${first.dateNum} – ${last.monthNum}/${last.dateNum}`;

        const refText = localStorage.getItem(`reflection_${first.iso}`) || '';

        html += `
            <div class="card" style="margin-bottom:12px;padding:14px;box-shadow:3px 3px 0 var(--ink);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <strong>${label} (${dateRange})</strong>
                    <button class="btn btn-small btn-white" onclick="jumpToWeek(${offset})">Jump to Week</button>
                </div>
                ${refText ? `<div style="font-family:'Patrick Hand',cursive;font-size:15px;color:#444;background:#fff8e7;padding:6px 10px;border-radius:8px;margin-top:6px;">📝 "${escapeHtml(refText)}"</div>` : ''}
            </div>
        `;
    }

    list.innerHTML = html;
}

window.jumpToWeek = function(offset) {
    playPopTone();
    weekOffset = offset;
    $('archive-modal').style.display = 'none';
    loadAllData();
    switchView('home');
};

// ==============================================================================
// AUTHENTICATION
// ==============================================================================
async function updateAuthUI(session) {
    currentUser = session ? session.user : null;
    const authBtn = $('auth-btn');

    if (currentUser) {
        authBtn.textContent = 'Sign Out';
        $('login-card').style.display = 'none';
    } else {
        authBtn.textContent = 'Sign In';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    playPopTone();
    clearError();

    const email = $('login-email').value.trim();
    const password = $('login-password').value.trim();

    const submitBtn = $('submit-login-btn');
    submitBtn.textContent = 'Signing In...';
    submitBtn.disabled = true;

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    submitBtn.textContent = '🚀 Sign In';
    submitBtn.disabled = false;

    if (error) {
        showError('Sign In Error: ' + error.message);
    } else {
        showToast('👋 Welcome back!');
        updateAuthUI(data.session);
        await loadFamilyMembers();
        await loadAllData();
    }
}

async function handleSignOut() {
    playPopTone();
    await _supabase.auth.signOut();
    updateAuthUI(null);
    $('settings-modal').style.display = 'none';
    showToast('Signed out');
}

// ==============================================================================
// UTILITY
// ==============================================================================
function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// ==============================================================================
// INITIALIZATION & EVENT LISTENERS
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    await loadAffirmations();

    const { data: { session } } = await _supabase.auth.getSession();
    updateAuthUI(session);

    await loadFamilyMembers();
    await loadAllData();

    initProfileCustomizer();

    // Navigation
    $('home-nav-title').addEventListener('click', () => {
        playPopTone();
        switchView('home');
    });

    $('start-meeting-btn').addEventListener('click', () => {
        playPopTone();
        switchView('meeting');
    });

    $('home-return-btn').addEventListener('click', () => {
        playPopTone();
        switchView('home');
    });

    // Week navigation (habits carry over indefinitely to every week)
    $('prev-week-btn').addEventListener('click', () => {
        playPopTone();
        weekOffset--;
        loadAllData();
    });

    $('next-week-btn').addEventListener('click', () => {
        playPopTone();
        weekOffset++;
        loadAllData();
    });

    // Add / Edit habit modal
    $('add-habit-btn').addEventListener('click', openAddHabitModal);
    $('close-add-modal').addEventListener('click', () => {
        playPopTone();
        $('add-modal').style.display = 'none';
    });
    $('new-habit-form').addEventListener('submit', handleHabitFormSubmit);

    // Open Task Bank from Add Modal
    $('open-bank-from-add-btn').addEventListener('click', () => {
        $('add-modal').style.display = 'none';
        openTaskBankModal();
    });

    // Task Bank / Working Folder Modal buttons
    $('home-bank-btn').addEventListener('click', openTaskBankModal);
    const memberBankBtn = $('member-bank-btn');
    if (memberBankBtn) memberBankBtn.addEventListener('click', openTaskBankModal);
    $('settings-bank-btn').addEventListener('click', () => {
        $('settings-modal').style.display = 'none';
        openTaskBankModal();
    });
    $('close-bank-modal').addEventListener('click', () => {
        playPopTone();
        $('bank-modal').style.display = 'none';
    });

    const searchInput = $('bank-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            bankFilterQuery = e.target.value;
            renderTaskBank(bankFilterQuery);
        });
    }

    const bankAddBtn = $('bank-add-new-btn');
    if (bankAddBtn) {
        bankAddBtn.addEventListener('click', () => {
            playPopTone();
            $('bank-modal').style.display = 'none';
            openAddHabitModal();
        });
    }

    // Delete / Archive task modal buttons
    $('cancel-delete-btn').addEventListener('click', () => {
        playPopTone();
        $('delete-modal').style.display = 'none';
        habitToDelete = null;
    });
    $('confirm-archive-btn').addEventListener('click', confirmArchiveHabit);
    $('confirm-delete-btn').addEventListener('click', confirmDeleteHabit);

    // Sunday Meeting Reel Controls
    $('reel-pause-btn').addEventListener('click', () => {
        playPopTone();
        reelPaused = !reelPaused;
        $('reel-pause-btn').textContent = reelPaused ? '▶️ Resume' : '⏸️ Pause';
    });

    $('reel-next-btn').addEventListener('click', () => {
        playPopTone();
        clearInterval(reelProgressTimer);
        reelIndex++;
        showNextReel();
    });

    $('reel-skip-all-btn').addEventListener('click', () => {
        playPopTone();
        showComparisonBoard();
    });

    $('exit-meeting-btn').addEventListener('click', () => {
        playPopTone();
        switchView('home');
    });

    // Save Reflection
    $('save-reflection-btn').addEventListener('click', handleSaveReflection);

    // Refrigerator Print buttons
    $('header-print-btn').addEventListener('click', triggerFridgePrint);
    $('home-print-btn').addEventListener('click', triggerFridgePrint);

    // Archive Modal
    $('home-archive-btn').addEventListener('click', openArchiveModal);
    $('close-archive-modal').addEventListener('click', () => {
        playPopTone();
        $('archive-modal').style.display = 'none';
    });

    // Diagnostics panel
    $('close-diag-btn').addEventListener('click', () => {
        playPopTone();
        $('diag-panel').style.display = 'none';
    });

    // Settings Modal
    $('floating-gear-btn').addEventListener('click', () => {
        playPopTone();
        $('settings-modal').style.display = 'flex';
    });

    $('close-settings-modal').addEventListener('click', () => {
        playPopTone();
        $('settings-modal').style.display = 'none';
    });

    $('settings-diag-btn').addEventListener('click', () => {
        $('settings-modal').style.display = 'none';
        runDiagnostics();
    });

    $('settings-changelog-btn').addEventListener('click', () => {
        window.location.href = 'changelog.html';
    });

    $('save-profile-btn').addEventListener('click', handleSaveProfile);

    $('grace-period-select').value = gracePeriodDays;
    $('grace-period-select').addEventListener('change', () => {
        gracePeriodDays = parseInt($('grace-period-select').value, 10);
        localStorage.setItem('gracePeriodDays', gracePeriodDays);
        showToast('🔥 Grace period updated');
    });

    $('export-json-btn').addEventListener('click', handleExportJSON);

    // Sound toggle
    $('toggle-sound-btn').addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('soundEnabled', soundEnabled);
        $('toggle-sound-btn').textContent = `🔊 Sound Effects: ${soundEnabled ? 'ON' : 'OFF'}`;
        if (soundEnabled) playSuccessChime();
    });

    // Auth buttons
    $('auth-btn').addEventListener('click', () => {
        playPopTone();
        if (currentUser) {
            handleSignOut();
        } else {
            $('login-card').style.display = $('login-card').style.display === 'none' ? 'block' : 'none';
        }
    });

    $('login-form').addEventListener('submit', handleLogin);
    $('signout-btn').addEventListener('click', handleSignOut);
});
