require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET || 'usfit-couples-session-secret-key-2026';

// Trust proxy for secure cookies on Vercel deployment
app.set('trust proxy', 1);

// This is a private two-person app. Gender is tied to the approved account,
// rather than accepted from a browser request where it could be changed.
const accountGenders = {
  'ibright053@gmail.com': 'male',
  'okonmary1502@gmail.com': 'female'
};
const approvedEmails = Object.keys(accountGenders);

console.log('Approved admin emails loaded:', approvedEmails);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions configuration (using cookie-session for serverless deployment on Vercel)
app.use(cookieSession({
  name: 'session',
  keys: [sessionSecret],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  httpOnly: true
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication check middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

function scheduleStatusForUsers(userStatuses) {
  const statuses = Object.values(userStatuses || {});
  if (statuses.length > 0 && statuses.every(status => status === 'Completed')) return 'Completed';
  if (statuses.includes('In progress')) return 'In progress';
  if (statuses.includes('Upcoming')) return 'Upcoming';
  if (statuses.includes('Missed')) return 'Missed';
  if (statuses.includes('Rescheduled')) return 'Rescheduled';
  return 'Planned';
}

function normalizeSchedule(schedule) {
  if (!schedule.currentWeek) return schedule;
  const userIds = Object.values(db.read().users).map(user => user.id);
  const dayOrder = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const orderedDays = Object.entries(schedule.currentWeek.days || {}).sort(([a], [b]) => dayOrder[a] - dayOrder[b]);
  orderedDays.forEach(([, day], index) => {
    if (!day.userStatuses) {
      day.userStatuses = Object.fromEntries(userIds.map(userId => [userId, day.status || 'Planned']));
    } else {
      userIds.forEach(userId => {
        if (!day.userStatuses[userId]) day.userStatuses[userId] = index === 0 ? 'Upcoming' : 'Planned';
      });
    }
    day.status = scheduleStatusForUsers(day.userStatuses);
  });
  return schedule;
}

function scheduleForUser(schedule, userId) {
  const view = JSON.parse(JSON.stringify(normalizeSchedule(schedule)));
  if (!view.currentWeek) return view;
  Object.values(view.currentWeek.days || {}).forEach(day => {
    day.overallStatus = day.status;
    day.status = day.userStatuses[userId] || 'Planned';
  });
  return view;
}

// REST API Routes

// Get registration status for emails
app.get('/api/auth/config', (req, res) => {
  const users = db.read().users;
  const status = approvedEmails.map(email => {
    return {
      email,
      isRegistered: !!users[email]
    };
  });
  res.json({
    status,
    registrationClosed: approvedEmails.length > 0 && status.every(s => s.isRegistered)
  });
});

// Register first-time user (Passwordless)
app.post('/api/auth/register', (req, res) => {
  const { email, displayName } = req.body;
  if (!email || !displayName) {
    return res.status(400).json({ error: 'Email and display name are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate approved list
  if (!approvedEmails.includes(normalizedEmail)) {
    return res.status(403).json({ error: 'This email is not authorized to register.' });
  }

  // Check if already registered
  const existingUser = db.getUser(normalizedEmail);
  if (existingUser) {
    return res.status(400).json({ error: 'This user is already registered.' });
  }

  const userGender = accountGenders[normalizedEmail];
  if (!userGender) {
    return res.status(403).json({ error: 'This account does not have an assigned profile.' });
  }
  const newUser = db.createUser(normalizedEmail, '', displayName.trim(), userGender);

  // Log user in automatically
  req.session.userId = newUser.id;
  req.session.email = newUser.email;
  req.session.displayName = newUser.displayName;

  res.status(201).json({
    message: 'Registration successful',
    user: {
      id: newUser.id,
      email: newUser.email,
      displayName: newUser.displayName,
      gender: newUser.gender,
      unit: newUser.unit
    }
  });
});

// Login (Passwordless)
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  
  if (!approvedEmails.includes(normalizedEmail)) {
    return res.status(403).json({ error: 'This email is not authorized.' });
  }

  const user = db.getUser(normalizedEmail);

  if (!user) {
    // Return flag to client to display the first-time profile setup.
    return res.json({ needsRegistration: true, email: normalizedEmail });
  }


  // Migrate existing profiles to the fixed account assignment on login.
  const assignedGender = accountGenders[normalizedEmail];
  if (user.gender !== assignedGender) {
    user.gender = assignedGender;
    db.updateUser(normalizedEmail, { gender: assignedGender });
  }

  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.displayName = user.displayName;
  
  const currentSched = db.getSchedule();
  if (currentSched && currentSched.currentWeek) {
    req.session.schedule = currentSched;
  }

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      gender: user.gender || 'male',
      unit: user.unit,
      targetHeartRate: user.targetHeartRate,
      defaultRestTime: user.defaultRestTime
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const activeSched = req.session ? req.session.schedule : null;
  req.session = null;
  if (activeSched && activeSched.currentWeek) {
    req.session = { schedule: activeSched };
  }
  res.json({ message: 'Logout successful' });
});

// Current user details
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    const user = db.getUser(req.session.email);
    if (user) {
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          gender: user.gender || 'male',
          unit: user.unit,
          targetHeartRate: user.targetHeartRate,
          defaultRestTime: user.defaultRestTime
        }
      });
    }
  }
  res.json({ user: null });
});

