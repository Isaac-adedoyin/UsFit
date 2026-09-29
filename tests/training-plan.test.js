const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.USFIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'usfit-plan-'));
const db = require('../db');
const { VERSION } = require('../training-plan');
test('both plans fit three sessions with bounded volume, sources, and an eight-minute warm-up', () => {
  for (const gender of ['male','female']) {
    const program = db.getProgram(gender);
    assert.equal(program.planVersion, VERSION);
    assert.equal(program.days.length, 3);
    for (const day of program.days) {
      assert.equal(day.treadmill.reduce((n,s) => n+s.duration,0), 8);
      assert.ok(day.exercises.reduce((n,e) => n+e.setsCount,0) <= 22);
      assert.equal(new Set(day.exercises.map(e=>e.id)).size, day.exercises.length);
      for (const ex of day.exercises) {
        assert.ok(ex.source.url.startsWith('https://www.strengthlog.com/'));
        assert.equal(ex.media.length, 0, 'generated pictures must not be shown as verified instruction');
        assert.ok(ex.instructions.setup && ex.instructions.movement);
        assert.ok(ex.restSeconds >= 60);
        assert.ok(ex.repRangeMin <= ex.repRangeMax);
        if (ex.name.includes('Plank')) assert.equal(ex.isTimed, true);
        for (const alt of ex.alternativeExercises) {
          assert.notEqual(alt.id, ex.id);
          assert.notEqual(alt.instructions.movement, ex.instructions.movement);
          assert.ok(alt.source.url);
        }
      }
    }
  }
});
test('priority muscles are repeated across the week and each plan retains balance', () => {
  const male = db.getProgram('male');
  assert.equal(male.days.filter(d=>d.exercises.some(e=>e.name==='Barbell Curl')).length,2);
  assert.equal(male.days.filter(d=>d.exercises.some(e=>e.name==='Machine Lateral Raise')).length,2);
  assert.ok(male.days[1].exercises.some(e=>e.name==='Hack Squat'));
  const female = db.getProgram('female');
  assert.equal(female.days.filter(d=>d.exercises.some(e=>e.name==='Hip Thrust')).length,2);
  assert.ok(female.days[1].exercises.some(e=>e.name==='Machine Chest Press'));
});
test('install is idempotent and does not clear user history or accounts', () => {
  const data = db.read();
  const usersBefore = JSON.stringify(data.users);
  data.program_male.planVersion = 'old';
  data.history.push({ workoutId:'day_1', logs:{usr_isaac:{}}, startTime:'2026-09-01T10:00:00Z' });
  assert.equal(db.installGoalPlans(),true);
  assert.equal(db.read().history.length,1);
  assert.equal(JSON.stringify(db.read().users),usersBefore);
  assert.ok(db.read().previousTrainingPrograms);
  assert.equal(db.installGoalPlans(),false);
});
