// App State Manager
const state = {
  user: null, // Logged in user info
  usersList: [], // List of users on the system
  program: null, // Current workout program
  schedule: null, // Current schedule
  activeView: 'login',
  activeWorkout: null, // Active workout session tracking details
  workoutTimer: null, // Interval timer object
  restTimer: null, // Interval timer object
  stretchTimer: null, // Interval timer object
  analyticsData: null // Cache for stats & charts
};

let activeWorkoutSaveTimer = null;

async function loadActiveWorkoutSession() {
  try {
    const res = await fetch('/api/workout/active');
    if (!res.ok) return;
    const data = await res.json();
    if (data.activeWorkout) {
      state.activeWorkout = data.activeWorkout;
      // A recovered workout resumes paused so time is never lost while the app was closed.
      state.activeWorkout.treadmillTimerActive = false;
      state.activeWorkout.stretchTimerActive = false;
    }
  } catch (err) {
    console.error('Failed to restore active workout:', err);
  }
}

async function persistActiveWorkoutSession({ keepalive = false } = {}) {
  if (!state.activeWorkout || !state.user) return;
  if (state.activeWorkout.phase === 'strength') saveCurrentLiftsToState();

  try {
    await fetch('/api/workout/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeWorkout: state.activeWorkout }),
      keepalive
    });
  } catch (err) {
    if (!keepalive) console.error('Failed to save active workout:', err);
  }
}

function startActiveWorkoutAutosave() {
  clearInterval(activeWorkoutSaveTimer);
  activeWorkoutSaveTimer = setInterval(() => {
    if (state.activeWorkout) persistActiveWorkoutSession();
  }, 10000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistActiveWorkoutSession({ keepalive: true });
});
window.addEventListener('pagehide', () => persistActiveWorkoutSession({ keepalive: true }));

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getWorkoutUsers() {
  return state.user ? [state.user] : [];
}

// Global Audio Context cache to bypass browser block policies
function initAudio() {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioContext && state.audioContext.state === 'suspended') {
    state.audioContext.resume();
  }
}

// Global click event to wake up audio on first user touch
document.addEventListener('click', () => {
  initAudio();
}, { once: false });

// Web Audio API Timer Beep
function playBeep(freq = 800, duration = 0.3) {
  try {
    initAudio();
    const ctx = state.audioContext;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn("Audio Context beep failed:", e);
  }
}

// Startup Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service Worker registration:', err));
  }
  await checkSession();
});

// Check server user session
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
      state.user = data.user;
      setupUserSessionUI();
      // Load base configs
      await Promise.all([loadUsersList(), loadProgram(), loadSchedule(), loadActiveWorkoutSession()]);
      startActiveWorkoutAutosave();
      navigate('dashboard');
    } else {
      navigate('login');
    }
  } catch (err) {
    console.error('Session validation failed:', err);
    navigate('login');
  }
}

// Router & Views Navigator
function navigate(viewId) {
  state.activeView = viewId;
  
  if (viewId !== 'workout' && state.exerciseVisualInterval) {
    clearInterval(state.exerciseVisualInterval);
    state.exerciseVisualInterval = null;
  }
  
  // Hide all view containers, show target
  document.querySelectorAll('.view-container').forEach(el => {
    el.classList.add('hidden');
  });
  const targetView = document.getElementById(`${viewId}-view`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  // Update navigation link highlights
  document.querySelectorAll('.nav-link').forEach(el => {
    if (el.getAttribute('data-view') === viewId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Display/Hide Header Nav bar
  const navHeader = document.getElementById('main-nav');
  if (viewId === 'login') {
    navHeader.classList.add('nav-hidden');
  } else {
    navHeader.classList.remove('nav-hidden');
  }

  // Show/Hide active session floating banner
  toggleActiveSessionBanner();

  // Load view-specific content
  if (viewId === 'dashboard') loadDashboard();
  if (viewId === 'planner') loadPlanner();
  if (viewId === 'program') loadProgramEditor();
  if (viewId === 'progress') loadProgressReport();
  if (viewId === 'settings') loadSettings();
}

function toggleActiveSessionBanner() {
  const banner = document.getElementById('active-session-banner');
  if (state.activeWorkout && state.activeView !== 'workout') {
    banner.classList.remove('banner-hidden');
  } else {
    banner.classList.add('banner-hidden');
  }
}

function setupUserSessionUI() {
  if (state.user) {
    document.body.dataset.profile = state.user.gender || 'male';
    document.getElementById('user-avatar').textContent = state.user.displayName.charAt(0).toUpperCase();
    document.getElementById('user-avatar').title = `Logged in as ${state.user.displayName}`;
  }
}

// Fetch users
async function loadUsersList() {
  try {
    const res = await fetch('/api/users');
    state.usersList = await res.json();
  } catch (e) {
    console.error('Failed to load users list:', e);
  }
}

// Fetch program
async function loadProgram() {
  try {
    const res = await fetch('/api/program');
    state.program = await res.json();
  } catch (e) {
    console.error('Failed to load workout program:', e);
  }
}

// Fetch schedule
async function loadSchedule() {
  try {
    const res = await fetch('/api/schedule');
    state.schedule = await res.json();
  } catch (e) {
    console.error('Failed to load schedule:', e);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Navigation Links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      navigate(view);
    });
  });

  // Auth Inputs Check (Registration Lock check)
  const emailInput = document.getElementById('auth-email');
  emailInput.addEventListener('blur', checkEmailRegistrationStatus);
  emailInput.addEventListener('input', checkEmailRegistrationStatus);

  // Auth Submit Form
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);

  // Logout Button
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Resume Workout Banner
  document.getElementById('resume-banner-btn').addEventListener('click', () => {
    navigate('workout');
    initActiveWorkoutWizard();
  });

  // Readiness Cancel
  document.getElementById('cancel-readiness-btn').addEventListener('click', () => {
    document.getElementById('readiness-overlay').classList.add('hidden');
  });

  // Readiness Form Submit
  document.getElementById('readiness-form').addEventListener('submit', startActiveWorkoutSession);

  // Weekly Planner Checkboxes & Spacing check
  const checkboxes = document.getElementsByName('train-days');
  checkboxes.forEach(chk => {
    chk.addEventListener('change', checkPlannerSelections);
  });

  // Save Week Plan Form
  document.getElementById('weekly-plan-form').addEventListener('submit', saveWeeklyPlan);

  // Reschedule controls
  document.getElementById('reschedule-submit-btn').addEventListener('click', submitReschedule);

  // Profile Settings Form
  document.getElementById('profile-settings-form').addEventListener('submit', saveProfileSettings);

  // Backup actions
  document.getElementById('backup-export-btn').addEventListener('click', exportDatabase);
  document.getElementById('backup-import-file').addEventListener('change', importDatabase);

  // Measurements Form
  document.getElementById('add-measurements-btn').addEventListener('click', () => {
    document.getElementById('measurements-overlay').classList.remove('hidden');
  });
  document.getElementById('cancel-measure-btn').addEventListener('click', () => {
    document.getElementById('measurements-overlay').classList.add('hidden');
  });
  document.getElementById('measurements-form').addEventListener('submit', submitMeasurements);

  // Program Editor resets
  document.getElementById('reset-program-btn').addEventListener('click', resetProgramDefaults);
  document.getElementById('save-program-changes-btn').addEventListener('click', saveProgramChanges);
  document.getElementById('add-exercise-btn').addEventListener('click', addNewExerciseTemplate);

  // Notification & Reminders Action Listeners
  const enableNotifBtn = document.getElementById('enable-notif-btn');
  if (enableNotifBtn) {
    enableNotifBtn.addEventListener('click', requestNotificationPermission);
  }
  const testNotifBtn = document.getElementById('test-notif-btn');
  if (testNotifBtn) {
    testNotifBtn.addEventListener('click', () => {
      if (!('Notification' in window)) {
        alert('Browser notifications are not supported by this browser.');
        return;
      }
      if (Notification.permission !== 'granted') {
        alert('Please enable browser notifications first using the button above!');
        return;
      }
      sendBrowserNotification('UsFit Test Reminder 🏋️', {
        body: 'Test successful! Your browser notifications are active and ready.'
      });
    });
  }

  // Reset database button
  const resetDbBtn = document.getElementById('reset-database-btn');
  if (resetDbBtn) {
    resetDbBtn.addEventListener('click', resetDatabaseAll);
  }
}

// Authentication Logic
let lastCheckedEmail = '';
function resetAuthFormState({ clearEmail = false } = {}) {
  const form = document.getElementById('auth-form');
  if (clearEmail) form.reset();
  lastCheckedEmail = '';
  document.getElementById('displayName-field-container').style.display = 'none';
  document.getElementById('auth-name').required = false;
  document.getElementById('auth-submit-btn').textContent = 'Sign In';
  document.getElementById('register-setup-alert').classList.add('hidden');
  document.getElementById('auth-error-msg').classList.add('hidden');
  document.getElementById('login-subtitle').textContent = 'Sign in to plan & track workouts together';
}

async function checkEmailRegistrationStatus() {
  const emailVal = document.getElementById('auth-email').value.trim().toLowerCase();
  if (!emailVal || emailVal === lastCheckedEmail) return;
  lastCheckedEmail = emailVal;

  try {
    const res = await fetch('/api/auth/config');
    const data = await res.json();
    const config = data.status.find(s => s.email === emailVal);
    
    const displayNameField = document.getElementById('displayName-field-container');
    const submitBtn = document.getElementById('auth-submit-btn');
    const setupAlert = document.getElementById('register-setup-alert');

    if (config) {
      if (!config.isRegistered) {
        // Show setup inputs
        displayNameField.style.display = 'block';
        document.getElementById('auth-name').required = true;
        submitBtn.textContent = 'Register & Create Profile';
        setupAlert.classList.remove('hidden');
        document.getElementById('login-subtitle').textContent = 'Enter your name to set up your profile.';
      } else {
        // Regular Login
        displayNameField.style.display = 'none';
        document.getElementById('auth-name').required = false;
        submitBtn.textContent = 'Sign In';
        setupAlert.classList.add('hidden');
        document.getElementById('login-subtitle').textContent = 'Sign in to plan & track workouts together';
      }
      document.getElementById('auth-error-msg').classList.add('hidden');
    } else {
      // Email not in approved list
      displayNameField.style.display = 'none';
      document.getElementById('auth-name').required = false;
      submitBtn.textContent = 'Sign In';
      setupAlert.classList.add('hidden');
    }
  } catch (e) {
    console.error('Failed to check auth configuration:', e);
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const displayNameField = document.getElementById('auth-name');

  const errorDiv = document.getElementById('auth-error-msg');
  errorDiv.classList.add('hidden');

  try {
    // Login is always checked first. This avoids stale browser form state ever
    // attempting to register an account that was already created.
    let res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    let data = await res.json();

    if (res.ok && data.needsRegistration) {
      if (!displayNameField.value.trim()) {
        lastCheckedEmail = '';
        await checkEmailRegistrationStatus();
        throw new Error('Enter your display name to finish creating the account.');
      }
      res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName: displayNameField.value })
      });
      data = await res.json();
    }

    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    state.user = data.user;
    setupUserSessionUI();
    
    // Refresh configurations
    await Promise.all([loadUsersList(), loadProgram(), loadSchedule(), loadActiveWorkoutSession()]);
    startActiveWorkoutAutosave();
    
    navigate('dashboard');
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  }
}

async function handleLogout() {
  try {
    await persistActiveWorkoutSession();
    await fetch('/api/auth/logout', { method: 'POST' });
    state.user = null;
    state.activeWorkout = null;
    clearInterval(activeWorkoutSaveTimer);
    clearInterval(state.workoutTimer);
    clearInterval(state.restTimer);
    clearInterval(state.stretchTimer);
    resetAuthFormState({ clearEmail: true });
    navigate('login');
  } catch (e) {
    console.error('Logout failed:', e);
  }
}

// Settings Profile Update
async function saveProfileSettings(e) {
  e.preventDefault();
  const displayName = document.getElementById('settings-display-name').value;
  const unit = document.getElementById('settings-weight-unit').value;
  const targetHeartRate = document.getElementById('settings-target-hr').value;
  const defaultRestTime = document.getElementById('settings-default-rest').value;

  try {
    const res = await fetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, unit, targetHeartRate, defaultRestTime })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.user = data.user;
    setupUserSessionUI();
    
    // Refresh program and schedule templates to reflect gender variation
    await Promise.all([loadProgram(), loadSchedule()]);
    
    const alertBox = document.getElementById('settings-alert-box');
    alertBox.textContent = 'Profile settings saved successfully!';
    alertBox.className = 'alert alert-info margin-top-sm';
    alertBox.classList.remove('hidden');
    setTimeout(() => alertBox.classList.add('hidden'), 3000);
  } catch (err) {
    alert(err.message);
  }
}

