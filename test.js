const fs = require('fs');
const path = require('path');
const db = require('./db');
const { getProgressionRecommendation, accountGenders } = require('./server');

// Run automatic tests
console.log('--- Starting UsFit Backend Test Suite ---');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');
const DB_BACKUP = path.join(DB_DIR, 'database.json.testbackup');

// Backup active db if any
if (fs.existsSync(DB_FILE)) {
  fs.copyFileSync(DB_FILE, DB_BACKUP);
  fs.unlinkSync(DB_FILE);
}

try {
  // 1. Database Init & Seeding test
  const initialData = db.read();
  console.log('✓ Database initialized and default program seeded successfully.');
  
  if (initialData.program_male.days.length !== 3) {
    throw new Error('Default program should contain exactly 3 training days.');
  }
  console.log('✓ Base program contains exactly 3 days.');

  // 2. User Authentication tests
  const testEmail = 'user1@example.com';
  const testHash = '$2a$10$xyz'; // mocked hash
  const name = 'David';
  
  const createdUser = db.createUser(testEmail, testHash, name, 'female');
  if (createdUser.email !== testEmail || createdUser.displayName !== name) {
    throw new Error('User creation fields do not match.');
  }
  console.log('✓ User created successfully with values:', createdUser.email, createdUser.displayName);

  const fetchedUser = db.getUser(testEmail);
  if (!fetchedUser || fetchedUser.id !== createdUser.id) {
    throw new Error('Failed to retrieve user by email.');
  }
  console.log('✓ User fetched successfully by email.');

  if (createdUser.gender !== 'female') {
    throw new Error('User gender was not persisted.');
  }
  console.log('✓ User gender is persisted correctly.');

  if (accountGenders['ibright053@gmail.com'] !== 'male' || accountGenders['okonmary1502@gmail.com'] !== 'female') {
    throw new Error('Private account gender mapping is incorrect.');
  }
  console.log('✓ Private account gender mapping is correct.');

  const emptySchedule = db.getSchedule();
  if (!emptySchedule || !Array.isArray(emptySchedule.completedWeeks)) {
    throw new Error('Empty schedule did not return a usable structure.');
  }
  console.log('✓ Empty schedule is safe for first-time weekly setup.');

  const savedActive = db.saveActiveSession(createdUser.id, {
    workoutId: 'day_1',
    phase: 'strength',
    currentExerciseIdx: 2,
    logs: {}
  });
  if (!savedActive.savedAt || db.getActiveSession(createdUser.id).currentExerciseIdx !== 2) {
    throw new Error('Active workout session was not persisted.');
  }
  db.clearActiveSession(createdUser.id);
  if (db.getActiveSession(createdUser.id) !== null) {
    throw new Error('Active workout session was not cleared.');
  }
  console.log('✓ Active workout save, restore, and clear operations passed.');

  for (const gender of ['male', 'female']) {
    const program = db.getProgram(gender);
    for (const day of program.days) {
      for (const exercise of day.exercises) {
        for (const mediaPath of exercise.media || []) {
          const localPath = path.join(__dirname, 'public', mediaPath.replace(/^\//, ''));
          if (!fs.existsSync(localPath)) {
            throw new Error(`Missing ${gender} exercise media: ${exercise.name} -> ${mediaPath}`);
          }
        }
      }
    }
  }
  console.log('✓ All configured male and female exercise images exist locally.');

  // 3. Weekly schedule spacing test helper
  const calculateSpacingWarnings = (daysList) => {
    const dayIndex = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6 };
    const sortedDays = daysList.sort((a, b) => dayIndex[a] - dayIndex[b]);
    const warnings = [];
    for (let i = 0; i < sortedDays.length; i++) {
      const d1 = sortedDays[i];
      const d2 = sortedDays[(i + 1) % sortedDays.length];
      let diff = dayIndex[d2] - dayIndex[d1];
      if (diff < 0) diff += 7;
      if (diff === 1) {
        warnings.push(`Consecutive: ${d1} and ${d2}`);
      }
    }
    return warnings;
  };

  const warnings1 = calculateSpacingWarnings(['Monday', 'Wednesday', 'Saturday']);
  if (warnings1.length !== 0) throw new Error('Spacing warnings triggered for correct recovery days.');
  console.log('✓ Correct recovery spacing verified (no warnings).');

  const warnings2 = calculateSpacingWarnings(['Monday', 'Tuesday', 'Thursday']);
  if (warnings2.length === 0 || !warnings2[0].includes('Monday and Tuesday')) {
    throw new Error('Consecutive day spacing warning failed to trigger.');
  }
  console.log('✓ Consecutive spacing warning triggered correctly:', warnings2[0]);

  // 4. Progression suggestions algorithm tests
  // Progression Logic under test:
  function runProgressionTest(exercise, userLogs) {
    const targetMin = exercise.repRangeMin;
    const targetMax = exercise.repRangeMax;
    const targetSets = exercise.setsCount;

    if (!userLogs || userLogs.length === 0) {
      return { weight: null, reps: targetMin, action: "start" };
    }

    const painLogged = userLogs.some(set => set.pain && Number(set.pain) > 3);
    if (painLogged) {
      const minWeight = Math.min(...userLogs.map(s => s.weight || 0));
      const deloadWeight = Math.max(0, Math.round((minWeight * 0.8) * 4) / 4);
      return { weight: deloadWeight, reps: targetMin, action: "deload" };
    }

    const completedSets = userLogs.filter(set => set.completed);
    if (completedSets.length < targetSets) {
      const avgWeight = userLogs.reduce((acc, s) => acc + (s.weight || 0), 0) / userLogs.length;
      return { weight: Math.round(avgWeight * 4) / 4, reps: targetMin, action: "maintain" };
    }

    const weights = completedSets.map(s => s.weight || 0);
    const reps = completedSets.map(s => s.reps || 0);
    const allReachedMax = reps.every(r => r >= targetMax);
    const someBelowMin = reps.some(r => r < targetMin);
    const primaryWeight = weights[0];

    if (allReachedMax) {
      return { weight: primaryWeight + 2.5, reps: targetMin, action: "increase" };
    } else if (someBelowMin) {
      return { weight: Math.max(0, primaryWeight - 2.5), reps: targetMin, action: "decrease" };
    } else {
      return { weight: primaryWeight, reps: targetMax, action: "maintain" };
    }
  }

  const mockExercise = { id: 'exercise_1', setsCount: 3, repRangeMin: 8, repRangeMax: 12 };

  // Case A: Perfect sets (Progress!)
  const logsPerfect = [
    { weight: 30, reps: 12, completed: true, pain: 0 },
    { weight: 30, reps: 12, completed: true, pain: 0 },
    { weight: 30, reps: 12, completed: true, pain: 0 }
  ];
  const recA = runProgressionTest(mockExercise, logsPerfect);
  if (recA.weight !== 32.5 || recA.action !== 'increase') {
    throw new Error(`Case A failed: Expected 32.5kg increase, got ${recA.weight} (${recA.action})`);
  }
  console.log('✓ Progression Suggestion Case A (Perfect sets -> Weight Increase) passed.');

  // Case B: Partial success (Maintain weight, hit targets)
  const logsPartial = [
    { weight: 30, reps: 12, completed: true, pain: 0 },
    { weight: 30, reps: 10, completed: true, pain: 0 },
    { weight: 30, reps: 9, completed: true, pain: 0 }
  ];
  const recB = runProgressionTest(mockExercise, logsPartial);
  if (recB.weight !== 30 || recB.action !== 'maintain' || recB.reps !== 12) {
    throw new Error(`Case B failed: Expected 30kg maintain with target 12 reps, got ${recB.weight} (${recB.action})`);
  }
  console.log('✓ Progression Suggestion Case B (Partial success -> Maintain Weight, improve reps) passed.');

  // Case C: Under performing (Reduce weight)
  const logsUnder = [
    { weight: 30, reps: 7, completed: true, pain: 0 },
    { weight: 30, reps: 6, completed: true, pain: 0 },
    { weight: 30, reps: 5, completed: true, pain: 0 }
  ];
  const recC = runProgressionTest(mockExercise, logsUnder);
  if (recC.weight !== 27.5 || recC.action !== 'decrease') {
    throw new Error(`Case C failed: Expected 27.5kg decrease, got ${recC.weight} (${recC.action})`);
  }
  console.log('✓ Progression Suggestion Case C (Below minimum reps -> Weight Decrease) passed.');

  // Case D: Joint/Muscle Pain logged (Deload weight)
  const logsPain = [
    { weight: 30, reps: 12, completed: true, pain: 0 },
    { weight: 30, reps: 12, completed: true, pain: 4 }, // pain logged
    { weight: 30, reps: 11, completed: true, pain: 0 }
  ];
  const recD = runProgressionTest(mockExercise, logsPain);
  if (recD.weight !== 24 || recD.action !== 'deload') {
    // 30 * 0.8 = 24kg
    throw new Error(`Case D failed: Expected 24kg deload (20%), got ${recD.weight} (${recD.action})`);
  }
  console.log('✓ Progression Suggestion Case D (Pain logged -> Deload weight 20%) passed.');

  const productionRec = getProgressionRecommendation(
    mockExercise,
    { logs: { user_1: { exercise_1: logsPerfect } } },
    'user_1'
  );
  if (productionRec.weight !== 32.5 || productionRec.action !== 'increase') {
    throw new Error('Production progression helper does not match expected behavior.');
  }
  console.log('✓ Production progression helper is covered directly.');

  const noExerciseHistoryRec = getProgressionRecommendation(
    { ...mockExercise, defaultStartWeight: 12.5 },
    { logs: { user_1: {} } },
    'user_1'
  );
  if (noExerciseHistoryRec.weight !== 12.5 || noExerciseHistoryRec.action !== 'start') {
    throw new Error('Missing exercise history did not fall back to the configured starting weight.');
  }
  console.log('✓ Empty exercise history falls back to its configured starting weight.');

  console.log('\n--- ALL TEST CASES COMPLETED SUCCESSFULLY ---');

} catch (err) {
  console.error('\n❌ TEST SUITE ENCOUNTERED A FAILURE:');
  console.error(err);
  process.exit(1);
} finally {
  // Restore original database
  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
  if (fs.existsSync(DB_BACKUP)) {
    fs.copyFileSync(DB_BACKUP, DB_FILE);
    fs.unlinkSync(DB_BACKUP);
  }
}