// Update user settings
app.post('/api/user/settings', requireAuth, (req, res) => {
  const { displayName, unit, targetHeartRate, defaultRestTime } = req.body;
  const updates = {};
  if (displayName) updates.displayName = displayName.trim();
  if (unit) updates.unit = unit;
  if (targetHeartRate) updates.targetHeartRate = Number(targetHeartRate);
  if (defaultRestTime) updates.defaultRestTime = Number(defaultRestTime);
  updates.gender = accountGenders[req.session.email] || 'male';

  const updated = db.updateUser(req.session.email, updates);
  if (updated) {
    res.json({
      message: 'Settings updated successfully',
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        gender: updated.gender || 'male',
        unit: updated.unit,
        targetHeartRate: updated.targetHeartRate,
        defaultRestTime: updated.defaultRestTime
      }
    });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// Fetch active users list (for multi-user tracking displays)
app.get('/api/users', requireAuth, (req, res) => {
  const data = db.read();
  const list = Object.values(data.users).map(u => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName
  }));
  res.json(list);
});

// Program templates
app.get('/api/program', requireAuth, (req, res) => {
  const user = db.getUser(req.session.email);
  const gender = user ? user.gender : 'male';
  res.json(db.getProgram(gender));
});

app.post('/api/program', requireAuth, (req, res) => {
  const updatedProgram = req.body;
  if (!updatedProgram || !Array.isArray(updatedProgram.days)) {
    return res.status(400).json({ error: 'Invalid program structure.' });
  }
  const user = db.getUser(req.session.email);
  const gender = user ? user.gender : 'male';
  db.saveProgram(updatedProgram, req.session.userId, req.session.displayName, gender);
  res.json({ message: 'Program updated successfully', program: updatedProgram });
});

app.post('/api/program/reset', requireAuth, (req, res) => {
  const user = db.getUser(req.session.email);
  const gender = user ? user.gender : 'male';
  const reset = db.resetProgram(req.session.userId, req.session.displayName, gender);
  res.json({ message: 'Program reset to default template', program: reset });
});

// Schedule endpoints
app.get('/api/schedule', requireAuth, (req, res) => {
  let schedule = db.getSchedule();
  if ((!schedule || !schedule.currentWeek) && req.session && req.session.schedule && req.session.schedule.currentWeek) {
    schedule = req.session.schedule;
    db.saveSchedule(schedule);
  }
  schedule = normalizeSchedule(schedule);
  if (req.session) req.session.schedule = schedule;
  res.json(scheduleForUser(schedule, req.session.userId));
});