function loadSettings() {
  if (state.user) {
    document.getElementById('settings-display-name').value = state.user.displayName;
    document.getElementById('settings-weight-unit').value = state.user.unit;
    document.getElementById('settings-target-hr').value = state.user.targetHeartRate || 130;
    document.getElementById('settings-default-rest').value = state.user.defaultRestTime || 90;
  }
  initNotificationUI();
}

// Notification & Reminders Helper Functions
function initNotificationUI() {
  const badge = document.getElementById('notif-permission-badge');
  const hint = document.getElementById('notif-permission-hint');
  const enableBtn = document.getElementById('enable-notif-btn');

  if (!('Notification' in window)) {
    if (badge) {
      badge.textContent = 'Not Supported';
      badge.className = 'badge badge-danger';
    }
    if (hint) hint.textContent = 'This browser does not support desktop notifications.';
    if (enableBtn) enableBtn.disabled = true;
    return;
  }

  if (Notification.permission === 'granted') {
    if (badge) {
      badge.textContent = 'Granted';
      badge.className = 'badge badge-success';
    }
    if (hint) hint.textContent = 'Browser notifications are enabled. You will receive workout reminders.';
    if (enableBtn) {
      enableBtn.textContent = 'Notifications Enabled ✓';
      enableBtn.disabled = true;
    }
  } else if (Notification.permission === 'denied') {
    if (badge) {
      badge.textContent = 'Denied';
      badge.className = 'badge badge-danger';
    }
    if (hint) hint.textContent = 'Notifications are blocked in your browser settings.';
    if (enableBtn) enableBtn.disabled = false;
  } else {
    if (badge) {
      badge.textContent = 'Not Enabled';
      badge.className = 'badge badge-warning';
    }
    if (hint) hint.textContent = 'Enable notifications to receive daily training alerts.';
    if (enableBtn) enableBtn.disabled = false;
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Browser notifications are not supported by your browser.');
    return;
  }
  
  try {
    const permission = await Notification.requestPermission();
    initNotificationUI();
    if (permission === 'granted') {
      sendBrowserNotification('UsFit Reminders Enabled 🏋️', {
        body: 'Awesome! You will now receive alerts for scheduled workout sessions.'
      });
    }
  } catch (e) {
    console.error('Error requesting notification permission:', e);
  }
}

function sendBrowserNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const defaultOptions = {
    icon: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
    tag: 'usfit-reminder'
  };

  try {
    const notification = new Notification(title, { ...defaultOptions, ...options });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (e) {
    console.warn('Native notification failed:', e);
  }
}

function checkAndTriggerDailyReminder() {
  if (!state.schedule || !state.schedule.currentWeek) return;

  const daysMap = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
  const todayDate = new Date();
  const todayName = daysMap[todayDate.getDay()];
  const dateStr = todayDate.toISOString().split('T')[0];

  const week = state.schedule.currentWeek;
  if (!week.days || !week.days[todayName]) return;

  const dayInfo = week.days[todayName];
  if (dayInfo.status === 'Upcoming' || dayInfo.status === 'Planned') {
    const lastNotifDate = localStorage.getItem('usfit_last_notif_date');
    if (lastNotifDate !== dateStr) {
      localStorage.setItem('usfit_last_notif_date', dateStr);
      const workoutObj = state.program.days.find(d => d.id === dayInfo.workoutId);
      const workoutName = workoutObj ? workoutObj.name : 'Workout Session';
      
      sendBrowserNotification(`UsFit Workout Day Alert 🏋️‍♂️`, {
        body: `Today is ${todayName}! Scheduled routine: ${workoutName}. Tap to start training together!`
      });
    }
  }
}

function renderDashboardReminders() {
  const banner = document.getElementById('dashboard-reminder-banner');
  if (!banner) return;

  if (!state.schedule || !state.schedule.currentWeek) {
    banner.classList.add('hidden');
    return;
  }

  const daysMap = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
  const todayName = daysMap[new Date().getDay()];
  const week = state.schedule.currentWeek;
  const isWorkoutDay = week.days && week.days[todayName];

  if (isWorkoutDay) {
    const dayInfo = week.days[todayName];
    const workoutObj = state.program.days.find(d => d.id === dayInfo.workoutId);
    const workoutName = workoutObj ? workoutObj.name : 'Scheduled Workout';

    if (dayInfo.status === 'Completed') {
      banner.className = 'reminder-banner completed-day glass-panel margin-top-sm';
      banner.innerHTML = `
        <div class="reminder-content">
          <div class="reminder-info">
            <span class="reminder-icon">🏆</span>
            <div>
              <div class="reminder-title">Today's Workout Completed!</div>
              <div class="reminder-subtitle">Great job crushing <strong>${escapeHTML(workoutName)}</strong> today!</div>
            </div>
          </div>
          <span class="badge badge-success">Completed ✓</span>
        </div>
      `;
    } else {
      banner.className = 'reminder-banner workout-day glass-panel margin-top-sm';
      banner.innerHTML = `
        <div class="reminder-content">
          <div class="reminder-info">
            <span class="reminder-icon">⚡</span>
            <div>
              <div class="reminder-title">Today is a Workout Day! (${escapeHTML(todayName)})</div>
              <div class="reminder-subtitle">Scheduled Routine: <strong>${escapeHTML(workoutName)}</strong>. Ready to train?</div>
            </div>
          </div>
          <button class="btn btn-accent btn-sm" onclick="openReadinessModal('${todayName}', '${dayInfo.workoutId}')">Start Warm-Up</button>
        </div>
      `;
    }
    banner.classList.remove('hidden');
  } else {
    banner.className = 'reminder-banner recovery-day glass-panel margin-top-sm';
    banner.innerHTML = `
      <div class="reminder-content">
        <div class="reminder-info">
          <span class="reminder-icon">🌿</span>
          <div>
            <div class="reminder-title">Today is a Recovery & Rest Day</div>
            <div class="reminder-subtitle">No active sessions scheduled for ${escapeHTML(todayName)}. Hydrate, stretch, and get quality sleep!</div>
          </div>
        </div>
        <span class="badge badge-success">Active Recovery</span>
      </div>
    `;
    banner.classList.remove('hidden');
  }
}

function checkSessionUnlockStatus(scheduledDay) {
  const daysMap = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
  const todayName = daysMap[new Date().getDay()];

  // Active workout in progress is always unlocked
  if (state.activeWorkout && state.schedule && state.schedule.currentWeek) {
    const dayObj = state.schedule.currentWeek.days[scheduledDay];
    if (dayObj && state.activeWorkout.workoutId === dayObj.workoutId) {
      return { isUnlocked: true, reason: 'In progress' };
    }
  }

  // Today IS the scheduled day
  if (todayName === scheduledDay) {
    return { isUnlocked: true, reason: 'Today is scheduled day' };
  }

  const dayIndex = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
  const todayIdx = dayIndex[todayName];
  const scheduledIdx = dayIndex[scheduledDay];

  // If today is past the scheduled day in the week (catch-up on past session)
  if (todayIdx > scheduledIdx) {
    return { isUnlocked: true, reason: 'Catch-up session' };
  }

  // Scheduled day is in the future
  return { isUnlocked: false, reason: `Unlocks on ${scheduledDay}` };
}

// Dashboard rendering
function loadDashboard() {
  // Update Date
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dashboard-date-str').textContent = new Date().toLocaleDateString(undefined, options);

  // Render reminders banner and trigger notification check
  renderDashboardReminders();
  checkAndTriggerDailyReminder();

  // Render weekly consistency card
  const progressTitle = document.getElementById('progress-weeks-title');
  const percentText = document.getElementById('weekly-percent-text');
  const bar = document.getElementById('weekly-progress-bar');
  const slotsContainer = document.getElementById('session-slots-grid');
  slotsContainer.innerHTML = '';

  if (!state.schedule || !state.schedule.currentWeek) {
    progressTitle.innerHTML = '<strong>No Active Week.</strong> Click Planner to setup this week\'s schedule!';
    percentText.textContent = '0%';
    bar.style.width = '0%';
    
    document.getElementById('today-workout-panel').innerHTML = `
      <div class="text-center padding-md">
        <h3>Training Schedule Not Configured</h3>
        <p class="text-secondary margin-top-xs">Select your 3 workout days for this week to begin training.</p>
        <button onclick="navigate('planner')" class="btn btn-accent margin-top-sm">Set Up Week Schedule</button>
      </div>
    `;
    return;
  }

  const week = state.schedule.currentWeek;
  progressTitle.textContent = `Week Schedule: ${week.weekId}`;
  
  // Calculate completion percentage
  const days = week.days;
  const totalDays = Object.keys(days).length;
  const completedDays = Object.values(days).filter(d => d.status === 'Completed').length;
  const percent = Math.round((completedDays / 3) * 100);
  
  percentText.textContent = `${percent}%`;
  bar.style.width = `${percent}%`;

  // Draw day tiles
  const dayNames = Object.keys(days);
  const dayIndex = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
  const sortedDays = dayNames.sort((a, b) => dayIndex[a] - dayIndex[b]);

  sortedDays.forEach(day => {
    const info = days[day];
    const slot = document.createElement('div');
    slot.className = `session-slot ${info.status.toLowerCase()}`;
    
    // Find Workout Name
    const workoutObj = state.program.days.find(d => d.id === info.workoutId);
    const wName = workoutObj ? workoutObj.name.split(' — ')[0] : 'Workout';

    slot.innerHTML = `
      <span class="slot-day">${escapeHTML(day)}</span>
      <span class="text-secondary font-xs">${escapeHTML(wName)}</span>
      <span class="slot-status status-${escapeHTML(info.status.toLowerCase())}">You: ${escapeHTML(info.status)}</span>
      <span class="slot-couple-status">Together: ${escapeHTML(info.overallStatus || info.status)}</span>
    `;
    slotsContainer.appendChild(slot);
  });

  // Render "Today's" or next active workout panel
  const upcomingDay = sortedDays.find(day => days[day].status === 'Upcoming' || days[day].status === 'In progress');
  
  if (upcomingDay) {
    const activeInfo = days[upcomingDay];
    const workoutObj = state.program.days.find(d => d.id === activeInfo.workoutId);
    const unlockStatus = checkSessionUnlockStatus(upcomingDay);
    
    let btnText = "Start Gym Session";
    if (state.activeWorkout && state.activeWorkout.workoutId === activeInfo.workoutId) {
      btnText = "Resume Gym Session";
    } else if (!unlockStatus.isUnlocked) {
      btnText = `🔒 Locked — Unlocks on ${upcomingDay}`;
    }

    document.getElementById('today-workout-panel').innerHTML = `
      <div class="dashboard-workout-card">
        <div class="workout-info-block">
          <div class="tag-group">
            <span class="tag tag-accent">${escapeHTML(upcomingDay)}</span>
            <span class="tag ${unlockStatus.isUnlocked ? '' : 'tag-warning'}">${unlockStatus.isUnlocked ? escapeHTML(activeInfo.status) : 'Locked Until ' + escapeHTML(upcomingDay)}</span>
          </div>
          <h3 class="margin-top-xs">${escapeHTML(workoutObj.name)}</h3>
          <p class="text-secondary font-sm"><strong>Focus:</strong> ${escapeHTML(workoutObj.focus)}</p>
          <p class="text-secondary font-sm"><strong>Est. Duration:</strong> 2h 40m | Exercises: ${workoutObj.exercises.length}</p>
          ${!unlockStatus.isUnlocked ? `<p class="font-xs margin-top-xs" style="color: #f59e0b;">⏳ Scheduled for <strong>${escapeHTML(upcomingDay)}</strong>. This session will automatically unlock on ${escapeHTML(upcomingDay)}!</p>` : ''}
        </div>
        <div>
          <button id="dashboard-start-workout-btn" class="${unlockStatus.isUnlocked ? 'btn btn-accent btn-lg' : 'btn btn-secondary btn-lg'}" ${unlockStatus.isUnlocked ? '' : 'disabled style="opacity: 0.6; cursor: not-allowed;"'}>${btnText}</button>
        </div>
      </div>
    `;

    if (unlockStatus.isUnlocked) {
      document.getElementById('dashboard-start-workout-btn').addEventListener('click', () => {
        if (state.activeWorkout && state.activeWorkout.workoutId === activeInfo.workoutId) {
          navigate('workout');
        } else {
          openReadinessModal(upcomingDay, activeInfo.workoutId);
        }
      });
    }

  } else {
    const mySessionsCompleted = Object.values(days).every(d => d.status === 'Completed');
    const allCompleted = Object.values(days).every(d => (d.overallStatus || d.status) === 'Completed');
    if (allCompleted) {
      document.getElementById('today-workout-panel').innerHTML = `
        <div class="text-center padding-md">
          <div class="celebration-icon">🎉</div>
          <h3>All Scheduled Sessions Completed!</h3>
          <p class="text-secondary margin-top-xs">Congratulations! Both of you crushed the training targets this week.</p>
          <button id="complete-active-week-btn" class="btn btn-accent margin-top-sm">Save & Complete Week</button>
        </div>
      `;
      document.getElementById('complete-active-week-btn').addEventListener('click', submitCompleteActiveWeek);
    } else if (mySessionsCompleted) {
      document.getElementById('today-workout-panel').innerHTML = `
        <div class="text-center padding-md">
          <div class="celebration-icon">✓</div>
          <h3>Your Training Week Is Complete</h3>
          <p class="text-secondary margin-top-xs">Your progress is saved. This shared week will close after your partner completes all three sessions.</p>
        </div>
      `;
    } else {
      // Handle missed sessions rescheduling
      document.getElementById('today-workout-panel').innerHTML = `
        <div class="text-center padding-md">
          <h3>Missed Workout Pending</h3>
          <p class="text-secondary margin-top-xs">You have missed scheduled training days. Please reschedule them within the week.</p>
          <button onclick="navigate('planner')" class="btn btn-primary margin-top-sm">Reschedule Now</button>
        </div>
      `;
    }
  }
}

