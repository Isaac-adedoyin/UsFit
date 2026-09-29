const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.USFIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'usfit-api-'));
process.env.USFIT_PASSPHRASE = 'test-only-private-passphrase';
const app = require('../server');
const db = require('../db');
let server, base, cookie;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
async function request(route, body, authenticated = true) {
  return fetch(base + route, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', ...(authenticated && cookie ? { Cookie: cookie } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('private config does not expose account emails and history requires sign-in', async () => {
  const response = await request('/api/auth/config');
  assert.deepEqual(await response.json(), { passphraseRequired: true });
  assert.equal((await request('/api/history', null, false)).status, 401);
});
test('passphrase protection and approved sign-in', async () => {
  const email = Object.keys(app.accountGenders)[0];
  assert.equal((await request('/api/auth/login', { email })).status, 401);
  const response = await request('/api/auth/login', { email, passphrase: process.env.USFIT_PASSPHRASE });
  assert.equal(response.status, 200);
  cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
});
test('completion retries are idempotent and invalid dates are rejected', async () => {
  const user = db.getUser(Object.keys(app.accountGenders)[0]);
  const body = { workoutId: 'day_1', startTime: '2026-09-30T08:00:00Z', endTime: '2026-09-30T09:00:00Z', logs: { [user.id]: { ex_1_1: [{ completed: true, reps: 10, weight: 20 }] } }, sessionNotes: 'Great session' };
  assert.equal((await request('/api/workout/complete', { ...body, startTime: 'bad-date' })).status, 400);
  assert.equal((await request('/api/workout/complete', body)).status, 200);
  assert.equal((await request('/api/workout/complete', body)).status, 200);
  const response = await request('/api/history');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const history = await response.json();
  assert.equal(history.length, 1);
  assert.equal(history[0].sessionNotes, 'Great session');
  assert.ok(history[0].workoutName);
  assert.ok(Object.keys(history[0].exerciseNames).length > 0);
});

test('Mary and Isaac receive distinct programs and cannot save each other’s sets', async () => {
  const isaacCookie = cookie;
  const maryEmail = Object.keys(app.accountGenders).find(email => app.accountGenders[email] === 'female');
  const login = await request('/api/auth/login', { email: maryEmail, passphrase: process.env.USFIT_PASSPHRASE });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const mary = (await login.json()).user;
  const maryProgram = await (await request('/api/program')).json();
  assert.match(maryProgram.days[0].name, /Glutes/);
  assert.equal(maryProgram.days[1].exercises.find(e=>e.name==='Barbell Curl').setsCount,2);
  const isaac = db.getUser(Object.keys(app.accountGenders).find(email=>app.accountGenders[email]==='male'));
  const mismatch = await fetch(base+'/api/program', {headers:{Cookie:cookie,'X-Usfit-User':isaac.id}});
  assert.equal(mismatch.status,409);
  assert.equal((await mismatch.json()).code,'ACCOUNT_CHANGED');
  const active = {workoutId:'day_1',phase:'strength',activeLoggerUserId:isaac.id,logs:{[isaac.id]:{}}};
  assert.equal((await request('/api/workout/active',{activeWorkout:active})).status,403);
  const completion = {workoutId:'day_1',startTime:'2026-10-01T08:00:00Z',endTime:'2026-10-01T09:00:00Z',logs:{[isaac.id]:{}}};
  assert.equal((await request('/api/workout/complete',completion)).status,403);
  assert.equal((await request('/api/workout/active',{activeWorkout:{...active,activeLoggerUserId:mary.id,logs:{[mary.id]:{}}}})).status,200);
  cookie = isaacCookie;
  const isaacProgram = await (await request('/api/program')).json();
  assert.match(isaacProgram.days[0].name,/Back/);
  assert.equal(isaacProgram.days[0].exercises.find(e=>e.name==='Barbell Curl').setsCount,3);
  assert.equal((await (await request('/api/workout/active')).json()).activeWorkout,null);
});