// Setup weekly days & validate recovery spacing
app.post('/api/schedule/setup', requireAuth, (req, res) => {
  const { weekId, daysMapping } = req.body; // e.g. weekId: "2026-W30", daysMapping: { "Monday": "day_1", "Wednesday": "day_2", "Saturday": "day_3" }
  
  if (!weekId || !daysMapping || typeof daysMapping !== 'object') {
    return res.status(400).json({ error: 'Week ID and days mapping are required.' });
  }

  const daysList = Object.keys(daysMapping);
  if (daysList.length !== 3) {
    return res.status(400).json({ error: 'You must select exactly 3 training days.' });
  }

  const validDays = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  if (daysList.some(day => !validDays.has(day))) {
    return res.status(400).json({ error: 'One or more training days are invalid.' });
  }

  // Spacing warning calculation
  // Days of the week mapping to indexes to calculate distance
  const dayIndex = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6
  };

  const sortedDays = daysList.sort((a, b) => dayIndex[a] - dayIndex[b]);
  const warnings = [];

  // Check distances
  for (let i = 0; i < sortedDays.length; i++) {
    const d1 = sortedDays[i];
    const d2 = sortedDays[(i + 1) % sortedDays.length];
    let diff = dayIndex[d2] - dayIndex[d1];
    if (diff < 0) diff += 7; // wrap around week

    if (diff === 1) {
      warnings.push(`Consecutive days detected: ${d1} and ${d2}. We recommend leaving at least one recovery day between sessions.`);
    }
  }

  const schedule = db.getSchedule();
  schedule.currentWeekId = weekId;
  schedule.currentWeek = {
    weekId,
    days: {},
    completed: false,
    createdAt: new Date().toISOString()
  };

  // Build the day-based schedule structure
  // We preserve Day 1, 2, 3 sequence
  // Order of completion will be tracked: day_1 -> day_2 -> day_3
  const seqMap = ['day_1', 'day_2', 'day_3'];
  const userIds = Object.values(db.read().users).map(user => user.id);
  sortedDays.forEach((day, index) => {
    schedule.currentWeek.days[day] = {
      workoutId: seqMap[index],
      status: 'Planned', // Planned, Upcoming, In progress, Completed, Missed, Rescheduled
      userStatuses: Object.fromEntries(userIds.map(userId => [userId, index === 0 ? 'Upcoming' : 'Planned'])),
      rescheduledTo: null
    };
  });

  // Mark the first chronologically as 'Upcoming' instead of 'Planned' to guide flow
  const firstDay = sortedDays[0];
  schedule.currentWeek.days[firstDay].status = 'Upcoming';

  db.saveSchedule(schedule);
  if (req.session) req.session.schedule = schedule;
  res.json({ message: 'Week scheduled successfully', schedule: scheduleForUser(schedule, req.session.userId), warnings });
});

// Update day status (reschedule, skip, etc.)
app.post('/api/schedule/update-day', requireAuth, (req, res) => {
  const { dayName, status, rescheduledTo } = req.body;
  const schedule = normalizeSchedule(db.getSchedule());

  const allowedStatuses = new Set(['Planned', 'Upcoming', 'In progress', 'Completed', 'Missed', 'Rescheduled']);
  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'Invalid schedule status.' });
  }

  if (!schedule.currentWeek || !schedule.currentWeek.days[dayName]) {
    return res.status(404).json({ error: 'Day not found in current week schedule.' });
  }

  const daySchedule = schedule.currentWeek.days[dayName];
  daySchedule.userStatuses[req.session.userId] = status;
  daySchedule.status = scheduleStatusForUsers(daySchedule.userStatuses);
  if (rescheduledTo) {
    daySchedule.rescheduledTo = rescheduledTo;
    
    // Add the rescheduled day to the schedule if it doesn't exist
    if (!schedule.currentWeek.days[rescheduledTo]) {
      const userIds = Object.values(db.read().users).map(user => user.id);
      schedule.currentWeek.days[rescheduledTo] = {
        workoutId: daySchedule.workoutId,
        status: 'Upcoming',
        userStatuses: Object.fromEntries(userIds.map(userId => [userId, userId === req.session.userId ? 'Upcoming' : 'Planned'])),
        rescheduledTo: null
      };
    }
  }

  db.saveSchedule(normalizeSchedule(schedule));
  if (req.session) req.session.schedule = schedule;
  res.json({ message: `Status updated for ${dayName} to ${status}`, schedule: scheduleForUser(schedule, req.session.userId) });
});