// Complete Week execution
async function submitCompleteActiveWeek() {
  try {
    const res = await fetch('/api/schedule/complete-week', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.schedule = data.schedule;
    alert('Week completed! You can now plan your next week.');
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// Open Readiness Modal
function openReadinessModal(dayName, workoutId) {
  // Set User labels
  const user1Label = document.getElementById('readiness-user1-name');
  const user2Label = document.getElementById('readiness-user2-name');
  
  if (state.user) {
    user1Label.textContent = state.user.displayName;
  }
  user2Label.closest('.user-readiness-row').style.display = 'none';

  // Active ratings initialization
  document.querySelectorAll('.rating-picker[data-user-idx="0"]').forEach(picker => {
    picker.querySelectorAll('.rate-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-value') === '3') btn.classList.add('active'); // default to 3
    });
  });

  // Store metadata
  const overlay = document.getElementById('readiness-overlay');
  overlay.setAttribute('data-target-day', dayName);
  overlay.setAttribute('data-target-workout', workoutId);
  overlay.classList.remove('hidden');

  // Rate btn click toggles
  document.querySelectorAll('.rate-btn').forEach(btn => {
    btn.onclick = () => {
      const parent = btn.parentElement;
      parent.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
}

// Start Workout flow
async function startActiveWorkoutSession(e) {
  e.preventDefault();
  const overlay = document.getElementById('readiness-overlay');
  const dayName = overlay.getAttribute('data-target-day');
  const workoutId = overlay.getAttribute('data-target-workout');

  // Extract ratings
  const readinessScores = {};
  document.querySelectorAll('.rating-picker').forEach(picker => {
    const activeBtn = picker.querySelector('.rate-btn.active');
    const rating = activeBtn ? Number(activeBtn.getAttribute('data-value')) : 3;
    if (state.user) readinessScores[state.user.id] = rating;
  });

  overlay.classList.add('hidden');

  // Fetch target recommendations
  let recommendations = {};
  try {
    const recRes = await fetch(`/api/workout/recommendations/${workoutId}`);
    recommendations = await recRes.json();
  } catch (err) {
    console.error('Failed to retrieve progression suggestions:', err);
  }

  // Update schedule status to "In progress" on server
  try {
    await fetch('/api/schedule/update-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayName, status: 'In progress' })
    });
  } catch (err) {
    console.error('Failed to flag status in progress:', err);
  }
  // Create Active Session
  const workoutTemplate = state.program.days.find(d => d.id === workoutId);
  
  state.activeWorkout = {
    workoutId,
    scheduledDayName: dayName,
    startTime: new Date().toISOString(),
    endTime: null,
    phase: 'treadmill', // treadmill, strength, stretching, summary
    treadmillTimer: 60 * 60, // 60 minutes in seconds
    treadmillTimerActive: true,
    treadmillStageIdx: 0,
    currentExerciseIdx: 0,
    logs: {}, // userId -> exerciseId -> array of sets [{ setIndex, weight, reps, completed, difficulty, pain, notes }]
    treadmillLogs: {}, // userId -> { speed, incline, distance, calories, hr, notes }
    stretchIdx: 0,
    stretchTimer: 0,
    stretchTimerActive: false,
    readinessScores,
    recommendations,
    activeLoggerUserId: state.user.id
  };
  // Each phone records only the logged-in account's program and progress.
  getWorkoutUsers().forEach(u => {
    state.activeWorkout.logs[u.id] = {};
    workoutTemplate.exercises.forEach(ex => {
      state.activeWorkout.logs[u.id][ex.id] = Array.from({ length: ex.setsCount }, (_, idx) => ({
        setIndex: idx + 1,
        weight: recommendations[u.id] && recommendations[u.id][ex.id] && recommendations[u.id][ex.id].weight !== null 
          ? recommendations[u.id][ex.id].weight 
          : 0,
        reps: recommendations[u.id] && recommendations[u.id][ex.id] 
          ? recommendations[u.id][ex.id].reps 
          : ex.repRangeMin,
        completed: false,
        difficulty: 3,
        pain: 0,
        notes: ''
      }));
    });
  });
  await persistActiveWorkoutSession();

  // Refresh program/schedule locally
  await loadSchedule();

  // Navigate to workout
  navigate('workout');
  initActiveWorkoutWizard();
}

// Active Workout Wizard UI Manager
function initActiveWorkoutWizard() {
  if (!state.activeWorkout) return;
  
  const w = state.activeWorkout;
  
  // Highlight steps
  document.getElementById('wizard-step-treadmill').className = `step-indicator ${w.phase === 'treadmill' ? 'active' : (['strength', 'stretching', 'summary'].includes(w.phase) ? 'done' : '')}`;
  document.getElementById('wizard-step-strength').className = `step-indicator ${w.phase === 'strength' ? 'active' : (['stretching', 'summary'].includes(w.phase) ? 'done' : '')}`;
  document.getElementById('wizard-step-stretching').className = `step-indicator ${w.phase === 'stretching' ? 'active' : (['summary'].includes(w.phase) ? 'done' : '')}`;
  document.getElementById('wizard-step-summary').className = `step-indicator ${w.phase === 'summary' ? 'active' : ''}`;

  // Hide all phases
  document.getElementById('phase-treadmill').classList.add('hidden');
  document.getElementById('phase-strength').classList.add('hidden');
  document.getElementById('phase-stretching').classList.add('hidden');
  document.getElementById('phase-summary').classList.add('hidden');

  // Clear timers
  clearInterval(state.workoutTimer);
  clearInterval(state.restTimer);
  clearInterval(state.stretchTimer);

  // Show active phase
  if (w.phase === 'treadmill') {
    document.getElementById('phase-treadmill').classList.remove('hidden');
    startTreadmillCountdown();
    renderTreadmillStagesList();
    renderTreadmillLogCards();
  } else if (w.phase === 'strength') {
    document.getElementById('phase-strength').classList.remove('hidden');
    renderStrengthExercisePanel();
  } else if (w.phase === 'stretching') {
    document.getElementById('phase-stretching').classList.remove('hidden');
    startStretchingWizard();
  } else if (w.phase === 'summary') {
    document.getElementById('phase-summary').classList.remove('hidden');
    renderSummarySplash();
  }
}

// ----------------- PHASE 1: TREADMILL WARM-UP -----------------
function renderTreadmillStagesList() {
  const workoutTemplate = state.program.days.find(d => d.id === state.activeWorkout.workoutId);
  const stagesList = document.getElementById('treadmill-stages-list');
  stagesList.innerHTML = '<h4>Warm-up Progress (60 mins)</h4>';

  workoutTemplate.treadmill.forEach((stage, idx) => {
    const row = document.createElement('div');
    let statusClass = '';
    if (idx === state.activeWorkout.treadmillStageIdx) statusClass = 'active';
    else if (idx < state.activeWorkout.treadmillStageIdx) statusClass = 'done';

    row.className = `treadmill-stage-row ${statusClass}`;
    row.innerHTML = `
      <span class="stage-title">${stage.stage}. ${escapeHTML(stage.name)} (${stage.duration}m)</span>
      <span class="stage-meta">
        <span>Target speed: ${stage.speed} km/h</span>
        <span>Target incline: ${stage.incline}%</span>
        <span>Target HR: ${stage.hrTarget} bpm</span>
      </span>
    `;
    stagesList.appendChild(row);
  });
}

function renderTreadmillLogCards() {
  const u1Card = document.getElementById('treadmill-log-u1');
  const u2Card = document.getElementById('treadmill-log-u2');

  u1Card.querySelector('.user-header').textContent = state.user ? state.user.displayName : 'Me';
  u1Card.style.display = 'block';
  u2Card.style.display = 'none';
}

function getCardioStageSuggestions(stage) {
  // Start soft, increase after 12 completed sessions (1 month)
  const completedCount = state.analyticsData ? state.analyticsData.completedCount || 0 : 0;
  const speedBonus = completedCount >= 12 ? 0.4 : 0.0;
  const inclineBonus = completedCount >= 12 ? 1.0 : 0.0;
  return {
    speed: Math.round((stage.speed + speedBonus) * 10) / 10,
    incline: Math.round((stage.incline + inclineBonus) * 10) / 10
  };
}

function startTreadmillCountdown() {
  const displayClock = document.getElementById('treadmill-timer-clock');
  const stageLabel = document.getElementById('treadmill-stage-name');
  const workoutTemplate = state.program.days.find(d => d.id === state.activeWorkout.workoutId);

  const updateUI = () => {
    const seconds = state.activeWorkout.treadmillTimer;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    displayClock.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    // Determine current stage based on elapsed time (60 mins countdown)
    const elapsedMinutes = 60 - Math.ceil(seconds / 60);
    
    // Calculate stages boundaries
    let accumulator = 0;
    let currentStageIdx = 0;
    for (let i = 0; i < workoutTemplate.treadmill.length; i++) {
      accumulator += workoutTemplate.treadmill[i].duration;
      if (elapsedMinutes < accumulator) {
        currentStageIdx = i;
        break;
      }
    }
    // Cap at last index
    if (elapsedMinutes >= 60) {
      currentStageIdx = workoutTemplate.treadmill.length - 1;
    }

    if (currentStageIdx !== state.activeWorkout.treadmillStageIdx) {
      state.activeWorkout.treadmillStageIdx = currentStageIdx;
      playBeep(900, 0.4); // stage change notification beep!
      renderTreadmillStagesList();
    }

    const currentStage = workoutTemplate.treadmill[state.activeWorkout.treadmillStageIdx];
    
    // Suggest starting soft and scaling treadmill targets after 1 month
    const cardioTargets = getCardioStageSuggestions(currentStage);
    stageLabel.innerHTML = `Stage ${currentStage.stage}: ${escapeHTML(currentStage.name)}<br><span class="treadmill-target-glow" style="font-size: 0.95rem; color: var(--accent-color); font-weight: 500; display: block; margin-top: 4px;">Target: Speed ${cardioTargets.speed} km/h | Incline ${cardioTargets.incline}%</span>`;

    // Render Treadmill Visual guide loop
    const treadmillMediaContainer = document.getElementById('treadmill-media-container');
    if (treadmillMediaContainer) {
      renderExerciseSVGVisual(currentStage.name, treadmillMediaContainer, currentStage.media);
    }

    // Prepopulate placeholders on stage load
    const u1Speed = document.querySelector('#treadmill-log-u1 .treadmill-input-speed');
    const u1Incline = document.querySelector('#treadmill-log-u1 .treadmill-input-incline');
    if (u1Speed && !u1Speed.value) u1Speed.placeholder = cardioTargets.speed;
    if (u1Incline && !u1Incline.value) u1Incline.placeholder = cardioTargets.incline;

    const u2Speed = document.querySelector('#treadmill-log-u2 .treadmill-input-speed');
    const u2Incline = document.querySelector('#treadmill-log-u2 .treadmill-input-incline');
    if (u2Speed && !u2Speed.value) u2Speed.placeholder = cardioTargets.speed;
    if (u2Incline && !u2Incline.value) u2Incline.placeholder = cardioTargets.incline;
  };

  updateUI();

  // Controls Setup
  const pauseBtn = document.getElementById('treadmill-pause-btn');
  const startBtn = document.getElementById('treadmill-start-btn');
  const skipBtn = document.getElementById('treadmill-skip-btn');

  pauseBtn.onclick = () => {
    state.activeWorkout.treadmillTimerActive = false;
    pauseBtn.style.display = 'none';
    startBtn.style.display = 'inline-block';
  };

  startBtn.onclick = () => {
    state.activeWorkout.treadmillTimerActive = true;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
  };

  skipBtn.onclick = () => {
    if (confirm('Are you sure you want to skip the treadmill warm-up?')) {
      state.activeWorkout.treadmillTimer = 0;
      saveTreadmillLogsAndProceed();
    }
  };

  document.getElementById('complete-warmup-btn').onclick = () => {
    saveTreadmillLogsAndProceed();
  };

  // Timer interval
  state.workoutTimer = setInterval(() => {
    if (state.activeWorkout.treadmillTimerActive) {
      if (state.activeWorkout.treadmillTimer > 0) {
        state.activeWorkout.treadmillTimer--;
        updateUI();
      } else {
        clearInterval(state.workoutTimer);
        playBeep(1000, 1.0);
        alert('Treadmill warm-up complete! Time to start the working sets.');
        saveTreadmillLogsAndProceed();
      }
    }
  }, 1000);
}

function saveTreadmillLogsAndProceed() {
  clearInterval(state.workoutTimer);
  
  // Extract inputs
  const grabTreadmillCardLogs = (cardEl, userObj) => {
    if (!userObj) return null;
    return {
      userId: userObj.id,
      speed: Number(cardEl.querySelector('.treadmill-input-speed').value) || 0,
      incline: Number(cardEl.querySelector('.treadmill-input-incline').value) || 0,
      distance: Number(cardEl.querySelector('.treadmill-input-distance').value) || 0,
      calories: Number(cardEl.querySelector('.treadmill-input-calories').value) || 0,
      heartRate: Number(cardEl.querySelector('.treadmill-input-hr').value) || 0,
      notes: cardEl.querySelector('.treadmill-input-notes').value || ''
    };
  };

  const logs = {};
  if (state.user) {
    const log = grabTreadmillCardLogs(document.getElementById('treadmill-log-u1'), state.user);
    if (log) logs[state.user.id] = log;
  }

  state.activeWorkout.treadmillLogs = logs;
  state.activeWorkout.phase = 'strength';
  state.activeWorkout.currentExerciseIdx = 0;

  initActiveWorkoutWizard();
}

// ----------------- PHASE 2: WORKING SETS -----------------
function renderStrengthExercisePanel() {
  const w = state.activeWorkout;
  
  // Clear active intervals from previous exercises to prevent overlaps
  if (state.restTimer) {
    clearInterval(state.restTimer);
    state.restTimer = null;
  }
  if (state.workTimer) {
    clearInterval(state.workTimer);
    state.workTimer = null;
  }

  const workoutTemplate = state.program.days.find(d => d.id === w.workoutId);
  const exercise = workoutTemplate.exercises[w.currentExerciseIdx];

  // Set Indicators
  document.getElementById('exercise-index-indicator').textContent = `Exercise ${w.currentExerciseIdx + 1} of ${workoutTemplate.exercises.length}`;
  document.getElementById('workout-ex-name').textContent = exercise.name;
  document.getElementById('workout-ex-muscles').textContent = exercise.targetMuscles;

  // Giant Goal Banner Targets
  document.getElementById('workout-goal-sets').textContent = exercise.setsCount;
  document.getElementById('workout-goal-reps').textContent = `${exercise.repRangeMin}-${exercise.repRangeMax}`;

  // Instructions
  document.getElementById('workout-ex-setup').textContent = exercise.instructions.setup;
  document.getElementById('workout-ex-movement').textContent = exercise.instructions.movement;
  document.getElementById('workout-ex-breathing').textContent = exercise.instructions.breathing;
  document.getElementById('workout-ex-mistakes').textContent = exercise.instructions.commonMistakes;
  document.getElementById('workout-ex-safety').textContent = exercise.instructions.safety;
  document.getElementById('workout-ex-cues').textContent = exercise.instructions.cues;

  // Render Visual (Support PNG visual fallback)
  renderExerciseSVGVisual(exercise.name, document.getElementById('workout-ex-media'), exercise.media, {
    targetMuscles: exercise.targetMuscles,
    setup: exercise.instructions && exercise.instructions.setup,
    movement: exercise.instructions && exercise.instructions.movement,
    cues: exercise.instructions && exercise.instructions.cues
  });

  // User Logs Tab Switcher
  const tabsContainer = document.getElementById('workout-user-tabs');
  tabsContainer.innerHTML = '';
  getWorkoutUsers().forEach(u => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab-btn ${u.id === w.activeLoggerUserId ? 'active' : ''}`;
    btn.textContent = u.displayName;
    btn.onclick = () => {
      saveCurrentLiftsToState();
      w.activeLoggerUserId = u.id;
      renderStrengthExercisePanel();
    };
    tabsContainer.appendChild(btn);
  });

  // Navigation locks
  document.getElementById('prev-exercise-btn').disabled = w.currentExerciseIdx === 0;
  document.getElementById('prev-exercise-btn').onclick = () => {
    saveCurrentLiftsToState();
    w.currentExerciseIdx--;
    renderStrengthExercisePanel();
  };

  document.getElementById('next-exercise-btn').disabled = w.currentExerciseIdx === workoutTemplate.exercises.length - 1;
  document.getElementById('next-exercise-btn').onclick = () => {
    saveCurrentLiftsToState();
    w.currentExerciseIdx++;
    renderStrengthExercisePanel();
  };

  // Alternative Swap Button
  const swapBtn = document.getElementById('swap-exercise-btn');
  if (exercise.alternatives && exercise.alternatives.length > 0) {
    swapBtn.style.display = 'inline-block';
    swapBtn.onclick = () => triggerAlternativeSwap(exercise);
  } else {
    swapBtn.style.display = 'none';
  }

  // Skip Exercise
  document.getElementById('skip-exercise-btn').onclick = () => {
    const reason = prompt("Reason for skipping this exercise?");
    if (reason !== null) {
      // Mark all sets as skipped/failed, store reason in notes
      getWorkoutUsers().forEach(u => {
        const sets = w.logs[u.id][exercise.id];
        sets.forEach(set => {
          set.completed = false;
          set.notes = `SKIPPED: ${reason}`;
        });
      });
      alert('Exercise skipped.');
      if (w.currentExerciseIdx < workoutTemplate.exercises.length - 1) {
        w.currentExerciseIdx++;
        // Reset tab focus for next drill
        w.activeLoggerUserId = state.user.id;
        renderStrengthExercisePanel();
      } else {
        saveCurrentLiftsToState();
        proceedToStretching();
      }
    }
  };

  // --- Timer 1: Set Hold/Work Timer (displayed only for timed exercises like Plank) ---
  const workTimerBox = document.getElementById('exercise-work-timer-box');
  let workSecondsRemaining = exercise.repRangeMin || 30;

  if (exercise.isTimed) {
    workTimerBox.classList.remove('hidden');
    updateWorkTimerClock(workSecondsRemaining);
    
    const workToggle = document.getElementById('work-timer-toggle');
    workToggle.textContent = 'Start Hold';
    workToggle.className = 'btn btn-primary btn-xs';
    
    workToggle.onclick = () => {
      if (state.workTimer) {
        // Pause
        clearInterval(state.workTimer);
        state.workTimer = null;
        workToggle.textContent = 'Resume Hold';
        workToggle.className = 'btn btn-accent btn-xs';
      } else {
        // Start/Resume
        workToggle.textContent = 'Pause Hold';
        workToggle.className = 'btn btn-secondary btn-xs';
        state.workTimer = setInterval(() => {
          if (workSecondsRemaining > 0) {
            workSecondsRemaining--;
            updateWorkTimerClock(workSecondsRemaining);
          } else {
            clearInterval(state.workTimer);
            state.workTimer = null;
            workToggle.textContent = 'Start Hold';
            workToggle.className = 'btn btn-primary btn-xs';
            workSecondsRemaining = exercise.repRangeMin || 30;
            updateWorkTimerClock(workSecondsRemaining);
            
            // Play a multi-tone countdown chime
            playBeep(660, 0.2);
            setTimeout(() => playBeep(660, 0.2), 300);
            setTimeout(() => playBeep(880, 0.5), 600);
            
            setTimeout(() => {
              alert(`🔥 Hold completed! Great job on your ${exercise.name} set!`);
            }, 50);
          }
        }, 1000);
      }
    };
    
    document.getElementById('work-timer-minus').onclick = () => {
      workSecondsRemaining = Math.max(0, workSecondsRemaining - 5);
      updateWorkTimerClock(workSecondsRemaining);
    };
    
    document.getElementById('work-timer-plus').onclick = () => {
      workSecondsRemaining += 5;
      updateWorkTimerClock(workSecondsRemaining);
    };
  } else {
    workTimerBox.classList.add('hidden');
  }

  // --- Timer 2: Rest Period Timer ---
  let restSecondsRemaining = exercise.restSeconds;
  updateRestTimerClock(restSecondsRemaining);

  const timerToggle = document.getElementById('rest-timer-toggle');
  timerToggle.textContent = 'Start Rest';
  timerToggle.className = 'btn btn-primary btn-xs';

  timerToggle.onclick = () => {
    if (state.restTimer) {
      // Pause
      clearInterval(state.restTimer);
      state.restTimer = null;
      timerToggle.textContent = 'Resume Rest';
      timerToggle.className = 'btn btn-accent btn-xs';
    } else {
      // Start/Resume
      timerToggle.textContent = 'Pause Rest';
      timerToggle.className = 'btn btn-secondary btn-xs';
      state.restTimer = setInterval(() => {
        if (restSecondsRemaining > 0) {
          restSecondsRemaining--;
          updateRestTimerClock(restSecondsRemaining);
        } else {
          clearInterval(state.restTimer);
          state.restTimer = null;
          timerToggle.textContent = 'Start Rest';
          timerToggle.className = 'btn btn-primary btn-xs';
          restSecondsRemaining = exercise.restSeconds;
          updateRestTimerClock(restSecondsRemaining);
          
          // Sound a double-chime alarm beep
          playBeep(880, 0.35);
          setTimeout(() => playBeep(880, 0.35), 450);
          
          setTimeout(() => {
            alert(`Rest completed! Get ready for the next set of ${exercise.name}.`);
          }, 50);
        }
      }, 1000);
    }
  };

  document.getElementById('rest-timer-minus').onclick = () => {
    restSecondsRemaining = Math.max(0, restSecondsRemaining - 15);
    updateRestTimerClock(restSecondsRemaining);
  };

  document.getElementById('rest-timer-plus').onclick = () => {
    restSecondsRemaining += 15;
    updateRestTimerClock(restSecondsRemaining);
  };

  // Render Lift inputs for active user in tab
  renderUserLiftTable(exercise, w.activeLoggerUserId, document.getElementById('active-user-lift-card'), document.getElementById('active-user-sets-rows'));

  // Hook save exercise performance
  document.getElementById('save-exercise-sets-btn').onclick = () => {
    saveCurrentLiftsToState();
    
    // Check if there is pain level > 3 logged, alert a caution warning!
    let painWarning = false;
    getWorkoutUsers().forEach(u => {
      const sets = w.logs[u.id][exercise.id];
      if (sets && sets.some(s => s.pain > 3)) painWarning = true;
    });

    if (painWarning) {
      alert("⚠️ Caution Alert: Pain level logged is high. The progression suggestion for this exercise will recommend a deload in the next session to prevent injury. Consider lighter weight or replacing subsequent drills.");
    }

    // Move to next exercise or stretching
    if (w.currentExerciseIdx < workoutTemplate.exercises.length - 1) {
      w.currentExerciseIdx++;
      // Reset active logger to first user for the next exercise
      w.activeLoggerUserId = state.user.id;
      renderStrengthExercisePanel();
    } else {
      proceedToStretching();
    }
  };
}

function updateRestTimerClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  document.getElementById('rest-timer-clock').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateWorkTimerClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  document.getElementById('work-timer-clock').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function triggerAlternativeSwap(currentExercise) {
  const selectHtml = currentExercise.alternatives.map(alt => `<option value="${alt}">${alt}</option>`).join('');
  const choice = prompt(`Select an alternative exercise for ${currentExercise.name}:\n\nAvailable:\n${currentExercise.alternatives.join(', ')}\n\nEnter exact name to swap:`);
  
  if (choice && currentExercise.alternatives.includes(choice)) {
    // Modify current active program session exercise name
    const workoutTemplate = state.program.days.find(d => d.id === state.activeWorkout.workoutId);
    const targetEx = workoutTemplate.exercises[state.activeWorkout.currentExerciseIdx];
    
    // Track in logs notes that it was swapped
    getWorkoutUsers().forEach(u => {
      const logs = state.activeWorkout.logs[u.id][targetEx.id];
      logs.forEach(l => {
        l.notes = `Swapped from ${targetEx.name} to ${choice}. ` + (l.notes || '');
      });
    });

    targetEx.name = choice;
    alert(`Swapped exercise to ${choice}.`);
    renderStrengthExercisePanel();
  } else if (choice) {
    alert('Invalid alternative choice entered.');
  }
}

function renderUserLiftTable(exercise, userId, cardEl, rowsContainer) {
  const user = getWorkoutUsers().find(u => u.id === userId) || state.user;
  if (!user) return;

  cardEl.querySelector('h3').textContent = user.displayName;
  
  // Update suggestion pill
  const rec = state.activeWorkout.recommendations[user.id] && state.activeWorkout.recommendations[user.id][exercise.id];
  const recPill = cardEl.querySelector('.progression-pill');
  if (rec) {
    let recText = `Target: ${exercise.setsCount} sets × ${exercise.repRangeMin}-${exercise.repRangeMax}. `;
    if (rec.weight !== null) {
      recText += `Recommend weight: <strong>${rec.weight} ${user.unit || 'kg'}</strong>. `;
    } else {
      recText += `Recommend weight: <strong>Conservative Start / Bodyweight</strong>. `;
    }
    recText += `<br><span class="font-xs text-secondary">${escapeHTML(rec.notes)}</span>`;
    recPill.innerHTML = recText;
  } else {
    recPill.innerHTML = `Target: ${exercise.setsCount} sets × ${exercise.repRangeMin}-${exercise.repRangeMax}`;
  }

  // Populate Set Rows
  rowsContainer.innerHTML = '';
  const setsLogs = state.activeWorkout.logs[user.id][exercise.id];
  
  setsLogs.forEach((set, idx) => {
    const row = document.createElement('div');
    row.className = `set-log-row ${set.completed ? 'completed' : ''}`;
    
    const isChecked = set.completed ? 'checked' : '';
    
    row.innerHTML = `
      <span class="set-index-col"><small>Set</small>${idx + 1}</span>
      <div class="set-field">
        <span class="set-field-label">Weight (${escapeHTML(user.unit || 'kg')})</span>
        <div class="touch-counter">
          <button type="button" class="btn-dec-w btn btn-secondary btn-xs">−2.5</button>
          <input type="number" step="0.25" class="input-weight" value="${set.weight ?? ''}" placeholder="${user.unit || 'kg'}">
          <button type="button" class="btn-inc-w btn btn-secondary btn-xs">+2.5</button>
        </div>
      </div>
      <div class="set-field">
        <span class="set-field-label">Reps</span>
        <div class="touch-counter">
          <button type="button" class="btn-dec-r btn btn-secondary btn-xs">−1</button>
          <input type="number" step="1" class="input-reps" value="${set.reps || ''}" placeholder="Reps">
          <button type="button" class="btn-inc-r btn btn-secondary btn-xs">+1</button>
        </div>
      </div>
      <div class="set-field set-difficulty-field">
        <span class="set-field-label">Effort</span>
        <select class="select-diff">
          <option value="1" ${set.difficulty === 1 ? 'selected' : ''}>Easy</option>
          <option value="2" ${set.difficulty === 2 ? 'selected' : ''}>Moderate</option>
          <option value="3" ${set.difficulty === 3 ? 'selected' : ''}>Hard</option>
          <option value="4" ${set.difficulty === 4 ? 'selected' : ''}>Intense</option>
        </select>
      </div>
      <div class="chk-completed-wrapper">
        <span class="set-field-label">Done</span>
        <button type="button" class="btn-check-done ${isChecked}" data-set-idx="${idx}" aria-label="Mark set ${idx + 1} complete">✓</button>
      </div>
    `;

    // Done checkbox toggle event (starts rest timer immediately on set finished!)
    const doneBtn = row.querySelector('.btn-check-done');
    doneBtn.onclick = () => {
      const checked = !doneBtn.classList.contains('checked');
      doneBtn.classList.toggle('checked', checked);
      row.classList.toggle('completed', checked);
      
      // Update state value
      set.completed = checked;

      if (checked) {
        // Start rest timer automatically!
        triggerAutoRestTimer(exercise.restSeconds);
      }
    };

    // Touch button handlers
    const wInput = row.querySelector('.input-weight');
    row.querySelector('.btn-dec-w').onclick = () => {
      let val = parseFloat(wInput.value) || 0;
      val = Math.max(0, val - 2.5);
      wInput.value = val;
      set.weight = val;
    };
    row.querySelector('.btn-inc-w').onclick = () => {
      let val = parseFloat(wInput.value) || 0;
      val = val + 2.5;
      wInput.value = val;
      set.weight = val;
    };

    const rInput = row.querySelector('.input-reps');
    row.querySelector('.btn-dec-r').onclick = () => {
      let val = parseInt(rInput.value) || 0;
      val = Math.max(0, val - 1);
      rInput.value = val;
      set.reps = val;
    };
    row.querySelector('.btn-inc-r').onclick = () => {
      let val = parseInt(rInput.value) || 0;
      val = val + 1;
      rInput.value = val;
      set.reps = val;
    };

    rowsContainer.appendChild(row);
  });
}

function triggerAutoRestTimer(seconds) {
  // Find rest timer trigger button
  const timerToggle = document.getElementById('rest-timer-toggle');
  if (timerToggle) {
    if (timerToggle.textContent.includes('Start') || timerToggle.textContent.includes('Resume')) {
      timerToggle.click();
    }
  }
}

function saveCurrentLiftsToState() {
  const w = state.activeWorkout;
  if (!w || w.phase !== 'strength') return;
  const workoutTemplate = state.program.days.find(d => d.id === w.workoutId);
  const exercise = workoutTemplate.exercises[w.currentExerciseIdx];

  const rowsContainer = document.getElementById('active-user-sets-rows');
  if (!rowsContainer) return;
  const rows = rowsContainer.querySelectorAll('.set-log-row');
  const logs = w.logs[w.activeLoggerUserId][exercise.id];
  
  rows.forEach((row, idx) => {
    const weight = parseFloat(row.querySelector('.input-weight').value) || 0;
    const reps = parseInt(row.querySelector('.input-reps').value) || 0;
    const difficulty = parseInt(row.querySelector('.select-diff').value) || 3;
    const completed = row.querySelector('.btn-check-done').classList.contains('checked');

    if (logs && logs[idx]) {
      logs[idx].weight = weight;
      logs[idx].reps = reps;
      logs[idx].difficulty = difficulty;
      logs[idx].completed = completed;
    }
  });
}

function proceedToStretching() {
  state.activeWorkout.phase = 'stretching';
  state.activeWorkout.stretchIdx = 0;
  persistActiveWorkoutSession();
  initActiveWorkoutWizard();
}

// ----------------- PHASE 3: GUIDED STRETCHING -----------------
function startStretchingWizard() {
  const w = state.activeWorkout;
  const workoutTemplate = state.program.days.find(d => d.id === w.workoutId);
  
  // Render stretches preview panel
  const preview = document.getElementById('stretches-list-preview');
  preview.innerHTML = '<h4>Today\'s Stretch Checklist (10m)</h4>';
  
  workoutTemplate.stretches.forEach((st, idx) => {
    const row = document.createElement('div');
    row.className = `stretch-preview-row ${idx === w.stretchIdx ? 'active' : ''}`;
    row.innerHTML = `
      <span>${escapeHTML(st.name)}</span>
      <span class="text-secondary">${st.duration}s</span>
    `;
    preview.appendChild(row);
  });

  // Current Stretch info
  const stretch = workoutTemplate.stretches[w.stretchIdx];
  document.getElementById('stretch-name').textContent = stretch.name;
  document.getElementById('stretch-muscle').textContent = stretch.muscle;
  document.getElementById('stretch-description').textContent = stretch.description;

  // Render Stretch Visual
  const mediaContainer = document.getElementById('stretch-media-container');
  if (mediaContainer) {
    renderExerciseSVGVisual(stretch.name, mediaContainer, stretch.media);
  }

  // Side indicator
  const sideAlert = document.getElementById('stretch-side-display');
  const updateSideAlertUI = (stretchEl, alertEl) => {
    const textEl = document.getElementById('stretch-side-text');
    if (w.stretchSide === 'left') {
      alertEl.style.background = 'rgba(59, 130, 246, 0.15)';
      alertEl.style.borderColor = 'rgba(59, 130, 246, 0.3)';
      alertEl.style.color = '#3b82f6';
      textEl.innerHTML = `👈 <strong>Left Side Active:</strong> Hold for ${stretchEl.duration} seconds. Then we will switch sides.`;
    } else {
      alertEl.style.background = 'rgba(16, 185, 129, 0.15)';
      alertEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      alertEl.style.color = '#10b981';
      textEl.innerHTML = `👉 <strong>Right Side Active:</strong> Hold for ${stretchEl.duration} seconds. Make sure to match the stretch depth.`;
    }
  };

  if (stretch.sideIndicator) {
    if (!w.stretchSide) {
      w.stretchSide = 'left';
    }
    sideAlert.style.display = 'block';
    updateSideAlertUI(stretch, sideAlert);
  } else {
    w.stretchSide = null;
    sideAlert.style.display = 'none';
  }

  // Stretch Countdown Setup
  w.stretchTimer = stretch.duration;
  w.stretchTimerActive = true;
  
  const displayClock = document.getElementById('stretch-timer-clock');
  const bar = document.getElementById('stretch-progress-bar');

  const updateClockUI = () => {
    const m = Math.floor(w.stretchTimer / 60);
    const s = w.stretchTimer % 60;
    displayClock.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    const pct = (w.stretchTimer / stretch.duration) * 100;
    bar.style.width = `${pct}%`;
  };

  updateClockUI();

  // Button triggers
  const pauseBtn = document.getElementById('stretch-pause-btn');
  const startBtn = document.getElementById('stretch-start-btn');
  const nextBtn = document.getElementById('next-stretch-btn');
  const skipBtn = document.getElementById('skip-stretching-btn');

  pauseBtn.onclick = () => {
    w.stretchTimerActive = false;
    pauseBtn.style.display = 'none';
    startBtn.style.display = 'inline-block';
  };

  startBtn.onclick = () => {
    w.stretchTimerActive = true;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
  };

  nextBtn.onclick = () => {
    if (stretch.sideIndicator && w.stretchSide === 'left') {
      w.stretchSide = 'right';
      w.stretchTimer = stretch.duration;
      updateSideAlertUI(stretch, sideAlert);
      updateClockUI();
    } else {
      advanceStretchStage(workoutTemplate.stretches.length);
    }
  };

  skipBtn.onclick = () => {
    const reason = prompt("Enter a reason for skipping the stretching portion:");
    if (reason !== null) {
      state.activeWorkout.stretchSkippedReason = reason;
      proceedToSummary();
    }
  };

  // Interval timer
  state.stretchTimer = setInterval(() => {
    if (w.stretchTimerActive) {
      if (w.stretchTimer > 0) {
        w.stretchTimer--;
        updateClockUI();
      } else {
        if (stretch.sideIndicator && w.stretchSide === 'left') {
          playBeep(950, 0.6);
          w.stretchSide = 'right';
          w.stretchTimer = stretch.duration;
          updateSideAlertUI(stretch, sideAlert);
          updateClockUI();
        } else {
          clearInterval(state.stretchTimer);
          playBeep(950, 0.6);
          advanceStretchStage(workoutTemplate.stretches.length);
        }
      }
    }
  }, 1000);
}

function advanceStretchStage(totalStretches) {
  clearInterval(state.stretchTimer);
  const w = state.activeWorkout;
  w.stretchSide = null; // Reset side preference
  
  if (w.stretchIdx < totalStretches - 1) {
    w.stretchIdx++;
    startStretchingWizard();
  } else {
    proceedToSummary();
  }
}

function proceedToSummary() {
  state.activeWorkout.phase = 'summary';
  state.activeWorkout.endTime = new Date().toISOString();
  persistActiveWorkoutSession();
  initActiveWorkoutWizard();
}

// ----------------- PHASE 4: SUMMARY & SUBMIT -----------------
function renderSummarySplash() {
  const w = state.activeWorkout;
  
  // Calculate duration
  const start = new Date(w.startTime);
  const end = new Date(w.endTime);
  const diffMins = Math.round((end - start) / (1000 * 60));
  
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  document.getElementById('summary-duration').textContent = h > 0 ? `${h}h ${m}m` : `${m} mins`;

  // Calculate volume & sets counts per user
  const calcUserStats = (userObj) => {
    if (!userObj) return { sets: 0, vol: 0 };
    let sets = 0;
    let vol = 0;
    
    const uLogs = w.logs[userObj.id] || {};
    Object.keys(uLogs).forEach(exId => {
      uLogs[exId].forEach(s => {
        if (s.completed) {
          sets++;
          vol += (s.weight || 0) * (s.reps || 0);
        }
      });
    });
    return { sets, vol };
  };

  const stat1 = calcUserStats(state.user);
  const stat2 = { sets: 0, vol: 0 };

  document.getElementById('summary-total-sets').textContent = `${stat1.sets + stat2.sets} sets`;
  
  const unit = state.user ? state.user.unit : 'kg';
  document.getElementById('summary-u1-volume').textContent = `${stat1.vol.toLocaleString()} ${unit}`;
  document.getElementById('summary-u2-volume').closest('.stat-box').style.display = 'none';

  // Update difficulty rating labels
  document.getElementById('lbl-difficulty-u1').textContent = `${state.user.displayName}'s Rating (1-5)`;
  document.getElementById('lbl-difficulty-u2').closest('.form-control').style.display = 'none';

  // Save session submit action
  document.getElementById('save-session-btn').onclick = async () => {
    // Overall feedback values
    const diffScores = {};
    const u1Diff = Number(document.getElementById('session-diff-u1').value);
    if (state.user) diffScores[state.user.id] = u1Diff;

    const stretchData = {};
    getWorkoutUsers().forEach(u => {
      stretchData[u.id] = {
        completed: !state.activeWorkout.stretchSkippedReason,
        skippedReason: state.activeWorkout.stretchSkippedReason || ''
      };
    });

    const completionPayload = {
      workoutId: w.workoutId,
      scheduledDayName: w.scheduledDayName,
      startTime: w.startTime,
      endTime: w.endTime,
      logs: w.logs,
      treadmillData: w.treadmillLogs,
      stretchData,
      readinessScores: w.readinessScores,
      difficultyScores: diffScores,
      sessionNotes: document.getElementById('session-summary-notes').value || ''
    };

    try {
      const res = await fetch('/api/workout/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completionPayload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Session saved successfully!');
      state.activeWorkout = null;
      await fetch('/api/workout/active', { method: 'DELETE' });
      // Refresh configurations
      await loadSchedule();
      navigate('dashboard');
    } catch (err) {
      alert('Failed to save workout results: ' + err.message);
    }
  };
}

// ----------------- WEEKLY PLANNER VIEW -----------------
function checkPlannerSelections() {
  const checkboxes = document.getElementsByName('train-days');
  const checked = Array.from(checkboxes).filter(c => c.checked);
  
  const mappingBox = document.getElementById('mapping-description');
  const warningsBox = document.getElementById('planner-warnings-box');
  const saveBtn = document.getElementById('save-week-plan-btn');

  // Must select exactly 3
  if (checked.length === 3) {
    saveBtn.disabled = false;
    
    const dayIndex = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
    const sortedDays = checked.map(c => c.value).sort((a, b) => dayIndex[a] - dayIndex[b]);

    // Show program sequence layout mapping description
    mappingBox.innerHTML = `
      <strong>Assigned Program Mapping:</strong><br>
      📅 <strong>Day 1 — Front Frame:</strong> scheduled on <strong>${sortedDays[0]}</strong><br>
      📅 <strong>Day 2 — Monster Back:</strong> scheduled on <strong>${sortedDays[1]}</strong><br>
      📅 <strong>Day 3 — Fix the Foundation:</strong> scheduled on <strong>${sortedDays[2]}</strong>
    `;
    mappingBox.classList.remove('hidden');

    // Spacing validation warnings
    const warnings = [];
    for (let i = 0; i < sortedDays.length; i++) {
      const d1 = sortedDays[i];
      const d2 = sortedDays[(i + 1) % sortedDays.length];
      let diff = dayIndex[d2] - dayIndex[d1];
      if (diff < 0) diff += 7; // wrap week

      if (diff === 1) {
        warnings.push(`⚠️ Spacing warning: <strong>${d1}</strong> and <strong>${d2}</strong> are consecutive days. We suggest leaving at least 1 recovery day for muscle fatigue management.`);
      }
    }

    if (warnings.length > 0) {
      warningsBox.innerHTML = warnings.join('<br>');
      warningsBox.classList.remove('hidden');
    } else {
      warningsBox.classList.add('hidden');
    }

  } else {
    saveBtn.disabled = true;
    mappingBox.classList.add('hidden');
    warningsBox.classList.add('hidden');
  }
}

function loadPlanner() {
  // Populate Weeks select
  const select = document.getElementById('planner-week-select');
  select.innerHTML = '';
  
  // Calculate current and next week ISO formats
  const getWeekId = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
  };

  const currWeek = getWeekId(new Date());
  
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 7);
  const nextWeek = getWeekId(nextDate);

  select.innerHTML = `
    <option value="${currWeek}" selected>Current Week (${currWeek})</option>
    <option value="${nextWeek}">Next Week (${nextWeek})</option>
  `;

  // Clean checkboxes
  const checkboxes = document.getElementsByName('train-days');
  checkboxes.forEach(c => c.checked = false);
  document.getElementById('save-week-plan-btn').disabled = true;
  document.getElementById('mapping-description').classList.add('hidden');
  document.getElementById('planner-warnings-box').classList.add('hidden');

  // Rescheduling population
  const reschedSection = document.getElementById('reschedule-section');
  if (state.schedule && state.schedule.currentWeek) {
    reschedSection.style.display = 'block';
    
    const fromSelect = document.getElementById('resched-from');
    const toSelect = document.getElementById('resched-to');
    
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    const days = state.schedule.currentWeek.days;
    Object.keys(days).forEach(day => {
      const workoutObj = state.program.days.find(d => d.id === days[day].workoutId);
      fromSelect.innerHTML += `<option value="${day}">${day} (${workoutObj ? workoutObj.name.split(' — ')[0] : 'Workout'})</option>`;
    });

    const allDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    allDays.forEach(day => {
      if (!days[day]) {
        toSelect.innerHTML += `<option value="${day}">${day}</option>`;
      }
    });
  } else {
    reschedSection.style.display = 'none';
  }
}

async function saveWeeklyPlan(e) {
  e.preventDefault();
  const weekId = document.getElementById('planner-week-select').value;
  const checkboxes = document.getElementsByName('train-days');
  const checked = Array.from(checkboxes).filter(c => c.checked);

  // Chronologically order days
  const dayIndex = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
  const sortedDays = checked.map(c => c.value).sort((a, b) => dayIndex[a] - dayIndex[b]);

  const daysMapping = {};
  daysMapping[sortedDays[0]] = "day_1";
  daysMapping[sortedDays[1]] = "day_2";
  daysMapping[sortedDays[2]] = "day_3";

  try {
    const res = await fetch('/api/schedule/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId, daysMapping })
    });

    if (res.status === 401) {
      alert('Your session has expired. Please log back in to lock your schedule.');
      state.user = null;
      navigate('login');
      return;
    }

    const contentType = res.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      throw new Error(`Server status ${res.status}: Unable to process request. Please try again.`);
    }

    if (!res.ok) throw new Error(data.error || 'Failed to lock schedule.');

    state.schedule = data.schedule;
    alert('Week schedule locked successfully!');
    navigate('dashboard');
  } catch (err) {
    alert(err.message);
  }
}

