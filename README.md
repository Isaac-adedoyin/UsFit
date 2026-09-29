# UsFit

A private workout planner and journal for Isaac and Mary, with separate programs, a shared weekly schedule, guided workouts, timers, measurements, and progress tracking.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` if you do not already have one.
3. Set a long random `SESSION_SECRET` and your shared `USFIT_PASSPHRASE` in `.env`.
4. Run `npm start` and open the local address printed by the server.

The two approved accounts are configured in `server.js`. Setting `USFIT_PASSPHRASE` makes the shared passphrase mandatory for both sign-in and registration. If it is blank, the existing email-only sign-in remains enabled. Restart after changing environment settings. Do not use email-only sign-in for a publicly reachable deployment.

## Daily use

- **Today:** See both members’ weekly completion and start or resume your workout.
- **Planner:** Choose training days and reschedule sessions.
- **Program:** Adjust each account’s exercises and targets.
- **Progress:** See analytics and search the shared workout journal by workout name or notes. Filter by either person and expand a session for its completed sets.
- **Settings:** Change profile preferences and export backups.

Active workouts save periodically and after set edits. A copy is kept in this browser for the signed-in member before synchronization. If a connection drops during an already loaded workout, keep the browser’s storage intact and reconnect to sync. This is draft recovery, not full offline app support. Completed workout submissions can be retried without creating duplicate history entries.

## Storage and backups

Local data lives in `data/database.json`. Set `USFIT_DATA_DIR` to use another persistent directory. Export backups regularly from Settings, especially before resetting or importing data. Device drafts contain workout information, so use trusted devices.

The pre-existing serverless KV adapter is not a transactional database and remains a deployment limitation: it caches reads in each process and does not await writes. Use the local server with persistent storage for this version; reliable multi-instance hosting needs a separate storage migration.

## Verification

Run `npm test`. Tests use temporary directories rather than your real database. The suite covers program defaults, progression, media, active-session storage, private sign-in, authenticated history, invalid dates, and duplicate completion retries.

## Personal three-day plans

The September 2026 plan update prioritizes glutes for Mary and back, shoulders and biceps for Isaac, with balanced supporting work. Sessions contain 15–20 working sets, an eight-minute easy warm-up, and a short cool-down. Allow 75–110 minutes depending on equipment waits and rest; two hours is the available window, not a requirement.

Technique links point to StrengthLog's exercise guides. References were checked on September 30, 2026. The row and calf guides identify the relevant section of a longer article. Demonstrations open on the publisher's site; UsFit does not redistribute their media or present generated anatomy pictures as verified technique. Programming is UsFit's own, not a StrengthLog-endorsed program.

Exercise alternatives replace the whole movement definition and start with a fresh load. A session keeps its own exercise snapshot so swaps do not alter the permanent plan. Completed sessions retain exercise and workout names. Warm-up sets are additional practice sets and are not logged as working sets. Hold exercises show seconds; single-side exercises specify per-side targets.

The installed previous programs are retained in `previousTrainingPrograms` in the database, and a complete pre-install backup is saved as `data/before-goal-plans-*.bak`. To install on another local copy, stop the server and run `node scripts/install-training-plan.js`, then restart. The installer refuses to replace plans while a workout is active.