// Complete Week
app.post('/api/schedule/complete-week', requireAuth, (req, res) => {
  const schedule = normalizeSchedule(db.getSchedule());
  if (!schedule.currentWeek) {
    return res.status(400).json({ error: 'No active week to complete.' });
  }

  // Assert all 3 are completed
  const days = schedule.currentWeek.days;
  const allCompleted = Object.values(days).every(day =>
    Object.values(day.userStatuses || {}).length > 0 &&
    Object.values(day.userStatuses).every(status => status === 'Completed')
  );
  
  if (!allCompleted) {
    return res.status(400).json({ error: 'Both accounts must complete all scheduled sessions before saving the week.' });
  }

  schedule.currentWeek.completed = true;
  schedule.currentWeek.completedAt = new Date().toISOString();
  schedule.completedWeeks.push(schedule.currentWeek);

  // Clear current active week for the next week setup
  schedule.currentWeek = null;
  schedule.currentWeekId = null;

  db.saveSchedule(schedule);
  res.json({ message: 'Week completed successfully! The next week can now be planned.', schedule: scheduleForUser(schedule, req.session.userId) });
});

// Progression suggestions calculator endpoint
app.get('/api/workout/recommendations/:dayId', requireAuth, (req, res) => {
  const { dayId } = req.params;
  const currentUser = db.getUser(req.session.email);
  const program = db.getProgram(currentUser ? currentUser.gender : 'male');
  const workout = program.days.find(d => d.id === dayId);
  if (!workout) {
    return res.status(404).json({ error: 'Workout program day not found.' });
  }

  const users = currentUser ? [currentUser] : [];
  const recommendations = {};

  users.forEach(user => {
    const userId = user.id;
    const latestWorkout = db.getLatestWorkout(dayId, userId);
    recommendations[userId] = {};

    workout.exercises.forEach(ex => {
      recommendations[userId][ex.id] = getProgressionRecommendation(ex, latestWorkout, userId);
    });
  });

  res.json(recommendations);
});

// Durable in-progress workout recovery, scoped to the logged-in account.
app.get('/api/workout/active', requireAuth, (req, res) => {
  res.json({ activeWorkout: db.getActiveSession(req.session.userId) });
});

app.post('/api/workout/active', requireAuth, (req, res) => {
  const activeWorkout = req.body && req.body.activeWorkout;
  if (!activeWorkout || typeof activeWorkout !== 'object' || !activeWorkout.workoutId || !activeWorkout.phase) {
    return res.status(400).json({ error: 'Invalid active workout session.' });
  }

  const allowedPhases = new Set(['treadmill', 'strength', 'stretching', 'summary']);
  if (!allowedPhases.has(activeWorkout.phase)) {
    return res.status(400).json({ error: 'Invalid workout phase.' });
  }

  const saved = db.saveActiveSession(req.session.userId, activeWorkout);
  res.json({ message: 'Active workout saved.', savedAt: saved.savedAt });
});