async function submitReschedule() {
  const fromDay = document.getElementById('resched-from').value;
  const toDay = document.getElementById('resched-to').value;

  if (!fromDay || !toDay) return;

  try {
    const res = await fetch('/api/schedule/update-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayName: fromDay, status: 'Rescheduled', rescheduledTo: toDay })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reschedule');

    state.schedule = data.schedule;

    alert(`Successfully rescheduled workout from ${fromDay} to ${toDay}.`);
    loadPlanner();
  } catch (err) {
    alert(err.message);
  }
}

// ----------------- PROGRAM SCREEN / EDITOR -----------------
let activeEditorDayId = 'day_1';

function loadProgramEditor() {
  // Hook tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.className = `tab-btn ${btn.getAttribute('data-day-id') === activeEditorDayId ? 'active' : ''}`;
    btn.onclick = () => {
      activeEditorDayId = btn.getAttribute('data-day-id');
      loadProgramEditor();
    };
  });

  const dayObj = state.program.days.find(d => d.id === activeEditorDayId);
  document.getElementById('editor-day-title').textContent = dayObj.name;
  document.getElementById('editor-day-focus').value = dayObj.focus;

  // Build Exercises list
  const listContainer = document.getElementById('editor-exercises-list');
  listContainer.innerHTML = '';

  dayObj.exercises.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className = 'exercise-edit-card';
    card.setAttribute('data-idx', idx);
    card.innerHTML = `
      <div class="edit-card-header">
        <strong>${escapeHTML(ex.name)}</strong>
        <button class="btn btn-secondary btn-xs btn-delete-ex">Delete</button>
      </div>
      <div class="form-grid">
        <div class="form-control">
          <label>Exercise Name</label>
          <input type="text" class="edit-ex-name" value="${escapeHTML(ex.name)}">
        </div>
        <div class="form-control">
          <label>Target Muscles</label>
          <input type="text" class="edit-ex-muscles" value="${escapeHTML(ex.targetMuscles)}">
        </div>
        <div class="form-control">
          <label>Working Sets Count</label>
          <input type="number" class="edit-ex-sets" value="${ex.setsCount}">
        </div>
        <div class="form-control">
          <label>Repetition Range (Min - Max)</label>
          <div class="form-row">
            <input type="number" class="edit-ex-rep-min" value="${ex.repRangeMin}">
            <input type="number" class="edit-ex-rep-max" value="${ex.repRangeMax}">
          </div>
        </div>
        <div class="form-control">
          <label>Rest Interval (seconds)</label>
          <input type="number" class="edit-ex-rest" value="${ex.restSeconds}">
        </div>
        <div class="form-control">
          <label>Exercise Structure</label>
          <select class="edit-ex-structure input-select">
            <option value="straight" ${ex.structureType === 'straight' ? 'selected' : ''}>Straight Sets</option>
            <option value="superset" ${ex.structureType === 'superset' ? 'selected' : ''}>Superset</option>
            <option value="round" ${ex.structureType === 'round' ? 'selected' : ''}>Round</option>
          </select>
        </div>
      </div>
    `;

    card.querySelector('.btn-delete-ex').onclick = () => {
      if (confirm(`Remove ${ex.name} from the program?`)) {
        dayObj.exercises.splice(idx, 1);
        loadProgramEditor();
      }
    };

    listContainer.appendChild(card);
  });

  // Render changelogs
  renderChangeLogsList();
}