app.delete('/api/workout/active', requireAuth, (req, res) => {
  db.clearActiveSession(req.session.userId);
  res.json({ message: 'Active workout cleared.' });
});
// Logic helper for progression recommendations
function getProgressionRecommendation(exercise, latestWorkout, userId) {
  // If no history, suggest conservative default starting weight
  if (!latestWorkout || !latestWorkout.logs || !latestWorkout.logs[userId]) {
    const startW = exercise.defaultStartWeight !== undefined ? exercise.defaultStartWeight : null;
    return {
      weight: startW,
      reps: exercise.repRangeMin,
      notes: startW !== null ? `Starting set: We suggest starting soft at ${startW}kg. Keep it comfortable.` : "Starting set: Pick a conservative weight.",
      action: "start"
    };
  }

  const userLogs = latestWorkout.logs[userId][exercise.id];
  if (!userLogs || !Array.isArray(userLogs) || userLogs.length === 0) {
    const startW = exercise.defaultStartWeight !== undefined ? exercise.defaultStartWeight : 0;
    return {
      weight: startW,
      reps: exercise.repRangeMin,
      notes: startW > 0
        ? `Starting set: No previous data for this exercise yet. Begin at ${startW}kg.`
        : "Starting set: Begin with bodyweight and focus on controlled form.",
      action: "start"
    };
  }

  // Check if pain or discomfort was logged
  const painLogged = userLogs.some(set => set.pain && Number(set.pain) > 3);
  if (painLogged) {
    // Deload or maintain weight due to pain
    const minWeight = Math.min(...userLogs.map(s => s.weight || 0));
    const deloadWeight = Math.max(0, Math.round((minWeight * 0.8) * 4) / 4); // reduce by 20%, round to nearest 0.25
    return {
      weight: deloadWeight,
      reps: exercise.repRangeMin,
      notes: "Deload alert: Pain was reported in the previous session. Suggested 20% weight reduction.",
      action: "deload"
    };
  }

  // Check performance
  // Targets
  const targetMin = exercise.repRangeMin;
  const targetMax = exercise.repRangeMax;
  const targetSets = exercise.setsCount;

  // Actual logs
  const completedSets = userLogs.filter(set => set.completed);
  
  if (completedSets.length < targetSets) {
    // Did not complete all working sets
    const avgWeight = userLogs.reduce((acc, s) => acc + (s.weight || 0), 0) / userLogs.length;
    return {
      weight: Math.round(avgWeight * 4) / 4,
      reps: targetMin,
      notes: "Maintain: Focus on completing all target sets with clean form.",
      action: "maintain"
    };
  }

  // All sets completed, check repetition ranges
  const weights = completedSets.map(s => s.weight || 0);
  const reps = completedSets.map(s => s.reps || 0);

  const allReachedMax = reps.every(r => r >= targetMax);
  const someBelowMin = reps.some(r => r < targetMin);

  // If weights are mixed, use the first/representative working weight
  const primaryWeight = weights[0];

  if (allReachedMax) {
    // Perfect sets! Suggest increase.
    // 2.5kg increase is standard
    const newWeight = primaryWeight + 2.5;
    return {
      weight: newWeight,
      reps: targetMin,
      notes: `Progress! You hit max reps (${targetMax}) on all sets. Increase weight to ${newWeight} and aim for ${targetMin} reps.`,
      action: "increase"
    };
  } else if (someBelowMin) {
    // Performance dropped below min reps
    const newWeight = Math.max(0, primaryWeight - 2.5);
    return {
      weight: newWeight,
      reps: targetMin,
      notes: `Reduce weight: Several sets fell below target reps (${targetMin}). Try reducing weight to ${newWeight} for safety.`,
      action: "decrease"
    };
  } else {
    // Partial success (e.g. 12, 10, 9 reps at 30kg)
    return {
      weight: primaryWeight,
      reps: targetMax,
      notes: `Maintain: Keep ${primaryWeight} and aim to hit the max repetitions (${targetMax}) on all sets.`,
      action: "maintain"
    };
  }
}

// Complete and Save Workout Log
app.post('/api/workout/complete', requireAuth, (req, res) => {
  const {
    workoutId,
    scheduledDayName, // e.g. "Monday"
    startTime,
    endTime,
    logs, // { userId: { exerciseId: [{ setIndex, weight, reps, completed, difficulty, notes, pain }] } }
    treadmillData, // { userId: { duration, distance, avgSpeed, maxSpeed, incline, hr, calories, difficulty, notes } }
    stretchData, // { userId: { completed, skippedReason } }
    readinessScores, // { userId: rating }
    difficultyScores, // { userId: rating }
    sessionNotes
  } = req.body;

  if (!workoutId || !logs) {
    return res.status(400).json({ error: 'Workout ID and completion logs are required.' });
  }

  if (!logs[req.session.userId]) {
    return res.status(400).json({ error: 'Workout logs must belong to the logged-in account.' });
  }

  const ownOnly = collection => collection && collection[req.session.userId] !== undefined
    ? { [req.session.userId]: collection[req.session.userId] }
    : {};

  // Create clean log structure
  const workoutLog = {
    workoutId,
    scheduledDayName,
    startTime,
    endTime,
    durationMinutes: Math.round((new Date(endTime) - new Date(startTime)) / (1000 * 60)),
    logs: ownOnly(logs),
    treadmillData: ownOnly(treadmillData),
    stretchData: ownOnly(stretchData),
    readinessScores: ownOnly(readinessScores),
    difficultyScores: ownOnly(difficultyScores),
    sessionNotes,
    completedByUserId: req.session.userId,
    completedByUsername: req.session.displayName
  };

  const saved = db.addWorkoutToHistory(workoutLog);
  db.clearActiveSession(req.session.userId);

  // Update schedule status for today's day to Completed
  if (scheduledDayName) {
    const schedule = normalizeSchedule(db.getSchedule());
    if (schedule.currentWeek && schedule.currentWeek.days[scheduledDayName]) {
      const completedDay = schedule.currentWeek.days[scheduledDayName];
      completedDay.userStatuses[req.session.userId] = 'Completed';
      completedDay.status = scheduleStatusForUsers(completedDay.userStatuses);
      
      // Auto-unlock next day as 'Upcoming' if it exists and is currently 'Planned'
      const daysOfCurrentWeek = Object.keys(schedule.currentWeek.days);
      const dayIndex = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6
      };
      const sortedDays = daysOfCurrentWeek.sort((a, b) => dayIndex[a] - dayIndex[b]);
      const currentIdx = sortedDays.indexOf(scheduledDayName);
      if (currentIdx !== -1 && currentIdx < sortedDays.length - 1) {
        const nextDay = sortedDays[currentIdx + 1];
        const nextDaySchedule = schedule.currentWeek.days[nextDay];
        if (nextDaySchedule.userStatuses[req.session.userId] === 'Planned') {
          nextDaySchedule.userStatuses[req.session.userId] = 'Upcoming';
          nextDaySchedule.status = scheduleStatusForUsers(nextDaySchedule.userStatuses);
        }
      }

      db.saveSchedule(schedule);
    }
  }

  res.json({ message: 'Workout logged successfully!', workoutLog });
});

// Analytics & Reports API
app.get('/api/analytics', requireAuth, (req, res) => {
  const history = db.getHistory();
  const users = Object.values(db.read().users);

  // Basic stats per user
  const stats = {};
  users.forEach(user => {
    const userId = user.id;
    const userWorkouts = history.filter(w => w.logs && w.logs[userId]);
    
    // Exercise volume and PRs
    const prs = {}; // { exerciseId: maxWeight }
    let totalSets = 0;
    let totalReps = 0;
    let totalVolume = 0;
    let totalTreadmillDist = 0;
    let totalTreadmillCal = 0;

    userWorkouts.forEach(w => {
      // Calculate workout logs
      const exLogs = w.logs[userId] || {};
      Object.keys(exLogs).forEach(exId => {
        const sets = exLogs[exId] || [];
        sets.forEach(s => {
          if (s.completed) {
            totalSets++;
            totalReps += (s.reps || 0);
            totalVolume += (s.weight || 0) * (s.reps || 0);

            if (!prs[exId] || s.weight > prs[exId]) {
              prs[exId] = s.weight;
            }
          }
        });
      });

      // Calculate treadmill
      const tm = w.treadmillData && w.treadmillData[userId];
      if (tm) {
        totalTreadmillDist += Number(tm.distance || 0);
        totalTreadmillCal += Number(tm.calories || 0);
      }
    });

    stats[userId] = {
      userId,
      displayName: user.displayName,
      completedCount: userWorkouts.length,
      totalSets,
      totalReps,
      totalVolume,
      totalTreadmillDistance: Math.round(totalTreadmillDist * 100) / 100,
      totalTreadmillCalories: Math.round(totalTreadmillCal),
      prs
    };
  });

  // Timeline list for plotting graphs
  const timeline = history.map(w => {
    const record = {
      id: w.id,
      date: w.endTime.split('T')[0],
      dayName: w.scheduledDayName,
      workoutId: w.workoutId,
      users: {}
    };

    users.forEach(user => {
      const userId = user.id;
      if (w.logs && w.logs[userId]) {
        let volume = 0;
        const exLogs = w.logs[userId] || {};
        Object.keys(exLogs).forEach(exId => {
          (exLogs[exId] || []).forEach(s => {
            if (s.completed) {
              volume += (s.weight || 0) * (s.reps || 0);
            }
          });
        });

        const tm = w.treadmillData && w.treadmillData[userId];
        record.users[userId] = {
          volume,
          treadmillDistance: tm ? Number(tm.distance || 0) : 0,
          treadmillSpeed: tm ? Number(tm.avgSpeed || 0) : 0,
          readiness: w.readinessScores ? Number(w.readinessScores[userId] || 0) : 0,
          difficulty: w.difficultyScores ? Number(w.difficultyScores[userId] || 0) : 0
        };
      }
    });

    return record;
  });

  res.json({ stats, timeline });
});