async function renderChangeLogsList() {
  try {
    const res = await fetch('/api/changelog');
    const logs = await res.json();
    const listEl = document.getElementById('changelog-list');
    listEl.innerHTML = '';
    
    if (logs.length === 0) {
      listEl.innerHTML = '<li class="text-secondary">No edits recorded yet.</li>';
      return;
    }

    logs.reverse().forEach(log => {
      const li = document.createElement('li');
      const timeStr = new Date(log.timestamp).toLocaleString();
      li.innerHTML = `<strong>${escapeHTML(log.username)}</strong> at ${escapeHTML(timeStr)}: <span>${escapeHTML(log.action)}</span>`;
      listEl.appendChild(li);
    });
  } catch (e) {
    console.error('Failed to load changelogs:', e);
  }
}

function addNewExerciseTemplate() {
  const dayObj = state.program.days.find(d => d.id === activeEditorDayId);
  const newEx = {
    id: "ex_custom_" + Math.random().toString(36).substr(2, 9),
    name: "New Custom Exercise",
    targetMuscles: "Core",
    setsCount: 3,
    repRangeMin: 8,
    repRangeMax: 12,
    restSeconds: 90,
    structureType: "straight",
    instructions: {
      setup: "Position yourself comfortably with your back flat.",
      movement: "Execute the reps smoothly with strict form.",
      breathing: "Breathing slowly.",
      commonMistakes: "None",
      safety: "None",
      cues: "Focus"
    },
    alternatives: [],
    media: "/assets/images/default.svg"
  };

  dayObj.exercises.push(newEx);
  loadProgramEditor();
}