// Body Measurements Endpoints
app.get('/api/measurements', requireAuth, (req, res) => {
  res.json(db.getMeasurements(req.session.userId));
});

app.post('/api/measurements', requireAuth, (req, res) => {
  const { weight, chest, waist, hips, arms, legs, notes } = req.body;
  if (!weight) {
    return res.status(400).json({ error: 'Weight is required.' });
  }

  const measurement = db.addMeasurement({
    userId: req.session.userId,
    date: new Date().toISOString().split('T')[0],
    weight: Number(weight),
    chest: chest ? Number(chest) : null,
    waist: waist ? Number(waist) : null,
    hips: hips ? Number(hips) : null,
    arms: arms ? Number(arms) : null,
    legs: legs ? Number(legs) : null,
    notes: notes || ''
  });

  res.status(201).json({ message: 'Measurements logged successfully', measurement });
});

// Backup Export
app.get('/api/backup/export', requireAuth, (req, res) => {
  res.json(db.read());
});

// Backup Import
app.post('/api/backup/import', requireAuth, (req, res) => {
  const importedData = req.body;
  const hasPrograms = importedData &&
    (importedData.program || importedData.program_male) &&
    (importedData.program || importedData.program_female);
  const validCollections = importedData &&
    importedData.users && typeof importedData.users === 'object' && !Array.isArray(importedData.users) &&
    Array.isArray(importedData.history) &&
    Array.isArray(importedData.measurements) &&
    Array.isArray(importedData.changelog);

  if (!hasPrograms || !validCollections) {
    return res.status(400).json({ error: 'Invalid backup database file.' });
  }

  const programs = [importedData.program_male || importedData.program, importedData.program_female || importedData.program];
  if (programs.some(program => !program || !Array.isArray(program.days))) {
    return res.status(400).json({ error: 'Invalid workout program in backup file.' });
  }

  try {
    // Keep a backup of current database in database.bak before overwriting
    const dbFile = path.join(__dirname, 'data', 'database.json');
    if (fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, dbFile + '.bak');
    }

    db.write(importedData);
    res.json({ message: 'Database imported successfully and system updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write imported database: ' + err.message });
  }
});

// Reset Database to Fresh Start State
app.post('/api/admin/reset-database', requireAuth, (req, res) => {
  try {
    db.resetAllData();
    req.session = null;
    res.json({ message: 'Database and accounts successfully reset to a fresh start state.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset database: ' + err.message });
  }
});

// Changelog Endpoint
app.get('/api/changelog', requireAuth, (req, res) => {
  res.json(db.getChangelog());
});

// Server boot-up
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`UsFit couples gym server running on http://localhost:${PORT}`);
  });
}

app.getProgressionRecommendation = getProgressionRecommendation;
app.accountGenders = accountGenders;

module.exports = app;