async function saveProgramChanges() {
  // Extract inputs from editor list cards
  const dayObj = state.program.days.find(d => d.id === activeEditorDayId);
  
  dayObj.focus = document.getElementById('editor-day-focus').value;

  const cards = document.getElementById('editor-exercises-list').querySelectorAll('.exercise-edit-card');
  cards.forEach(card => {
    const idx = parseInt(card.getAttribute('data-idx'));
    const ex = dayObj.exercises[idx];
    
    ex.name = card.querySelector('.edit-ex-name').value;
    ex.targetMuscles = card.querySelector('.edit-ex-muscles').value;
    ex.setsCount = parseInt(card.querySelector('.edit-ex-sets').value) || 3;
    ex.repRangeMin = parseInt(card.querySelector('.edit-ex-rep-min').value) || 8;
    ex.repRangeMax = parseInt(card.querySelector('.edit-ex-rep-max').value) || 12;
    ex.restSeconds = parseInt(card.querySelector('.edit-ex-rest').value) || 90;
    ex.structureType = card.querySelector('.edit-ex-structure').value;
  });

  try {
    const res = await fetch('/api/program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.program)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.program = data.program;
    alert('Workout program config updated successfully!');
    loadProgramEditor();
  } catch (err) {
    alert(err.message);
  }
}

async function resetProgramDefaults() {
  if (confirm('Are you sure you want to restore the original base 3-day program? All customizations will be overwritten.')) {
    try {
      const res = await fetch('/api/program/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      state.program = data.program;
      alert('Original program template restored.');
      loadProgramEditor();
    } catch (err) {
      alert(err.message);
    }
  }
}

// ----------------- PROGRESS REPORT VIEW -----------------
async function loadProgressReport() {
  try {
    const res = await fetch('/api/analytics');
    state.analyticsData = await res.json();
    
    renderProgressStatsGrid();
    renderCustomCharts();
    renderEstimatedPRTable();
    await loadMeasurementsTable();
  } catch (e) {
    console.error('Failed to load analytics logs:', e);
  }
}

function renderProgressStatsGrid() {
  const container = document.getElementById('progress-stats-container');
  container.innerHTML = '';

  const data = state.analyticsData;
  if (!data || !data.stats) return;

  state.usersList.forEach(user => {
    const stat = data.stats[user.id] || { completedCount: 0, totalSets: 0, totalReps: 0, totalVolume: 0, totalTreadmillDistance: 0, totalTreadmillCalories: 0 };
    
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.innerHTML = `
      <h3 class="user-header">${escapeHTML(user.displayName)}</h3>
      <div class="margin-top-xs">
        <p class="text-secondary font-xs">Workouts Completed</p>
        <p class="stat-val" style="font-size: 1.5rem;">${stat.completedCount}</p>
      </div>
      <div class="margin-top-xs">
        <p class="text-secondary font-xs">Total Weight Lifted</p>
        <p class="stat-val" style="font-size: 1.5rem; color: var(--accent-blue);">${stat.totalVolume.toLocaleString()} ${user.unit || 'kg'}</p>
      </div>
      <div class="margin-top-xs">
        <p class="text-secondary font-xs">Treadmill Distance</p>
        <p class="stat-val" style="font-size: 1.5rem; color: var(--accent-green);">${stat.totalTreadmillDistance} km</p>
      </div>
      <div class="margin-top-xs">
        <p class="text-secondary font-xs">Est. Energy Burned</p>
        <p class="stat-val" style="font-size: 1.5rem;">${stat.totalTreadmillCalories} kcal</p>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderCustomCharts() {
  const data = state.analyticsData;
  const volChart = document.getElementById('chart-volume');
  const tmChart = document.getElementById('chart-treadmill');

  volChart.innerHTML = '';
  tmChart.innerHTML = '';

  if (!data || !data.timeline || data.timeline.length === 0) {
    volChart.innerHTML = '<div class="text-secondary padding-md">No workout logs recorded yet. Complete sessions to populate charts.</div>';
    tmChart.innerHTML = '<div class="text-secondary padding-md">No cardio logs recorded yet.</div>';
    return;
  }

  // Draw volume bars (max 6 points)
  const timelineLimit = data.timeline.slice(-6);
  
  timelineLimit.forEach(log => {
    // Volume Graph
    const vWrapper = document.createElement('div');
    vWrapper.className = 'chart-bar-wrapper';

    const u1 = state.usersList[0];
    const u2 = state.usersList[1];

    const u1Vol = u1 && log.users[u1.id] ? log.users[u1.id].volume : 0;
    const u2Vol = u2 && log.users[u2.id] ? log.users[u2.id].volume : 0;

    // Calculate height (percent of max volume)
    const maxVal = Math.max(...timelineLimit.map(l => {
      const u1V = u1 && l.users[u1.id] ? l.users[u1.id].volume : 0;
      const u2V = u2 && l.users[u2.id] ? l.users[u2.id].volume : 0;
      return Math.max(u1V, u2V, 1000);
    }));

    const u1Pct = Math.max(2, Math.round((u1Vol / maxVal) * 80));
    const u2Pct = Math.max(2, Math.round((u2Vol / maxVal) * 80));

    const shortDate = log.date.substring(5);

    vWrapper.innerHTML = `
      <div class="chart-bar-double">
        ${u1 ? `<div class="chart-bar-u1" style="height: ${u1Pct}%;" title="${escapeHTML(u1.displayName)}: ${u1Vol} kg"></div>` : ''}
        ${u2 ? `<div class="chart-bar-u2" style="height: ${u2Pct}%;" title="${escapeHTML(u2.displayName)}: ${u2Vol} kg"></div>` : ''}
      </div>
      <div class="chart-bar-label">${shortDate}</div>
    `;
    volChart.appendChild(vWrapper);

    // Treadmill Distance Graph
    const tmWrapper = document.createElement('div');
    tmWrapper.className = 'chart-bar-wrapper';

    const u1Dist = u1 && log.users[u1.id] ? log.users[u1.id].treadmillDistance : 0;
    const u2Dist = u2 && log.users[u2.id] ? log.users[u2.id].treadmillDistance : 0;

    const maxDist = Math.max(...timelineLimit.map(l => {
      const u1D = u1 && l.users[u1.id] ? l.users[u1.id].treadmillDistance : 0;
      const u2D = u2 && l.users[u2.id] ? l.users[u2.id].treadmillDistance : 0;
      return Math.max(u1D, u2D, 5);
    }));

    const u1DistPct = Math.max(2, Math.round((u1Dist / maxDist) * 80));
    const u2DistPct = Math.max(2, Math.round((u2Dist / maxDist) * 80));

    tmWrapper.innerHTML = `
      <div class="chart-bar-double">
        ${u1 ? `<div class="chart-bar-u1" style="height: ${u1DistPct}%;" title="${escapeHTML(u1.displayName)}: ${u1Dist} km"></div>` : ''}
        ${u2 ? `<div class="chart-bar-u2" style="height: ${u2DistPct}%;" title="${escapeHTML(u2.displayName)}: ${u2Dist} km"></div>` : ''}
      </div>
      <div class="chart-bar-label">${shortDate}</div>
    `;
    tmChart.appendChild(tmWrapper);
  });
}

function renderEstimatedPRTable() {
  const prContainer = document.getElementById('pr-list-container');
  prContainer.innerHTML = '';

  const data = state.analyticsData;
  if (!data || !data.stats) return;

  const u1 = state.usersList[0] || state.user;
  const u2 = state.usersList[1];

  const u1Prs = u1 && data.stats[u1.id] ? data.stats[u1.id].prs : {};
  const u2Prs = u2 && data.stats[u2.id] ? data.stats[u2.id].prs : {};

  // Build a distinct set of exercises completed
  const allCompletedEx = new Set([...Object.keys(u1Prs), ...Object.keys(u2Prs)]);

  if (allCompletedEx.size === 0) {
    prContainer.innerHTML = '<div class="text-secondary padding-md">PR records will display once exercise logs are saved.</div>';
    return;
  }

  allCompletedEx.forEach(exId => {
    // Find exercise configuration details
    let exDetails = null;
    for (let i = 0; i < state.program.days.length; i++) {
      const found = state.program.days[i].exercises.find(e => e.id === exId);
      if (found) {
        exDetails = found;
        break;
      }
    }

    if (!exDetails) return;

    const prItem = document.createElement('div');
    prItem.className = 'pr-item';
    
    const u1PrVal = u1Prs[exId] || 0;
    const u2PrVal = u2Prs[exId] || 0;

    prItem.innerHTML = `
      <div class="pr-meta">
        <div class="pr-title">${escapeHTML(exDetails.name)}</div>
        <div class="pr-muscles">${escapeHTML(exDetails.targetMuscles)}</div>
      </div>
      <div class="pr-records">
        ${u1PrVal > 0 ? `<div class="pr-value">${escapeHTML(u1.displayName)}: ${u1PrVal} ${escapeHTML(u1.unit || 'kg')}</div>` : ''}
        ${u2 && u2PrVal > 0 ? `<div class="pr-value partner">${escapeHTML(u2.displayName)}: ${u2PrVal} ${escapeHTML(u2.unit || 'kg')}</div>` : ''}
      </div>
    `;
    prContainer.appendChild(prItem);
  });
}

// Measurements Table loading
async function loadMeasurementsTable() {
  try {
    const res = await fetch('/api/measurements');
    const logs = await res.json();
    
    const tbody = document.getElementById('measurements-table-body');
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-secondary">No body weight or muscle measurements logged yet.</td></tr>';
      return;
    }

    logs.reverse().forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${row.date}</strong></td>
        <td>${row.weight} ${state.user.unit || 'kg'}</td>
        <td>${row.chest ? `${row.chest} cm` : '-'}</td>
        <td>${row.waist ? `${row.waist} cm` : '-'}</td>
        <td>${row.hips ? `${row.hips} cm` : '-'}</td>
        <td>${row.arms ? `${row.arms} cm` : '-'}</td>
        <td>${row.legs ? `${row.legs} cm` : '-'}</td>
        <td class="text-secondary">${escapeHTML(row.notes || '')}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Failed to load measurements log:', e);
  }
}

async function submitMeasurements(e) {
  e.preventDefault();
  const weight = document.getElementById('meas-weight').value;
  const chest = document.getElementById('meas-chest').value;
  const waist = document.getElementById('meas-waist').value;
  const hips = document.getElementById('meas-hips').value;
  const arms = document.getElementById('meas-arms').value;
  const legs = document.getElementById('meas-legs').value;
  const notes = document.getElementById('meas-notes').value;

  try {
    const res = await fetch('/api/measurements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight, chest, waist, hips, arms, legs, notes })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert('Measurements saved successfully!');
    document.getElementById('measurements-overlay').classList.add('hidden');
    document.getElementById('measurements-form').reset();
    
    await loadMeasurementsTable();
  } catch (err) {
    alert(err.message);
  }
}

// ----------------- BACKUP IMPORT & EXPORT -----------------
async function exportDatabase() {
  try {
    const res = await fetch('/api/backup/export');
    const data = await res.json();
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    
    const formattedDate = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("download", `UsFit_Backup_${formattedDate}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (e) {
    alert('Failed to export backup: ' + e.message);
  }
}

async function importDatabase(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Database backup restored successfully! Reloading session settings.');
      location.reload();
    } catch (err) {
      alert('Failed to import database: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function resetDatabaseAll() {
  if (!confirm('Are you sure you want to reset all workout history, schedule setups, and log records to start completely fresh?')) {
    return;
  }

  try {
    const res = await fetch('/api/admin/reset-database', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reset database');

    state.user = null;
    state.schedule = null;
    state.program = null;
    state.activeWorkout = null;

    alert('System reset successfully! You can now log back in and set up a fresh weekly schedule.');
    navigate('login');
  } catch (err) {
    alert('Reset failed: ' + err.message);
  }
}

// ----------------- SVG ILLUSTRATIONS GENERATORS -----------------
// Synthesizes dynamic vector illustration shapes for various workouts on-demand!
function createExerciseInfoSlide(exerciseName, heading, body, footer) {
  const escapeSvg = value => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const wrap = (text, max = 44) => {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach(word => {
      if (`${line} ${word}`.trim().length > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 5);
  };
  const lines = wrap(body);
  const lineMarkup = lines.map((line, index) =>
    `<text x="64" y="${225 + index * 40}" fill="#f6f7ef" font-size="24" font-family="Inter,Arial,sans-serif">${escapeSvg(line)}</text>`
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
    <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#c8f43d"/><stop offset="1" stop-color="#ff7048"/></linearGradient></defs>
    <rect width="960" height="720" rx="32" fill="#11130f"/>
    <rect x="34" y="34" width="892" height="652" rx="24" fill="#171a14" stroke="#343a2c" stroke-width="2"/>
    <rect x="64" y="72" width="94" height="8" rx="4" fill="url(#g)"/>
    <text x="64" y="132" fill="#c8f43d" font-size="22" font-weight="700" font-family="Inter,Arial,sans-serif" letter-spacing="2">${escapeSvg(heading).toUpperCase()}</text>
    <text x="64" y="180" fill="#b1b5a6" font-size="21" font-family="Inter,Arial,sans-serif">${escapeSvg(exerciseName)}</text>
    ${lineMarkup}
    <line x1="64" y1="610" x2="896" y2="610" stroke="#343a2c"/>
    <text x="64" y="654" fill="#b9a7ff" font-size="19" font-family="Inter,Arial,sans-serif">${escapeSvg(footer)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderExerciseSVGVisual(exerciseName, targetContainer, customMedia = null, mediaInfo = null) {
  // Clear any existing animation loops to prevent memory leaks
  if (state.exerciseVisualInterval) {
    clearInterval(state.exerciseVisualInterval);
    state.exerciseVisualInterval = null;
  }

  if (customMedia || mediaInfo) {
    if (Array.isArray(customMedia)) {
      const mediaSlides = customMedia.slice(0, 3);
      const supplementalSlides = [
        createExerciseInfoSlide(exerciseName, 'Setup', mediaInfo && mediaInfo.setup, 'Build a stable starting position before adding load.'),
        createExerciseInfoSlide(exerciseName, 'Movement', mediaInfo && mediaInfo.movement, 'Use a controlled range of motion—never chase weight.'),
        createExerciseInfoSlide(exerciseName, 'Muscle focus', mediaInfo && (mediaInfo.targetMuscles || mediaInfo.cues), mediaInfo && mediaInfo.cues ? `Cue: ${mediaInfo.cues}` : 'Move with control and stop if you feel sharp pain.')
      ];
      while (mediaSlides.length < 3) {
        mediaSlides.push(supplementalSlides[Math.min(mediaSlides.length, supplementalSlides.length - 1)]);
      }
      let idx = 0;
      targetContainer.innerHTML = `
        <div class="exercise-visual-frame">
          <button type="button" class="visual-close-btn" aria-label="Close enlarged image">×</button>
          <img src="${escapeHTML(mediaSlides[0])}" alt="${escapeHTML(exerciseName)} — step 1" class="animated-exercise-image">
          <button type="button" class="visual-arrow visual-arrow-prev" aria-label="Previous exercise step">‹</button>
          <button type="button" class="visual-arrow visual-arrow-next" aria-label="Next exercise step">›</button>
          <div class="visual-footer">
            <span class="visual-step-label">Step 1 of ${mediaSlides.length}</span>
            <span class="visual-hint">Tap image to enlarge</span>
          </div>
          <div class="visual-dots">${mediaSlides.map((_, dotIdx) => `<button type="button" class="visual-dot ${dotIdx === 0 ? 'active' : ''}" aria-label="Show step ${dotIdx + 1}"></button>`).join('')}</div>
        </div>`;
      
      const imgEl = targetContainer.querySelector('img');
      const frameEl = targetContainer.querySelector('.exercise-visual-frame');
      const labelEl = targetContainer.querySelector('.visual-step-label');
      const dots = Array.from(targetContainer.querySelectorAll('.visual-dot'));
      const showImage = (nextIdx) => {
        idx = nextIdx;
        imgEl.style.opacity = 0.75;
        setTimeout(() => {
          imgEl.src = mediaSlides[idx];
          imgEl.alt = `${exerciseName} — step ${idx + 1}`;
          labelEl.textContent = `Step ${idx + 1} of ${mediaSlides.length}`;
          dots.forEach((dot, dotIdx) => dot.classList.toggle('active', dotIdx === idx));
          imgEl.style.opacity = 1;
        }, 100);
      };
      dots.forEach((dot, dotIdx) => dot.addEventListener('click', (event) => {
        event.stopPropagation();
        showImage(dotIdx);
      }));
      targetContainer.querySelector('.visual-arrow-prev').addEventListener('click', (event) => {
        event.stopPropagation();
        showImage((idx - 1 + mediaSlides.length) % mediaSlides.length);
      });
      targetContainer.querySelector('.visual-arrow-next').addEventListener('click', (event) => {
        event.stopPropagation();
        showImage((idx + 1) % mediaSlides.length);
      });
      let touchStartX = 0;
      imgEl.addEventListener('touchstart', event => {
        touchStartX = event.changedTouches[0].clientX;
      }, { passive: true });
      imgEl.addEventListener('touchend', event => {
        const distance = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(distance) > 40) {
          showImage(distance < 0 ? (idx + 1) % mediaSlides.length : (idx - 1 + mediaSlides.length) % mediaSlides.length);
        }
      }, { passive: true });
      imgEl.addEventListener('click', () => frameEl.classList.add('is-expanded'));
      targetContainer.querySelector('.visual-close-btn').addEventListener('click', () => frameEl.classList.remove('is-expanded'));
      return;
    } else if (typeof customMedia === 'string' && (customMedia.endsWith('.png') || customMedia.endsWith('.jpg') || customMedia.startsWith('http'))) {
      targetContainer.innerHTML = `<img src="${escapeHTML(customMedia)}" alt="${escapeHTML(exerciseName)}" style="max-width: 100%; max-height: 240px; border-radius: var(--border-radius-md); object-fit: contain; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">`;
      return;
    }
  }
  const name = exerciseName.toLowerCase();
  let svgCode = '';

  const svgHeader = `<svg viewBox="0 0 200 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#111827;">`;
  const svgFooter = `</svg>`;

  if (name.includes('press') || name.includes('bench')) {
    // Bench press style illustration
    svgCode = `
      <!-- Bench -->
      <rect x="50" y="80" width="100" height="8" rx="2" fill="#374151" />
      <line x1="70" y1="88" x2="70" y2="105" stroke="#374151" stroke-width="6" />
      <line x1="130" y1="88" x2="130" y2="105" stroke="#374151" stroke-width="6" />
      <!-- Rack -->
      <line x1="100" y1="50" x2="100" y2="80" stroke="#1f2937" stroke-width="4" />
      <!-- Humanoid Shape -->
      <circle cx="85" cy="74" r="5" fill="#60a5fa" />
      <line x1="85" y1="79" x2="120" y2="79" stroke="#60a5fa" stroke-width="7" stroke-linecap="round" />
      <!-- Arms lifting barbell -->
      <line x1="100" y1="79" x2="100" y2="45" stroke="#3b82f6" stroke-width="4" stroke-linecap="round" />
      <!-- Barbell -->
      <line x1="60" y1="42" x2="140" y2="42" stroke="#e5e7eb" stroke-width="3" />
      <rect x="52" y="34" width="8" height="16" rx="1" fill="#3b82f6" />
      <rect x="140" y="34" width="8" height="16" rx="1" fill="#3b82f6" />
    `;
  } else if (name.includes('row') || name.includes('pulldown')) {
    // Pulldown back muscle workout
    svgCode = `
      <!-- Pulldown Pulley frame -->
      <line x1="100" y1="20" x2="100" y2="55" stroke="#4b5563" stroke-width="2" />
      <line x1="70" y1="55" x2="130" y2="55" stroke="#9ca3af" stroke-width="4" stroke-linecap="round" />
      <circle cx="100" cy="20" r="4" fill="#374151" />
      <!-- Seat -->
      <rect x="85" y="85" width="30" height="6" rx="1" fill="#1f2937" />
      <line x1="100" y1="91" x2="100" y2="105" stroke="#1f2937" stroke-width="5" />
      <!-- Humanoid seated -->
      <circle cx="100" cy="62" r="5" fill="#34d399" />
      <line x1="100" y1="67" x2="100" y2="85" stroke="#34d399" stroke-width="7" stroke-linecap="round" />
      <!-- Arms grabbing bar -->
      <line x1="100" y1="70" x2="80" y2="55" stroke="#10b981" stroke-width="3" stroke-linecap="round" />
      <line x1="100" y1="70" x2="120" y2="55" stroke="#10b981" stroke-width="3" stroke-linecap="round" />
    `;
  } else if (name.includes('squat')) {
    // Squat visual
    svgCode = `
      <!-- Platform -->
      <line x1="50" y1="105" x2="150" y2="105" stroke="#374151" stroke-width="4" />
      <!-- Squat Rack frame -->
      <line x1="70" y1="35" x2="70" y2="105" stroke="#4b5563" stroke-width="4" />
      <line x1="130" y1="35" x2="130" y2="105" stroke="#4b5563" stroke-width="4" />
      <!-- Humanoid squatting -->
      <circle cx="100" cy="60" r="5" fill="#f87171" />
      <line x1="100" y1="65" x2="100" y2="78" stroke="#f87171" stroke-width="7" stroke-linecap="round" />
      <line x1="100" y1="78" x2="90" y2="92" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
      <line x1="90" y1="92" x2="100" y2="103" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
      <!-- Barbell on back -->
      <line x1="75" y1="63" x2="125" y2="63" stroke="#e5e7eb" stroke-width="3" />
      <rect x="70" y="56" width="6" height="14" rx="1" fill="#ef4444" />
      <rect x="124" y="56" width="6" height="14" rx="1" fill="#ef4444" />
    `;
  } else if (name.includes('treadmill') || name.includes('run') || name.includes('walk')) {
    svgCode = `
      <!-- Treadmill Machine -->
      <line x1="60" y1="95" x2="140" y2="95" stroke="#4b5563" stroke-width="5" stroke-linecap="round" />
      <line x1="140" y1="95" x2="150" y2="65" stroke="#4b5563" stroke-width="4" stroke-linecap="round" />
      <rect x="142" y="58" width="12" height="8" rx="1" fill="#111827" stroke="#9ca3af" stroke-width="1" />
      <!-- Humanoid runner -->
      <circle cx="105" cy="55" r="5" fill="#f59e0b" />
      <line x1="105" y1="60" x2="105" y2="75" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" />
      <!-- Legs motion -->
      <line x1="105" y1="75" x2="92" y2="88" stroke="#d97706" stroke-width="4" stroke-linecap="round" />
      <line x1="105" y1="75" x2="115" y2="92" stroke="#d97706" stroke-width="4" stroke-linecap="round" />
    `;
  } else {
    // Default dumbbell illustration
    svgCode = `
      <!-- Dumbbells symbol -->
      <rect x="94" y="45" width="12" height="30" rx="2" fill="#9ca3af" />
      <line x1="80" y1="60" x2="120" y2="60" stroke="#e5e7eb" stroke-width="5" stroke-linecap="round" />
      <rect x="80" y="50" width="8" height="20" rx="1" fill="#3b82f6" />
      <rect x="112" y="50" width="8" height="20" rx="1" fill="#3b82f6" />
      <text x="100" y="95" fill="#6b7280" font-size="8" font-family="sans-serif" text-anchor="middle">Ready to lift</text>
    `;
  }

  targetContainer.innerHTML = svgHeader + svgCode + svgFooter;
}
