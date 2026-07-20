const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');

let memoryDb = null;

// Helper to ensure the directory and file exist
function initDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const seedData = getDefaultSeedData();
    writeAtomic(seedData);
  }
}

function readDb() {
  if (memoryDb) return memoryDb;

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { execSync } = require('child_process');
      const cmd = `curl -s -H "Authorization: Bearer ${process.env.KV_REST_API_TOKEN}" "${process.env.KV_REST_API_URL}/get/usfit_db"`;
      const response = execSync(cmd).toString().trim();
      const parsedRes = JSON.parse(response);
      if (parsedRes && parsedRes.result) {
        const dbData = typeof parsedRes.result === 'string' ? JSON.parse(parsedRes.result) : parsedRes.result;
        memoryDb = dbData;
        return memoryDb;
      }
    } catch (err) {
      console.error('Failed to read from Vercel KV, falling back to seed/file:', err);
    }
  }

  initDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    memoryDb = JSON.parse(raw);
    return memoryDb;
  } catch (err) {
    console.error('Error reading database file, resetting to seed data:', err);
    const seed = getDefaultSeedData();
    writeAtomic(seed);
    memoryDb = seed;
    return seed;
  }
}

function writeAtomic(data) {
  memoryDb = data;

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const url = `${process.env.KV_REST_API_URL}/set/usfit_db`;
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).catch(err => console.error('Failed to write to KV:', err));
  } else {
    const tmpFile = DB_FILE + '.tmp';
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error writing database atomically:', err);
      if (fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
      throw err;
    }
  }
}

// Default data generator containing the full base program, stretches, and treadmill setup
function getDefaultSeedData() {
  const defaultProgram = {
    days: [
        {
          id: "day_1",
          name: "Day 1 — Build the Front Frame",
          focus: "Chest, Front/Side Deltoids, Biceps, Brachialis, Abs",
          treadmill: [
            { id: "t_1_1", stage: 1, name: "Easy Walking", duration: 10, speed: 4.5, incline: 1.0, hrTarget: 100 },
            { id: "t_1_2", stage: 2, name: "Moderate Walking", duration: 15, speed: 5.2, incline: 2.0, hrTarget: 115 },
            { id: "t_1_3", stage: 3, name: "Increased Incline", duration: 15, speed: 5.5, incline: 4.5, hrTarget: 125 },
            { id: "t_1_4", stage: 4, name: "Higher-Intensity", duration: 10, speed: 6.0, incline: 3.0, hrTarget: 135 },
            { id: "t_1_5", stage: 5, name: "Gradual Cool-Down", duration: 10, speed: 4.0, incline: 1.0, hrTarget: 100 }
          ],
          stretches: [
            { id: "s_1_1", name: "Chest Wall Stretch", duration: 45, sideIndicator: true, muscle: "Chest", description: "Stand near a wall, place your forearm against it at 90 degrees, and gently rotate your body away.", media: "/assets/images/chest_stretch.png" },
            { id: "s_1_2", name: "Doorway Shoulder Stretch", duration: 45, sideIndicator: false, muscle: "Shoulders/Chest", description: "Place both arms on the doorframe and take a step forward until you feel a stretch in your shoulders and chest." },
            { id: "s_1_3", name: "Cross-Body Shoulder Stretch", duration: 45, sideIndicator: true, muscle: "Shoulders", description: "Pull one arm straight across your chest using your opposite forearm, keeping your shoulder down." },
            { id: "s_1_4", name: "Overhead Bicep/Tricep Stretch", duration: 45, sideIndicator: true, muscle: "Biceps & Triceps", description: "Reach one hand down your spine, pulling the elbow back with the other hand, then interlace fingers and pull back to stretch biceps." }
          ],
          exercises: [
            {
              id: "ex_1_1",
              name: "Flat Barbell Bench Press",
              targetMuscles: "Chest, Front Deltoids, Triceps",
              setsCount: 3,
              repRangeMin: 6,
              repRangeMax: 10,
              restSeconds: 150, // 2.5 minutes
              defaultStartWeight: 30,
              structureType: "straight", // straight, superset, or round
              instructions: {
                setup: "Lie flat on the bench, feet flat on the floor. Grip the barbell slightly wider than shoulder-width.",
                movement: "Unrack the barbell, lower it under control to your mid-chest, then press it back up forcefully to full extension.",
                breathing: "Inhale on the way down, exhale as you push up.",
                commonMistakes: "Bouncing the bar off the chest, flaring elbows out to 90 degrees, lifting hips off the bench.",
                safety: "Ensure a secure grip and use a spotter or safety pins for heavy sets.",
                cues: "Squeeze shoulder blades together, keep feet planted, drive through the floor."
              },
              alternatives: ["Dumbbell Bench Press", "Machine Chest Press"],
              media: "/assets/images/bench_press.png"
            },
            {
              id: "ex_1_2",
              name: "Machine Shoulder Press",
              targetMuscles: "Front Deltoids, Triceps",
              setsCount: 3,
              repRangeMin: 8,
              repRangeMax: 12,
              restSeconds: 150,
              defaultStartWeight: 15,
              structureType: "straight",
              instructions: {
                setup: "Adjust the seat height so the handles align with your shoulders. Sit back with a neutral spine.",
                movement: "Grip handles tightly and press upwards until arms are nearly fully locked, then lower slowly back to start position.",
                breathing: "Exhale as you press, inhale as you lower.",
                commonMistakes: "Arching your lower back excessively, not utilizing the full range of motion.",
                safety: "Select a weight that allows you to control the eccentric phase.",
                cues: "Keep core tight, push the handles straight up, don't bang the weights."
              },
              alternatives: ["Dumbbell Shoulder Press", "Overhead Barbell Press"],
              media: "/assets/images/shoulder_press.svg"
            },
            {
              id: "ex_1_3",
              name: "Machine Lateral Raise",
              targetMuscles: "Side Deltoids",
              setsCount: 3,
              repRangeMin: 12,
              repRangeMax: 20,
              restSeconds: 75,
              defaultStartWeight: 4,
              structureType: "straight",
              instructions: {
                setup: "Adjust the seat so pads rest on your outer arms. Place chest against chest-pad if applicable.",
                movement: "Raise elbows outwards in an arc until they reach shoulder height, pause briefly, then lower slowly.",
                breathing: "Exhale on the raise, inhale on the descent.",
                commonMistakes: "Shrugging the shoulders up, using momentum or swinging, raising wrists higher than elbows.",
                safety: "Perform with high control; avoid jerky movements to protect the shoulder joint.",
                cues: "Lead with the elbows, push outwards, keep shoulders depressed."
              },
              alternatives: ["Dumbbell Lateral Raise", "Cable Lateral Raise"],
              media: "/assets/images/lateral_raise.svg"
            },
            {
              id: "ex_1_4",
              name: "Cable Chest Fly",
              targetMuscles: "Chest, Front Deltoids",
              setsCount: 3,
              repRangeMin: 10,
              repRangeMax: 15,
              restSeconds: 75,
              defaultStartWeight: 10,
              structureType: "straight",
              instructions: {
                setup: "Set cable pulleys to chest height. Grab handles and step forward into a staggered stance, keeping a slight bend in your elbows.",
                movement: "Bring handles together in a wide arc in front of your chest. Squeeze chest muscles at completion, then slowly return.",
                breathing: "Exhale as you close, inhale as you open.",
                commonMistakes: "Bending elbows too much (turning it into a press), leaning forward too much, using shoulders to pull.",
                safety: "Ensure cables don't pull shoulders past a comfortable range of motion.",
                cues: "Hug a big tree, squeeze your inner chest, keep elbows fixed."
              },
              alternatives: ["Pec Dec Fly", "Dumbbell Chest Fly"],
              media: "/assets/images/cable_fly.svg"
            },
            {
              id: "ex_1_5",
              name: "EZ-Bar Preacher Curl",
              targetMuscles: "Biceps, Brachialis",
              setsCount: 3,
              repRangeMin: 8,
              repRangeMax: 12,
              restSeconds: 75,
              defaultStartWeight: 15,
              structureType: "straight",
              instructions: {
                setup: "Sit on the preacher bench, armpits resting snuggly against the top of the pad. Hold the EZ-bar on the inner grips.",
                movement: "Lower the bar slowly until arms are fully extended. Curl the bar up towards face, squeezing biceps at the top.",
                breathing: "Inhale down, exhale up.",
                commonMistakes: "Lifting elbows off the pad, not extending fully at the bottom, swinging the body.",
                safety: "Do not hyperextend elbows at the bottom of the movement.",
                cues: "Keep armpits glued to the pad, squeeze biceps at the top, control the stretch."
              },
              alternatives: ["Dumbbell Preacher Curl", "Cable Bicep Curl"],
              media: "/assets/images/preacher_curl.svg"
            },
            {
              id: "ex_1_6",
              name: "Cross-Body Hammer Curl",
              targetMuscles: "Biceps, Brachioradialis",
              setsCount: 3,
              repRangeMin: 10,
              repRangeMax: 15,
              restSeconds: 75,
              defaultStartWeight: 8,
              structureType: "straight",
              instructions: {
                setup: "Stand tall with dumbbells at your sides, neutral grip (palms facing in).",
                movement: "Without rotating the wrist, curl the dumbbell of one arm across your chest toward the opposite shoulder. Lower and alternate.",
                breathing: "Exhale as you curl up, inhale as you lower.",
                commonMistakes: "Swinging hips, moving elbows forward, using momentum.",
                safety: "Keep torso braced to avoid lumbar extension.",
                cues: "Curl towards opposite shoulder, keep thumb pointing up, control the down phase."
              },
              alternatives: ["Regular Hammer Curl", "Cable Rope Hammer Curl"],
              media: "/assets/images/hammer_curl.svg"
            },
            {
              id: "ex_1_7",
              name: "Hanging Leg Raise",
              targetMuscles: "Lower Abs, Hip Flexors",
              setsCount: 3,
              repRangeMin: 8,
              repRangeMax: 15,
              restSeconds: 60,
              defaultStartWeight: 0,
              structureType: "straight",
              instructions: {
                setup: "Hang from a pull-up bar with an overhand grip, shoulders active (pull down away from ears).",
                movement: "Keep legs straight or slightly bent, and raise them up until they are parallel to the floor (or higher). Lower slowly.",
                breathing: "Exhale as you raise, inhale as you lower.",
                commonMistakes: "Swinging your legs, using momentum, shrugging shoulders up.",
                safety: "Do not swing or bounce at the bottom. Keep control.",
                cues: "Initiate with abs, roll your pelvis up, control the descent."
              },
              alternatives: ["Captain's Chair Leg Raise", "Lying Leg Raise"],
              media: "/assets/images/leg_raise.svg"
            },
            {
              id: "ex_1_8",
              name: "Weighted Plank",
              targetMuscles: "Core, Abs",
              setsCount: 2,
              repRangeMin: 30, // seconds
              repRangeMax: 45, // seconds
              restSeconds: 60,
              isTimed: true,
              defaultStartWeight: 0,
              structureType: "straight",
              instructions: {
                setup: "Get into a forearm plank position, with a partner safely placing a plate on your upper/mid back.",
                movement: "Hold a rigid body line, squeeze glutes, abs, and thighs. Do not let lower back sag.",
                breathing: "Take shallow, controlled breaths while maintaining core tension.",
                commonMistakes: "Letting lower back arch/sag, raising hips too high, looking up (neck extension).",
                safety: "If lower back hurts, immediately have your partner remove the weight or drop to knees.",
                cues: "Push the elbows into the floor, squeeze glutes, keep neck long."
              },
              alternatives: ["Standard Bodyweight Plank", "RKC Plank"],
              media: "/assets/images/plank.svg"
            }
          ]
        },
        {
          id: "day_2",
          name: "Day 2 — Build the Monster Back",
          focus: "Lats, Back Thickness, Traps, Rear Delts, Triceps, Forearms, Abs",
          treadmill: [
            { id: "t_2_1", stage: 1, name: "Easy Walking", duration: 10, speed: 4.5, incline: 1.0, hrTarget: 100 },
            { id: "t_2_2", stage: 2, name: "Moderate Walking", duration: 15, speed: 5.2, incline: 2.0, hrTarget: 115 },
            { id: "t_2_3", stage: 3, name: "Increased Incline", duration: 15, speed: 5.5, incline: 4.5, hrTarget: 125 },
            { id: "t_2_4", stage: 4, name: "Higher-Intensity", duration: 10, speed: 6.0, incline: 3.0, hrTarget: 135 },
            { id: "t_2_5", stage: 5, name: "Gradual Cool-Down", duration: 10, speed: 4.0, incline: 1.0, hrTarget: 100 }
          ],
          stretches: [
            { id: "s_2_1", name: "Child's Pose", duration: 60, sideIndicator: false, muscle: "Lower Back/Lats", description: "Kneel on the floor, sit back on your heels, and reach your arms far forward on the floor, lowering your chest.", media: "/assets/images/lat_stretch.png" },
            { id: "s_2_2", name: "Lat Stretch on Wall", duration: 45, sideIndicator: true, muscle: "Lats", description: "Place one hand on a wall or pole at shoulder height, push your hips back, and lower your torso until you feel the lat stretch." },
            { id: "s_2_3", name: "Cat-Cow Stretch", duration: 60, sideIndicator: false, muscle: "Spine/Abs", description: "On hands and knees, alternate between arching your back upward (cat) and dipping it down while looking up (cow)." },
            { id: "s_2_4", name: "Cobra Stretch", duration: 60, sideIndicator: false, muscle: "Abs/Core", description: "Lie face down, place hands under shoulders, and press up to lift your chest while keeping hips on the floor." }
          ],
          exercises: [
            {
              id: "ex_2_1",
              name: "Plate-Loaded High Row",
              targetMuscles: "Lats, Upper Back, Biceps",
              setsCount: 3,
              repRangeMin: 6,
              repRangeMax: 10,
              restSeconds: 120,
              defaultStartWeight: 15,
              structureType: "straight",
              instructions: {
                setup: "Adjust the seat and chest pad so you can stretch fully to reach the handles. Secure thighs under the rollers.",
                movement: "Pull the handles down and back, driving elbows towards your ribs. Squeeze lats at the bottom, then extend slowly.",
                breathing: "Exhale as you pull, inhale as you stretch.",
                commonMistakes: "Using biceps too much, shrugging shoulders up, cutting range of motion.",
                safety: "Ensure chest stays firmly against the pad throughout to protect the spine.",
                cues: "Pull through your elbows, squeeze shoulder blades down, feel the stretch at the top."
              },
              alternatives: ["Lat Pulldown", "Chest-Supported Row"],
              media: "/assets/images/high_row.png"
            },
            {
              id: "ex_2_2",
              name: "Neutral-Grip Lat Pulldown",
              targetMuscles: "Lats, Terres Major, Biceps",
              setsCount: 3,
              repRangeMin: 8,
              repRangeMax: 12,
              restSeconds: 90,
              defaultStartWeight: 25,
              structureType: "straight",
              instructions: {
                setup: "Attach neutral grip bar. Sit down, locking thighs under pads. Reach up to grip the handles.",
                movement: "Pull the bar down to upper chest, keeping elbows tucked close to body. Return slowly under control.",
                breathing: "Exhale as you pull down, inhale on return.",
                commonMistakes: "Leaning back too far, pulling bar behind neck, bouncing.",
                safety: "Avoid jerky motion; load must be controlled on eccentric return.",
                cues: "Elbows in back pockets, chest high, squeeze the lats."
              },
              alternatives: ["Overhand Lat Pulldown", "Pull-ups"],
              media: "/assets/images/lat_pulldown.svg"
            },
            {
              id: "ex_2_3",
              name: "Straight-Arm Cable Pulldown",
              targetMuscles: "Lats, Triceps (Long Head)",
              setsCount: 3,
              repRangeMin: 10,
              repRangeMax: 15,
              restSeconds: 90,
              defaultStartWeight: 12.5,
              structureType: "straight",
              instructions: {
                setup: "Attach rope or straight bar to high pulley. Stand back slightly, feet shoulder-width, soft knees, torso hinged forward.",
                movement: "Keep arms nearly straight. Pull the bar down to your thighs, squeezing lats. Raise back up to start with control.",
                breathing: "Exhale down, inhale up.",
                commonMistakes: "Bending elbows too much, arching/swinging lower back, shrugging shoulders.",
                safety: "Do not let the stack slam; control the deceleration at the top.",
                cues: "Keep arms locked, sweep the bar in an arc, press shoulders down."
              },
              alternatives: ["Dumbbell Pull-over", "Cable Face Pulls"],
              media: "/assets/images/straight_arm_pulldown.svg"
            },
            {
              id: "ex_2_4",
              name: "Cable Rear-Delt Fly",
              targetMuscles: "Rear Deltoids, Middle Traps",
              setsCount: 3,
              repRangeMin: 12,
              repRangeMax: 20,
              restSeconds: 75,
              defaultStartWeight: 5,
              structureType: "straight",
              instructions: {
                setup: "Set dual cables at head height without handles (grab bare cable ends). Stand centered, arms crossed in front.",
                movement: "Pull arms back and outwards horizontally in a wide arc until arms are in line with shoulders. Return slowly.",
                breathing: "Exhale on opening, inhale on closing.",
                commonMistakes: "Using triceps (bending elbows), shrugging, squeezing shoulder blades too early (using traps).",
                safety: "Do not over-extend wrists; maintain neutral hand position.",
                cues: "Fly outwards, lead with knuckles, isolate the back of the shoulder."
              },
              alternatives: ["Dumbbell Rear Delt Fly", "Pec Dec Rear Delt Fly"],
              media: "/assets/images/rear_delt_fly.svg"
            },
            {
              id: "ex_2_5",
              name: "Weighted Parallel-Bar Dip",
              targetMuscles: "Triceps, Lower Chest, Front Deltoids",
              setsCount: 3,
              repRangeMin: 6,
              repRangeMax: 10,
              restSeconds: 150,
              defaultStartWeight: 0,
              structureType: "straight",
              instructions: {
                setup: "Mount parallel bars. If weighted, attach dip belt or hold dumbbell between feet. Keep arms straight but not hyperlocked.",
                movement: "Lower your body by bending elbows until upper arms are parallel to the floor, leaning slightly forward. Press back up.",
                breathing: "Inhale on descent, exhale on press.",
                commonMistakes: "Going too deep (shoulder strain), flaring elbows, bouncing at the bottom.",
                safety: "Stop if shoulder joint feels sharp pain. Start bodyweight only to verify depth.",
                cues: "Lean slightly forward, control the descent, press up tall."
              },
              alternatives: ["Assisted Dip", "Bench Dips"],
              media: "/assets/images/dips.svg"
            },
            {
              id: "ex_2_6",
              name: "Overhead Cable Triceps Extension",
              targetMuscles: "Triceps (Long Head)",
              setsCount: 3,
              repRangeMin: 10,
              repRangeMax: 15,
              restSeconds: 90,
              defaultStartWeight: 7.5,
              structureType: "straight",
              instructions: {
                setup: "Set pulley to mid-height, attach rope. Face away from stack in a split stance. Lean forward, hands behind head.",
                movement: "Keeping elbows fixed close to ears, press hands forward and extend elbows fully. Squeeze and split the rope. Return slowly.",
                breathing: "Exhale on extension, inhale on return.",
                commonMistakes: "Moving elbows, flaring elbows out, arching lower back.",
                safety: "Ensure firm footing to prevent being pulled back by the stack.",
                cues: "Keep elbows pointed forward, lock elbows out, stretch behind head."
              },
              alternatives: ["Skull Crushers", "Dumbbell Overhead Extension"],
              media: "/assets/images/tricep_extension.svg"
            },
            {
              id: "ex_2_7",
              name: "Heavy Farmer’s Carry",
              targetMuscles: "Grip, Forearms, Traps, Core",
              setsCount: 3, // represented as rounds
              repRangeMin: 30, // seconds
              repRangeMax: 45, // seconds
              restSeconds: 120,
              isTimed: true,
              defaultStartWeight: 12,
              structureType: "straight",
              instructions: {
                setup: "Deadlift two heavy dumbbells or handles to standing. Stand tall, shoulders packed down and back.",
                movement: "Take quick, small, controlled steps forward for the designated duration. Maintain a rigid torso.",
                breathing: "Breathe continuously, brace your core.",
                commonMistakes: "Slouching forward, looking down, letting weights swing.",
                safety: "Lower weights safely via a squat/deadlift format if grip fails.",
                cues: "Chest high, shoulders packed, tight core, active steps."
              },
              alternatives: ["Static Grip Hold", "Suitcase Carry"],
              media: "/assets/images/farmers_carry.svg"
            },
            {
              id: "ex_2_8",
              name: "Ab-Wheel Rollout",
              targetMuscles: "Core, Abs",
              setsCount: 3,
              repRangeMin: 8,
              repRangeMax: 15,
              restSeconds: 60,
              defaultStartWeight: 0,
              structureType: "straight",
              instructions: {
                setup: "Kneel on a soft pad. Place ab wheel on floor in front of you, arms extended under shoulders.",
                movement: "Roll the wheel forward, extending your hips and torso toward the floor. Keep core hollowed. Pull back using abs.",
                breathing: "Inhale as you roll out, exhale as you pull back.",
                commonMistakes: "Arching lower back, pulling back with arms instead of abs, sagging hips.",
                safety: "Only roll out as far as you can control without lower back pain or sagging.",
                cues: "Keep lower back rounded (hollow body), squeeze glutes, pull with stomach."
              },
              alternatives: ["Swiss Ball Rollout", "Inchworms"],
              media: "/assets/images/ab_wheel.svg"
            },
            {
              id: "ex_2_9",
              name: "Pallof Press",
              targetMuscles: "Obliques, Core (Anti-Rotation)",
              setsCount: 2,
              repRangeMin: 10, // per side
              repRangeMax: 15, // per side
              restSeconds: 60,
              defaultStartWeight: 7.5,
              structureType: "straight",
              instructions: {
                setup: "Set pulley at chest height. Stand sideways to cable. Grasp handle with both hands, pull it to center of chest.",
                movement: "Press handle straight out in front of chest. Hold for a 2-second count, resisting side pull. Return to chest.",
                breathing: "Exhale as you press, inhale as you return.",
                commonMistakes: "Letting torso twist towards stack, shifting weight, rushing reps.",
                safety: "Ensure stance is wide enough to stay firmly anchored.",
                cues: "Do not let the cable twist your torso, press straight, hold the lock."
              },
              alternatives: ["Cable Woodchopper", "Russian Twist"],
              media: "/assets/images/pallof_press.svg"
            }
          ]
        },
        {
          id: "day_3",
          name: "Day 3 — Fix the Foundation",
          focus: "Quadriceps, Hamstrings, Glutes, Calves, Tibialis, Ankles",
          treadmill: [
            { id: "t_3_1", stage: 1, name: "Easy Walking", duration: 10, speed: 4.5, incline: 1.0, hrTarget: 100 },
            { id: "t_3_2", stage: 2, name: "Moderate Walking", duration: 15, speed: 5.2, incline: 2.0, hrTarget: 115 },
            { id: "t_3_3", stage: 3, name: "Increased Incline", duration: 15, speed: 5.5, incline: 4.5, hrTarget: 125 },
            { id: "t_3_4", stage: 4, name: "Higher-Intensity", duration: 10, speed: 6.0, incline: 3.0, hrTarget: 135 },
            { id: "t_3_5", stage: 5, name: "Gradual Cool-Down", duration: 10, speed: 4.0, incline: 1.0, hrTarget: 100 }
          ],
          stretches: [
            { id: "s_3_1", name: "Standing Quad Stretch", duration: 45, sideIndicator: true, muscle: "Quadriceps", description: "Stand on one leg, grab the ankle of the other behind you, and pull it close to your glute while keeping knees aligned.", media: "/assets/images/quad_stretch.png" },
            { id: "s_3_2", name: "Lying Hamstring Stretch", duration: 45, sideIndicator: true, muscle: "Hamstrings", description: "Lie on your back, lift one leg straight up, and pull it gently toward your head using hands or a strap." },
            { id: "s_3_3", name: "Deep Glute Stretch", duration: 45, sideIndicator: true, muscle: "Glutes", description: "Cross one ankle over the opposite knee in a figure-4 position, either sitting or lying down, and pull the thigh closer." },
            { id: "s_3_4", name: "Calf Stretch against Wall", duration: 45, sideIndicator: true, muscle: "Calves", description: "Place toes of one foot high against a wall, keep the heel on the floor, and lean your hips forward." }
          ],
          exercises: [
            {
              id: "ex_3_1",
              name: "Hack Squat",
              targetMuscles: "Quadriceps, Glutes",
              setsCount: 4,
              repRangeMin: 6,
              repRangeMax: 10,
              restSeconds: 180,
              defaultStartWeight: 30,
              structureType: "straight",
              instructions: {
                setup: "Position back firmly against the carriage pad. Place feet shoulder-width apart on plate. Disengage safety handles.",
                movement: "Lower carriage slowly by bending knees until thighs are parallel to plate (or lower). Press back up to starting position.",
                breathing: "Inhale on descent, exhale on press up.",
                commonMistakes: "Knees caving inwards, lower back or hips lifting off pad, locking knees forcefully at top.",
                safety: "Always ensure safety stops are set at a safe height. Never lock knees.",
                cues: "Press lower back into pad, push through heels, spread knees apart."
              },
              alternatives: ["Barbell Back Squat", "Leg Press"],
              media: "/assets/images/hack_squat.png"
            },
            {
              id: "ex_3_2",
              name: "Romanian Deadlift",
              targetMuscles: "Hamstrings, Glutes, Lower Back",
              setsCount: 4,
              repRangeMin: 6,
              repRangeMax: 10,
              restSeconds: 180,
              defaultStartWeight: 30,
              structureType: "straight",
              instructions: {
                setup: "Stand with feet hip-width apart. Hold barbell or dumbbells in front of thighs with an overhand grip. Core tight.",
                movement: "Hinge at hips, pushing them back. Lower the weights down front of legs, keeping back flat. Squeeze glutes to return.",
                breathing: "Inhale hinge down, exhale stand up.",
                commonMistakes: "Rounding the lower back, letting weights drift forward, bending knees too much.",
                safety: "Keep bar close to legs. Do not overload; focus on hamstrings stretch.",
                cues: "Push wall away with hips, shave your legs with the bar, hinge don't squat."
              },
              alternatives: ["Dumbbell Romanian Deadlift", "Cable Pull-Through"],
              media: "/assets/images/romanian_deadlift.svg"
            },
            {
              id: "ex_3_3",
              name: "Bulgarian Split Squat",
              targetMuscles: "Quadriceps, Glutes, Hamstrings",
              setsCount: 3,
              repRangeMin: 8,
              repRangeMax: 12, // per leg
              restSeconds: 120,
              defaultStartWeight: 6,
              structureType: "straight",
              instructions: {
                setup: "Stand about two feet in front of a bench. Place top of one foot flat on the bench behind you. Hold dumbbells in hands.",
                movement: "Lower front hip until back knee is just above floor, front thigh parallel. Push back up using front leg.",
                breathing: "Inhale down, exhale up.",
                commonMistakes: "Front knee traveling too far forward, losing balance, torso collapsing.",
                safety: "Ensure knee does not track too far sideways. Go bodyweight first if balance is tricky.",
                cues: "Drop your hips straight down, drive through front heel, stay tall."
              },
              alternatives: ["Lunge", "Step-ups"],
              media: "/assets/images/bulgarian_split_squat.svg"
            },
            {
              id: "ex_3_4",
              name: "Seated or Lying Leg Curl",
              targetMuscles: "Hamstrings",
              setsCount: 3,
              repRangeMin: 10,
              repRangeMax: 15,
              restSeconds: 90,
              defaultStartWeight: 15,
              structureType: "straight",
              instructions: {
                setup: "Lie face down or sit on machine. Align knees with pivot joint. Secure pad against back of calves.",
                movement: "Curl legs fully towards glutes, squeezing hamstrings at maximum contraction. Return slowly under control.",
                breathing: "Exhale on curl, inhale on return.",
                commonMistakes: "Hips lifting off pad (lying), slamming weights, rushing return.",
                safety: "Perform with absolute control to prevent knee strain.",
                cues: "Pull heels to glutes, squeeze at bottom, resist the return."
              },
              alternatives: ["Dumbbell Lying Leg Curl", "Nordic Hamstring Curl"],
              media: "/assets/images/leg_curl.svg"
            },
            {
              id: "ex_3_5",
              name: "Standing Calf Raise",
              targetMuscles: "Calves (Gastrocnemius)",
              setsCount: 4,
              repRangeMin: 8,
              repRangeMax: 15,
              restSeconds: 60,
              defaultStartWeight: 20,
              structureType: "straight",
              instructions: {
                setup: "Position shoulders under pads on calf block. Step balls of feet onto block, heels hanging off.",
                movement: "Lower heels to maximum stretch, hold 1s. Press up as high as possible on toes, hold 1s.",
                breathing: "Inhale on stretch down, exhale on press up.",
                commonMistakes: "Bouncing, locking knees fully, not pausing at the bottom or top.",
                safety: "Perform slowly to protect Achilles tendon.",
                cues: "Get deep stretch, pause, push up tall on big toes, pause."
              },
              alternatives: ["Seated Calf Raise", "Leg Press Calf Raise"],
              media: "/assets/images/calf_raise.svg"
            },
            {
              id: "ex_3_6",
              name: "Tibialis Raise",
              targetMuscles: "Tibialis Anterior (Shin)",
              setsCount: 3,
              repRangeMin: 15,
              repRangeMax: 25,
              restSeconds: 60,
              defaultStartWeight: 0,
              structureType: "straight",
              instructions: {
                setup: "Stand with upper back against wall, heels about 1-2 feet away. Arms at sides.",
                movement: "Keeping legs straight, pull toes up towards knees as high as possible. Pause, then lower slow.",
                breathing: "Exhale up, inhale down.",
                commonMistakes: "Bending knees, peeling hips off wall, using momentum.",
                safety: "Ensure knees remain locked but not hyperextended.",
                cues: "Toes to shins, squeeze the front of the shin, slow on descent."
              },
              alternatives: ["Kettlebell Tibialis Curl", "Tib Bar Raise"],
              media: "/assets/images/tibialis_raise.svg"
            }
          ]
        }
      ]
    };

  const matchedImages = {
    "ex_1_1": [
      "/assets/images/exercises/ex_1_1_0.jpg",
      "/assets/images/exercises/ex_1_1_1.jpg"
    ],
    "ex_1_2": [
      "/assets/images/exercises/ex_1_2_0.jpg",
      "/assets/images/exercises/ex_1_2_1.jpg"
    ],
    "ex_1_3": [
      "/assets/images/exercises/ex_1_3_0.jpg",
      "/assets/images/exercises/ex_1_3_1.jpg"
    ],
    "ex_1_4": [
      "/assets/images/exercises/ex_1_4_0.jpg",
      "/assets/images/exercises/ex_1_4_1.jpg"
    ],
    "ex_1_5": [
      "/assets/images/exercises/ex_1_5_0.jpg",
      "/assets/images/exercises/ex_1_5_1.jpg"
    ],
    "ex_1_6": [
      "/assets/images/exercises/ex_1_6_0.jpg",
      "/assets/images/exercises/ex_1_6_1.jpg"
    ],
    "ex_1_7": [
      "/assets/images/exercises/ex_1_7_0.jpg",
      "/assets/images/exercises/ex_1_7_1.jpg"
    ],
    "ex_1_8": [
      "/assets/images/exercises/ex_1_8_0.jpg",
      "/assets/images/exercises/ex_1_8_1.jpg"
    ],
    "ex_2_1": [
      "/assets/images/exercises/ex_2_1_0.jpg",
      "/assets/images/exercises/ex_2_1_1.jpg"
    ],
    "ex_2_2": [
      "/assets/images/exercises/ex_2_2_0.jpg",
      "/assets/images/exercises/ex_2_2_1.jpg"
    ],
    "ex_2_3": [
      "/assets/images/exercises/ex_2_3_0.jpg",
      "/assets/images/exercises/ex_2_3_1.jpg"
    ],
    "ex_2_4": [
      "/assets/images/exercises/ex_2_4_0.jpg",
      "/assets/images/exercises/ex_2_4_1.jpg"
    ],
    "ex_2_5": [
      "/assets/images/exercises/ex_2_5_0.jpg",
      "/assets/images/exercises/ex_2_5_1.jpg"
    ],
    "ex_2_6": [
      "/assets/images/exercises/ex_2_6_0.jpg",
      "/assets/images/exercises/ex_2_6_1.jpg"
    ],
    "ex_2_7": [
      "/assets/images/exercises/ex_2_7_0.jpg",
      "/assets/images/exercises/ex_2_7_1.jpg"
    ],
    "ex_2_8": [
      "/assets/images/exercises/ex_2_8_0.jpg",
      "/assets/images/exercises/ex_2_8_1.jpg"
    ],
    "ex_2_9": [
      "/assets/images/exercises/ex_2_9_0.jpg",
      "/assets/images/exercises/ex_2_9_1.jpg"
    ],
    "ex_3_1": [
      "/assets/images/exercises/ex_3_1_0.jpg",
      "/assets/images/exercises/ex_3_1_1.jpg"
    ],
    "ex_3_2": [
      "/assets/images/exercises/ex_3_2_0.jpg",
      "/assets/images/exercises/ex_3_2_1.jpg"
    ],
    "ex_3_3": [
      "/assets/images/exercises/ex_3_3_0.jpg",
      "/assets/images/exercises/ex_3_3_1.jpg"
    ],
    "ex_3_4": [
      "/assets/images/exercises/ex_3_4_0.jpg",
      "/assets/images/exercises/ex_3_4_1.jpg"
    ],
    "ex_3_5": [
      "/assets/images/exercises/ex_3_5_0.jpg",
      "/assets/images/exercises/ex_3_5_1.jpg"
    ],
    "ex_3_6": [
      "/assets/images/exercises/ex_3_6_0.jpg",
      "/assets/images/exercises/ex_3_6_1.jpg"
    ]
  };

  // Map images into seed program
  defaultProgram.days.forEach(day => {
    // Map treadmill stages
    day.treadmill.forEach(t => {
      t.media = [
        "/assets/images/exercises/treadmill_0.jpg",
        "/assets/images/exercises/treadmill_1.jpg"
      ];
    });

    // Map stretches
    day.stretches.forEach(s => {
      if (s.id === "s_1_1") {
        s.media = ["/assets/images/exercises/stretch_chest_0.jpg", "/assets/images/exercises/stretch_chest_1.jpg"];
      } else if (s.id === "s_1_2" || s.id === "s_1_3") {
        s.media = ["/assets/images/exercises/stretch_doorway_0.jpg", "/assets/images/exercises/stretch_doorway_1.jpg"];
      } else if (s.id === "s_1_4") {
        s.media = ["/assets/images/exercises/stretch_overhead_0.jpg", "/assets/images/exercises/stretch_overhead_1.jpg"];
      } else if (s.id === "s_2_1") {
        s.media = ["/assets/images/exercises/stretch_child_0.jpg", "/assets/images/exercises/stretch_child_1.jpg"];
      } else if (s.id === "s_2_2") {
        s.media = ["/assets/images/exercises/stretch_lat_0.jpg", "/assets/images/exercises/stretch_lat_1.jpg"];
      } else if (s.id === "s_2_3") {
        s.media = ["/assets/images/exercises/stretch_cat_0.jpg", "/assets/images/exercises/stretch_cat_1.jpg"];
      } else if (s.id === "s_2_4") {
        s.media = ["/assets/images/exercises/stretch_cobra_0.jpg", "/assets/images/exercises/stretch_cobra_1.jpg"];
      } else if (s.id === "s_3_1") {
        s.media = ["/assets/images/exercises/stretch_quad_0.jpg", "/assets/images/exercises/stretch_quad_1.jpg"];
      } else if (s.id === "s_3_2") {
        s.media = ["/assets/images/exercises/stretch_hamstring_0.jpg", "/assets/images/exercises/stretch_hamstring_1.jpg"];
      } else if (s.id === "s_3_3") {
        s.media = ["/assets/images/exercises/stretch_glute_0.jpg", "/assets/images/exercises/stretch_glute_1.jpg"];
      } else if (s.id === "s_3_4") {
        s.media = ["/assets/images/exercises/stretch_calf_0.jpg", "/assets/images/exercises/stretch_calf_1.jpg"];
      }
    });

    day.exercises.forEach(ex => {
      if (matchedImages[ex.id]) {
        ex.media = matchedImages[ex.id];
      }
    });
  });

  // Duplicate default program templates for both male and female tracks
  const programMale = JSON.parse(JSON.stringify(defaultProgram));
  const programFemale = getDefaultFemaleProgramTemplate();

  const seedData = {
    users: {},
    program_male: programMale,
    program_female: programFemale,
    schedule: {
      currentWeekId: null,
      currentWeek: null,
      completedWeeks: []
    },
    history: [],
    activeSessions: {},
    measurements: [],
    changelog: []
  };

  return seedData;
}

const verifiedMediaByExerciseName = {
  'Flat Barbell Bench Press': [
    '/assets/images/exercises/generated/flat-barbell-bench-press/step-1.png',
    '/assets/images/exercises/generated/flat-barbell-bench-press/step-2.png',
    '/assets/images/exercises/generated/flat-barbell-bench-press/step-3.png'
  ],
  'Machine Shoulder Press': [
    '/assets/images/exercises/generated/machine-shoulder-press/step-1.png',
    '/assets/images/exercises/generated/machine-shoulder-press/step-2.png',
    '/assets/images/exercises/generated/machine-shoulder-press/step-3.png'
  ],
  'Machine Lateral Raise': [
    '/assets/images/exercises/generated/machine-lateral-raise/step-1.png',
    '/assets/images/exercises/generated/machine-lateral-raise/step-2.png',
    '/assets/images/exercises/generated/machine-lateral-raise/step-3.png'
  ],
  'Cable Chest Fly': [
    '/assets/images/exercises/generated/cable-chest-fly/step-1.png',
    '/assets/images/exercises/generated/cable-chest-fly/step-2.png',
    '/assets/images/exercises/generated/cable-chest-fly/step-3.png'
  ],
  'EZ-Bar Preacher Curl': [
    '/assets/images/exercises/generated/ez-bar-preacher-curl/step-1.png',
    '/assets/images/exercises/generated/ez-bar-preacher-curl/step-2.png',
    '/assets/images/exercises/generated/ez-bar-preacher-curl/step-3.png'
  ],
  'Cross-Body Hammer Curl': [
    '/assets/images/exercises/generated/cross-body-hammer-curl/step-1.png',
    '/assets/images/exercises/generated/cross-body-hammer-curl/step-2.png',
    '/assets/images/exercises/generated/cross-body-hammer-curl/step-3.png'
  ],
  'Hanging Leg Raise': [
    '/assets/images/exercises/generated/hanging-leg-raise/step-1.png',
    '/assets/images/exercises/generated/hanging-leg-raise/step-2.png',
    '/assets/images/exercises/generated/hanging-leg-raise/step-3.png'
  ],
  'Weighted Plank': [
    '/assets/images/exercises/generated/weighted-plank/step-1.png',
    '/assets/images/exercises/generated/weighted-plank/step-2.png',
    '/assets/images/exercises/generated/weighted-plank/step-3.png'
  ],
  'Plank': [
    '/assets/images/exercises/generated/plank/step-1.png',
    '/assets/images/exercises/generated/plank/step-2.png',
    '/assets/images/exercises/generated/plank/step-3.png'
  ],
  'Cable Glute Kickback': [
    '/assets/images/exercises/generated/cable-glute-kickback/step-1.png',
    '/assets/images/exercises/generated/cable-glute-kickback/step-2.png',
    '/assets/images/exercises/generated/cable-glute-kickback/step-3.png'
  ],
  'Dead Bug': [
    '/assets/images/exercises/generated/dead-bug/step-1.png',
    '/assets/images/exercises/generated/dead-bug/step-2.png',
    '/assets/images/exercises/generated/dead-bug/step-3.png'
  ],
  'Plate-Loaded High Row': [
    '/assets/images/exercises/generated/plate-loaded-high-row/step-1.png',
    '/assets/images/exercises/generated/plate-loaded-high-row/step-2.png',
    '/assets/images/exercises/generated/plate-loaded-high-row/step-3.png'
  ],
  'Neutral-Grip Lat Pulldown': [
    '/assets/images/exercises/generated/neutral-grip-lat-pulldown/step-1.png',
    '/assets/images/exercises/generated/neutral-grip-lat-pulldown/step-2.png',
    '/assets/images/exercises/generated/neutral-grip-lat-pulldown/step-3.png'
  ],
  'Straight-Arm Cable Pulldown': [
    '/assets/images/exercises/generated/straight-arm-cable-pulldown/step-1.png',
    '/assets/images/exercises/generated/straight-arm-cable-pulldown/step-2.png',
    '/assets/images/exercises/generated/straight-arm-cable-pulldown/step-3.png'
  ],
  'Cable Rear-Delt Fly': [
    '/assets/images/exercises/generated/cable-rear-delt-fly/step-1.png',
    '/assets/images/exercises/generated/cable-rear-delt-fly/step-2.png',
    '/assets/images/exercises/generated/cable-rear-delt-fly/step-3.png'
  ],
  'Weighted Parallel-Bar Dip': [
    '/assets/images/exercises/generated/weighted-parallel-bar-dip/step-1.png',
    '/assets/images/exercises/generated/weighted-parallel-bar-dip/step-2.png',
    '/assets/images/exercises/generated/weighted-parallel-bar-dip/step-3.png'
  ],
  'Overhead Cable Triceps Extension': [
    '/assets/images/exercises/generated/overhead-cable-triceps-extension/step-1.png',
    '/assets/images/exercises/generated/overhead-cable-triceps-extension/step-2.png',
    '/assets/images/exercises/generated/overhead-cable-triceps-extension/step-3.png'
  ],
  'Heavy Farmer’s Carry': [
    '/assets/images/exercises/generated/heavy-farmers-carry/step-1.png',
    '/assets/images/exercises/generated/heavy-farmers-carry/step-2.png',
    '/assets/images/exercises/generated/heavy-farmers-carry/step-3.png'
  ],
  'Ab-Wheel Rollout': [
    '/assets/images/exercises/generated/ab-wheel-rollout/step-1.png',
    '/assets/images/exercises/generated/ab-wheel-rollout/step-2.png',
    '/assets/images/exercises/generated/ab-wheel-rollout/step-3.png'
  ],
  'Pallof Press': [
    '/assets/images/exercises/generated/pallof-press/step-1.png',
    '/assets/images/exercises/generated/pallof-press/step-2.png',
    '/assets/images/exercises/generated/pallof-press/step-3.png'
  ],
  'Romanian Deadlift': [
    '/assets/images/exercises/generated/romanian-deadlift/step-1.png',
    '/assets/images/exercises/generated/romanian-deadlift/step-2.png',
    '/assets/images/exercises/generated/romanian-deadlift/step-3.png'
  ],
  'Tibialis Raise': [
    '/assets/images/exercises/generated/tibialis-raise/step-1.png',
    '/assets/images/exercises/generated/tibialis-raise/step-2.png',
    '/assets/images/exercises/generated/tibialis-raise/step-3.png'
  ],
  'Walking Lunge': [
    '/assets/images/exercises/generated/walking-lunge/step-1.png',
    '/assets/images/exercises/generated/walking-lunge/step-2.png',
    '/assets/images/exercises/generated/walking-lunge/step-3.png'
  ],
  'Leg Extension': [
    '/assets/images/exercises/generated/leg-extension/step-1.png',
    '/assets/images/exercises/generated/leg-extension/step-2.png',
    '/assets/images/exercises/generated/leg-extension/step-3.png'
  ],
  'Rope Triceps Pushdown': [
    '/assets/images/exercises/generated/rope-triceps-pushdown/step-1.png',
    '/assets/images/exercises/generated/rope-triceps-pushdown/step-2.png',
    '/assets/images/exercises/generated/rope-triceps-pushdown/step-3.png'
  ],
  'Machine Chest Press': [
    '/assets/images/exercises/generated/machine-chest-press/step-1.png',
    '/assets/images/exercises/generated/machine-chest-press/step-2.png',
    '/assets/images/exercises/generated/machine-chest-press/step-3.png'
  ],
  'Hip-Abduction Machine': [
    '/assets/images/exercises/generated/hip-abduction-machine/step-1.png',
    '/assets/images/exercises/generated/hip-abduction-machine/step-2.png',
    '/assets/images/exercises/generated/hip-abduction-machine/step-3.png'
  ],
  'Step-Up': [
    '/assets/images/exercises/generated/step-up/step-1.png',
    '/assets/images/exercises/generated/step-up/step-2.png',
    '/assets/images/exercises/generated/step-up/step-3.png'
  ],
  'Hack Squat': [
    '/assets/images/exercises/generated/hack-squat/step-1.png',
    '/assets/images/exercises/generated/hack-squat/step-2.png',
    '/assets/images/exercises/generated/hack-squat/step-3.png'
  ],
  'Bulgarian Split Squat': [
    '/assets/images/exercises/generated/bulgarian-split-squat/step-1.png',
    '/assets/images/exercises/generated/bulgarian-split-squat/step-2.png',
    '/assets/images/exercises/generated/bulgarian-split-squat/step-3.png'
  ],
  'Seated Leg Curl': [
    '/assets/images/exercises/generated/seated-leg-curl/step-1.png',
    '/assets/images/exercises/generated/seated-leg-curl/step-2.png',
    '/assets/images/exercises/generated/seated-leg-curl/step-3.png'
  ],
  'Seated or Lying Leg Curl': [
    '/assets/images/exercises/generated/seated-leg-curl/step-1.png',
    '/assets/images/exercises/generated/seated-leg-curl/step-2.png',
    '/assets/images/exercises/generated/seated-leg-curl/step-3.png'
  ],
  'Standing Calf Raise': [
    '/assets/images/exercises/generated/standing-calf-raise/step-1.png',
    '/assets/images/exercises/generated/standing-calf-raise/step-2.png',
    '/assets/images/exercises/generated/standing-calf-raise/step-3.png'
  ],
  'Farmer’s Carry': [
    '/assets/images/exercises/generated/farmers-carry/step-1.png',
    '/assets/images/exercises/generated/farmers-carry/step-2.png',
    '/assets/images/exercises/generated/farmers-carry/step-3.png'
  ],
  // These previous mappings showed unrelated exercises. An empty list intentionally
  // invokes the built-in illustration until a verified photograph is available.
  'Hip Thrust': [
    '/assets/images/exercises/generated/hip-thrust/step-1.png',
    '/assets/images/exercises/generated/hip-thrust/step-2.png',
    '/assets/images/exercises/generated/hip-thrust/step-3.png'
  ],
  'Chest-Supported Row': [
    '/assets/images/exercises/generated/chest-supported-row/step-1.png',
    '/assets/images/exercises/generated/chest-supported-row/step-2.png',
    '/assets/images/exercises/generated/chest-supported-row/step-3.png'
  ],
  'Face Pull': [
    '/assets/images/exercises/generated/face-pull/step-1.png',
    '/assets/images/exercises/generated/face-pull/step-2.png',
    '/assets/images/exercises/generated/face-pull/step-3.png'
  ],
  'Cable Biceps Curl': [
    '/assets/images/exercises/generated/cable-biceps-curl/step-1.png',
    '/assets/images/exercises/generated/cable-biceps-curl/step-2.png',
    '/assets/images/exercises/generated/cable-biceps-curl/step-3.png'
  ],
  'Cable Pull-Through': [
    '/assets/images/exercises/generated/cable-pull-through/step-1.png',
    '/assets/images/exercises/generated/cable-pull-through/step-2.png',
    '/assets/images/exercises/generated/cable-pull-through/step-3.png'
  ],
  'Glute Bridge': [
    '/assets/images/exercises/generated/glute-bridge/step-1.png',
    '/assets/images/exercises/generated/glute-bridge/step-2.png',
    '/assets/images/exercises/generated/glute-bridge/step-3.png'
  ],
  'Side Plank': [
    '/assets/images/exercises/generated/side-plank/step-1.png',
    '/assets/images/exercises/generated/side-plank/step-2.png',
    '/assets/images/exercises/generated/side-plank/step-3.png'
  ]
};

function applyVerifiedMedia(program) {
  if (!program || !Array.isArray(program.days)) return program;
  const result = JSON.parse(JSON.stringify(program));
  result.days.forEach(day => {
    (day.exercises || []).forEach(exercise => {
      if (Object.prototype.hasOwnProperty.call(verifiedMediaByExerciseName, exercise.name)) {
        exercise.media = verifiedMediaByExerciseName[exercise.name];
      }
    });
  });
  return result;
}

// Database helper functions
const db = {
  // Read/write base actions
  read: readDb,
  write: writeAtomic,

  // User Actions
  getUser: (email) => {
    const data = readDb();
    return data.users[email.toLowerCase()];
  },

  createUser: (email, passwordHash, displayName, gender = 'male') => {
    const data = readDb();
    const id = 'usr_' + Math.random().toString(36).substr(2, 9);
    const user = {
      id,
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      gender: gender === 'female' ? 'female' : 'male',
      targetHeartRate: 130,
      unit: 'kg',
      defaultRestTime: 90,
      createdAt: new Date().toISOString()
    };
    data.users[email.toLowerCase()] = user;
    writeAtomic(data);
    return user;
  },

  updateUser: (email, updates) => {
    const data = readDb();
    const key = email.toLowerCase();
    if (data.users[key]) {
      data.users[key] = { ...data.users[key], ...updates };
      writeAtomic(data);
      return data.users[key];
    }
    return null;
  },

  getUsersCount: () => {
    const data = readDb();
    return Object.keys(data.users).length;
  },

  // Program templates
  getProgram: (gender = 'male') => {
    const data = readDb();
    const g = (gender && gender.toLowerCase() === 'female') ? 'program_female' : 'program_male';
    return applyVerifiedMedia(data[g] || data.program_male || data.program);
  },

  saveProgram: (program, userId, username, gender = 'male') => {
    const data = readDb();
    const g = (gender && gender.toLowerCase() === 'female') ? 'program_female' : 'program_male';
    data[g] = program;
    data.changelog.push({
      userId,
      username,
      timestamp: new Date().toISOString(),
      action: `Updated ${gender} workout program configuration`
    });
    writeAtomic(data);
    return data[g];
  },

  resetProgram: (userId, username, gender = 'male') => {
    const data = readDb();
    const defaultData = getDefaultSeedData();
    const g = (gender && gender.toLowerCase() === 'female') ? 'program_female' : 'program_male';
    data[g] = defaultData[g] || defaultData.program_male;
    data.changelog.push({
      userId,
      username,
      timestamp: new Date().toISOString(),
      action: `Restored original ${gender} program template`
    });
    writeAtomic(data);
    return data[g];
  },

  // Schedules
  getSchedule: () => {
    const data = readDb();
    const schedule = data.schedule || {
      currentWeekId: null,
      currentWeek: null,
      completedWeeks: []
    };
    if (!Array.isArray(schedule.completedWeeks)) schedule.completedWeeks = [];
    return schedule;
  },

  saveSchedule: (schedule) => {
    const data = readDb();
    data.schedule = schedule;
    writeAtomic(data);
    return data.schedule;
  },

  // Workout History
  getHistory: () => {
    const data = readDb();
    return data.history;
  },

  addWorkoutToHistory: (workoutLog) => {
    const data = readDb();
    workoutLog.id = 'log_' + Math.random().toString(36).substr(2, 9);
    workoutLog.timestamp = new Date().toISOString();
    data.history.push(workoutLog);
    writeAtomic(data);
    return workoutLog;
  },

  getActiveSession: (userId) => {
    const data = readDb();
    return (data.activeSessions || {})[userId] || null;
  },

  saveActiveSession: (userId, activeWorkout) => {
    const data = readDb();
    if (!data.activeSessions) data.activeSessions = {};
    data.activeSessions[userId] = {
      ...activeWorkout,
      savedAt: new Date().toISOString()
    };
    writeAtomic(data);
    return data.activeSessions[userId];
  },

  clearActiveSession: (userId) => {
    const data = readDb();
    if (data.activeSessions && data.activeSessions[userId]) {
      delete data.activeSessions[userId];
      writeAtomic(data);
    }
  },

  getLatestWorkout: (dayId, userId) => {
    const data = readDb();
    // Filter history for completed exercises by user
    const userWorkouts = data.history.filter(w => w.workoutId === dayId && w.logs && w.logs[userId]);
    if (userWorkouts.length === 0) return null;
    // Return latest completed workout
    return userWorkouts[userWorkouts.length - 1];
  },

  // Measurements
  getMeasurements: (userId) => {
    const data = readDb();
    return data.measurements.filter(m => m.userId === userId);
  },

  addMeasurement: (measurement) => {
    const data = readDb();
    measurement.id = 'meas_' + Math.random().toString(36).substr(2, 9);
    measurement.timestamp = new Date().toISOString();
    data.measurements.push(measurement);
    writeAtomic(data);
    return measurement;
  },

  // Changelogs
  getChangelog: () => {
    const data = readDb();
    return data.changelog;
  },

  addChangelog: (userId, username, action) => {
    const data = readDb();
    data.changelog.push({
      userId,
      username,
      timestamp: new Date().toISOString(),
      action
    });
    writeAtomic(data);
  }
};

function getDefaultFemaleProgramTemplate() {
  const defaultProgram = {
    days: [
      {
        id: "day_1",
        name: "Day 1 — Glutes, Quadriceps, and Core",
        focus: "Glutes, Quadriceps, Hamstrings, Calves, Core",
        treadmill: [
          { id: "t_f_1_1", stage: 1, name: "Easy Walking (Comfortable Incline)", duration: 10, speed: 4.5, incline: 1.5, hrTarget: 100, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_1_2", stage: 2, name: "Moderate Walking (Small Incline)", duration: 20, speed: 5.0, incline: 2.5, hrTarget: 110, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_1_3", stage: 3, name: "Alternating Incline Intervals", duration: 20, speed: 5.2, incline: 4.0, hrTarget: 120, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_1_4", stage: 4, name: "Cool-Down (Gradual Reduction)", duration: 10, speed: 4.0, incline: 1.0, hrTarget: 95, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] }
        ],
        stretches: [
          { id: "s_f_1_1", name: "Hip-Flexor Stretch", duration: 45, sideIndicator: true, muscle: "Hips", description: "Kneel on one knee, hinge forward slightly, squeezing the glute of the trailing leg.", media: ["/assets/images/exercises/stretch_quad_0.jpg", "/assets/images/exercises/stretch_quad_1.jpg"] },
          { id: "s_f_1_2", name: "Standing Quadriceps Stretch", duration: 45, sideIndicator: true, muscle: "Quads", description: "Stand on one leg, hold the opposite ankle, and pull it gently toward your glutes.", media: ["/assets/images/exercises/stretch_quad_0.jpg", "/assets/images/exercises/stretch_quad_1.jpg"] },
          { id: "s_f_1_3", name: "Figure-Four Glute Stretch", duration: 45, sideIndicator: true, muscle: "Glutes", description: "Cross one ankle over the opposite knee, hinge at the hips, and sit back to stretch.", media: ["/assets/images/exercises/stretch_glute_0.jpg", "/assets/images/exercises/stretch_glute_1.jpg"] },
          { id: "s_f_1_4", name: "Hamstring Stretch", duration: 45, sideIndicator: true, muscle: "Hamstrings", description: "Extend one leg forward, hinge at the hips with a flat back, and lean in.", media: ["/assets/images/exercises/stretch_hamstring_0.jpg", "/assets/images/exercises/stretch_hamstring_1.jpg"] },
          { id: "s_f_1_5", name: "Calf Stretch", duration: 45, sideIndicator: true, muscle: "Calves", description: "Step one leg back, keeping the heel on the floor and leaning forward.", media: ["/assets/images/exercises/stretch_calf_0.jpg", "/assets/images/exercises/stretch_calf_1.jpg"] }
        ],
        exercises: [
          {
            id: "ex_f_1_1",
            name: "Hip Thrust",
            targetMuscles: "Glutes, Hamstrings",
            setsCount: 4,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 150,
            defaultStartWeight: 20,
            structureType: "straight",
            instructions: {
              setup: "Sit on the floor with your upper back against a bench. Roll a barbell over your hips.",
              movement: "Drive through your heels to raise your hips until parallel to the floor. Pause at the top.",
              breathing: "Inhale down, exhale as you drive up.",
              commonMistakes: "Extending the lower back excessively, not reaching full extension.",
              safety: "Use a hip pad to cushion the bar. Keep your neck neutral.",
              cues: "Drive through heels, squeeze glutes at top, tuck chin."
            },
            alternatives: ["Glute Bridge", "Dumbbell Hip Thrust"],
            media: ["/assets/images/exercises/ex_1_5_0.jpg", "/assets/images/exercises/ex_1_5_1.jpg"]
          },
          {
            id: "ex_f_1_2",
            name: "Hack Squat",
            targetMuscles: "Quadriceps, Glutes",
            setsCount: 4,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 150,
            defaultStartWeight: 10,
            structureType: "straight",
            instructions: {
              setup: "Position your back flat against the pad and shoulders under the pads. Place feet shoulder-width apart.",
              movement: "Release the safety bars, lower down under control until thighs are parallel, then press back up.",
              breathing: "Inhale down, exhale up.",
              commonMistakes: "Bouncing at the bottom, letting knees cave in.",
              safety: "Do not lock knees out fully at the top.",
              cues: "Keep heels flat, push knees out, control descent."
            },
            alternatives: ["Leg Press", "Goblet Squat"],
            media: ["/assets/images/exercises/ex_1_2_0.jpg", "/assets/images/exercises/ex_1_2_1.jpg"]
          },
          {
            id: "ex_f_1_3",
            name: "Bulgarian Split Squat",
            targetMuscles: "Quadriceps, Glutes, Hamstrings",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 120,
            defaultStartWeight: 0,
            structureType: "straight",
            instructions: {
              setup: "Stand facing away from a bench. Place the top of one foot flat on the bench behind you.",
              movement: "Lower your body until your rear knee is close to the floor, then press back up with your front leg.",
              breathing: "Inhale down, exhale up.",
              commonMistakes: "Leaning too far forward, letting front knee cave inward.",
              safety: "Ensure balance before adding dumbbell weight.",
              cues: "Drive through front heel, chest up, control descent."
            },
            alternatives: ["Reverse Lunge", "Step-Up"],
            media: ["/assets/images/exercises/ex_1_4_0.jpg", "/assets/images/exercises/ex_1_4_1.jpg"]
          },
          {
            id: "ex_f_1_4",
            name: "Walking Lunge",
            targetMuscles: "Quadriceps, Glutes, Hamstrings",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 12,
            restSeconds: 105,
            defaultStartWeight: 0,
            structureType: "straight",
            instructions: {
              setup: "Stand tall with feet together, holding dumbbells or using bodyweight.",
              movement: "Take a step forward and lower your hips until your back knee is just above the floor, then drive up.",
              breathing: "Inhale down, exhale as you step up.",
              commonMistakes: "Step is too short, front knee arches past toes.",
              safety: "Keep torso upright to protect lower back.",
              cues: "Step out wide, keep chest high, control balance."
            },
            alternatives: ["Reverse Lunge"],
            media: ["/assets/images/exercises/ex_1_3_0.jpg", "/assets/images/exercises/ex_1_3_1.jpg"]
          },
          {
            id: "ex_f_1_5",
            name: "Leg Extension",
            targetMuscles: "Quadriceps",
            setsCount: 3,
            repRangeMin: 12,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 15,
            structureType: "superset",
            supersetGroup: "quad_ham_superset",
            instructions: {
              setup: "Sit in the extension machine, adjusting the back pad so your knees align with the pivot point.",
              movement: "Grip handles, extend legs fully, pause briefly, then lower under control.",
              breathing: "Exhale up, inhale down.",
              commonMistakes: "Swinging the weight, lifting hips off the seat.",
              safety: "Do not hyperextend knees at top.",
              cues: "Squeeze quads at top, slow on descent."
            },
            alternatives: ["Sissy Squat"],
            media: ["/assets/images/exercises/ex_1_7_0.jpg", "/assets/images/exercises/ex_1_7_1.jpg"]
          },
          {
            id: "ex_f_1_6",
            name: "Seated Leg Curl",
            targetMuscles: "Hamstrings",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 15,
            structureType: "superset",
            supersetGroup: "quad_ham_superset",
            instructions: {
              setup: "Sit in leg curl machine, place back of ankles against lower roll pad and secure thighs.",
              movement: "Pull heels back towards glutes, squeeze, then return slow to starting position.",
              breathing: "Exhale down, inhale up.",
              commonMistakes: "Jerking the load, incomplete range of motion.",
              safety: "Make sure thigh pad is snug to prevent sliding.",
              cues: "Pull heels back, squeeze hamstrings, resist up."
            },
            alternatives: ["Lying Leg Curl"],
            media: ["/assets/images/exercises/ex_1_6_0.jpg", "/assets/images/exercises/ex_1_6_1.jpg"]
          },
          {
            id: "ex_f_1_7",
            name: "Cable Glute Kickback",
            targetMuscles: "Glutes",
            setsCount: 3,
            repRangeMin: 12,
            repRangeMax: 15,
            restSeconds: 60,
            defaultStartWeight: 5,
            structureType: "straight",
            instructions: {
              setup: "Attach ankle strap to low cable pulley. Stand facing the machine, holding handles for stability.",
              movement: "Kick your leg back and slightly up, squeezing the glute at peak. Return under control.",
              breathing: "Exhale back, inhale forward.",
              commonMistakes: "Arching lower back, using torso swing.",
              safety: "Hold support handles firmly to maintain spinal alignment.",
              cues: "Squeeze glute, kick backward, don't arch lower back."
            },
            alternatives: ["Hip-Abduction Machine"],
            media: ["/assets/images/exercises/ex_f_1_7_0.jpg", "/assets/images/exercises/ex_f_1_7_1.jpg"]
          },
          {
            id: "ex_f_1_8",
            name: "Standing Calf Raise",
            targetMuscles: "Calves",
            setsCount: 3,
            repRangeMin: 12,
            repRangeMax: 20,
            restSeconds: 75,
            defaultStartWeight: 0,
            structureType: "straight",
            instructions: {
              setup: "Stand on the edge of a step, heels hanging off, holding a support.",
              movement: "Press up onto your toes, squeeze calves, then lower heels down below the step.",
              breathing: "Exhale up, inhale down.",
              commonMistakes: "Bouncing at bottom, fast reps without pause.",
              safety: "Hold a wall or bar for balance.",
              cues: "Hold stretch at bottom, squeeze hard at top."
            },
            alternatives: ["Seated Calf Raise"],
            media: ["/assets/images/exercises/ex_1_8_0.jpg", "/assets/images/exercises/ex_1_8_1.jpg"]
          },
          {
            id: "ex_f_1_9",
            name: "Dead Bug",
            targetMuscles: "Core, Abs",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 45,
            defaultStartWeight: 0,
            structureType: "straight",
            instructions: {
              setup: "Lie on your back, arms extended to ceiling, knees bent at 90 degrees.",
              movement: "Slowly lower opposite arm and leg toward floor, keeping lower back pressed into ground. Return and alternate.",
              breathing: "Exhale down, inhale up.",
              commonMistakes: "Lifting lower back off the floor, rushing movement.",
              safety: "Stop if you feel lower back strain.",
              cues: "Ribs down, press lower back into floor, extend long."
            },
            alternatives: ["Bird Dog"],
            media: ["/assets/images/exercises/ex_f_1_9_0.jpg", "/assets/images/exercises/ex_f_1_9_1.jpg"]
          },
          {
            id: "ex_f_1_10",
            name: "Plank",
            targetMuscles: "Abs, Core",
            setsCount: 2,
            repRangeMin: 30,
            repRangeMax: 45,
            restSeconds: 45,
            defaultStartWeight: 0,
            structureType: "time_hold",
            instructions: {
              setup: "Rest on forearms and toes. Keep your body in a straight line.",
              movement: "Squeeze glutes, legs, and abs, holding the static position.",
              breathing: "Breathe deeply and consistently.",
              commonMistakes: "Sagging hips, raising head, holding breath.",
              safety: "Stop if you feel pinching in the lower back.",
              cues: "Tuck pelvis, push elbow into floor, squeeze glutes."
            },
            alternatives: ["Kneeling Plank"],
            media: ["/assets/images/exercises/ex_1_8_0.jpg", "/assets/images/exercises/ex_1_8_1.jpg"]
          }
        ]
      },
      {
        id: "day_2",
        name: "Day 2 — Back, Shoulders, and Arms",
        focus: "Lats, Upper Back, Rear Delts, Side Delts, Biceps, Triceps",
        treadmill: [
          { id: "t_f_2_1", stage: 1, name: "Easy Walking (Comfortable Incline)", duration: 10, speed: 4.5, incline: 1.5, hrTarget: 100, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_2_2", stage: 2, name: "Moderate Walking (Small Incline)", duration: 20, speed: 5.0, incline: 2.5, hrTarget: 110, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_2_3", stage: 3, name: "Alternating Incline Intervals", duration: 20, speed: 5.2, incline: 4.0, hrTarget: 120, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_2_4", stage: 4, name: "Cool-Down (Gradual Reduction)", duration: 10, speed: 4.0, incline: 1.0, hrTarget: 95, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] }
        ],
        stretches: [
          { id: "s_f_2_1", name: "Lat Stretch on Wall", duration: 45, sideIndicator: true, muscle: "Lats", description: "Stand near a wall, place one hand on the wall at shoulder height, hinge hips and sink back.", media: ["/assets/images/exercises/stretch_lat_0.jpg", "/assets/images/exercises/stretch_lat_1.jpg"] },
          { id: "s_f_2_2", name: "Chest & Shoulder Stretch", duration: 45, sideIndicator: false, muscle: "Chest & Shoulders", description: "Interlace fingers behind your back, roll shoulders back, and lift chest up.", media: ["/assets/images/exercises/stretch_chest_0.jpg", "/assets/images/exercises/stretch_chest_1.jpg"] },
          { id: "s_f_2_3", name: "Cross-Body Rear-Shoulder Stretch", duration: 45, sideIndicator: true, muscle: "Rear Delts", description: "Pull one arm across chest using opposite hand, stretching back of shoulder.", media: ["/assets/images/exercises/stretch_doorway_0.jpg", "/assets/images/exercises/stretch_doorway_1.jpg"] },
          { id: "s_f_2_4", name: "Triceps Stretch", duration: 45, sideIndicator: true, muscle: "Triceps", description: "Reach one hand behind neck, pulling the elbow back with the other hand.", media: ["/assets/images/exercises/stretch_overhead_0.jpg", "/assets/images/exercises/stretch_overhead_1.jpg"] },
          { id: "s_f_2_5", name: "Forearm Stretch", duration: 45, sideIndicator: true, muscle: "Forearms", description: "Extend one arm, fingers pointing down, pull back gently on fingers.", media: ["/assets/images/exercises/stretch_calf_0.jpg", "/assets/images/exercises/stretch_calf_1.jpg"] }
        ],
        exercises: [
          {
            id: "ex_f_2_1",
            name: "Neutral-Grip Lat Pulldown",
            targetMuscles: "Lats, Biceps",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 105,
            defaultStartWeight: 20,
            structureType: "straight",
            instructions: {
              setup: "Sit under the pulley, secure thighs under pads, grip neutral handles.",
              movement: "Pull the handles down to upper chest, leading with elbows. Return slow.",
              breathing: "Exhale down, inhale up.",
              commonMistakes: "Using body swing, leaning back excessively.",
              safety: "Release slowly at the top.",
              cues: "Elbows to pockets, squeeze lats, control negative."
            },
            alternatives: ["Assisted Pull-up"],
            media: ["/assets/images/exercises/ex_2_3_0.jpg", "/assets/images/exercises/ex_2_3_1.jpg"]
          },
          {
            id: "ex_f_2_2",
            name: "Chest-Supported Row",
            targetMuscles: "Upper Back, Lats",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 105,
            defaultStartWeight: 15,
            structureType: "straight",
            instructions: {
              setup: "Sit facing row machine pad, rest chest flat against pad, hold handles.",
              movement: "Pull handles back, squeezing shoulder blades together. Return under control.",
              breathing: "Exhale back, inhale forward.",
              commonMistakes: "Lifting chest off pad, shrugging shoulders up.",
              safety: "Do not overextend spine at top.",
              cues: "Squeeze shoulder blades, drive elbows back."
            },
            alternatives: ["Seated Cable Row"],
            media: ["/assets/images/exercises/ex_2_4_0.jpg", "/assets/images/exercises/ex_2_4_1.jpg"]
          },
          {
            id: "ex_f_2_3",
            name: "Machine Shoulder Press",
            targetMuscles: "Front Delts, Triceps",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 105,
            defaultStartWeight: 10,
            structureType: "straight",
            instructions: {
              setup: "Adjust seat so handles are at shoulder height. Sit tall.",
              movement: "Press handles straight overhead, pausing briefly before lowering.",
              breathing: "Exhale up, inhale down.",
              commonMistakes: "Arching lower back, lifting hips.",
              safety: "Keep wrists aligned above elbows.",
              cues: "Core tight, press overhead, slow down."
            },
            alternatives: ["Dumbbell Shoulder Press"],
            media: ["/assets/images/exercises/ex_2_5_0.jpg", "/assets/images/exercises/ex_2_5_1.jpg"]
          },
          {
            id: "ex_f_2_4",
            name: "Machine Lateral Raise",
            targetMuscles: "Side Deltoids",
            setsCount: 3,
            repRangeMin: 12,
            repRangeMax: 20,
            restSeconds: 75,
            defaultStartWeight: 5,
            structureType: "straight",
            instructions: {
              setup: "Sit tall, place forearms against pad, elbows bent.",
              movement: "Raise elbows out to the side until level with shoulders. Lower slowly.",
              breathing: "Exhale up, inhale down.",
              commonMistakes: "Shrugging shoulders, fast swinging.",
              safety: "Stop if you feel shoulder impingement.",
              cues: "Lead with elbows, keep neck relaxed."
            },
            alternatives: ["Cable Lateral Raise", "Dumbbell Lateral Raise"],
            media: ["/assets/images/exercises/ex_2_6_0.jpg", "/assets/images/exercises/ex_2_6_1.jpg"]
          },
          {
            id: "ex_f_2_5",
            name: "Cable Rear-Delt Fly",
            targetMuscles: "Rear Deltoids",
            setsCount: 3,
            repRangeMin: 12,
            repRangeMax: 20,
            restSeconds: 75,
            defaultStartWeight: 5,
            structureType: "superset",
            supersetGroup: "rear_delt_facepull",
            instructions: {
              setup: "Set cables at chest height. Hold opposite cables (left to right, right to left) without handles.",
              movement: "Pull arms out and back in a wide arc, squeezing back of shoulder. Return slowly.",
              breathing: "Exhale out, inhale in.",
              commonMistakes: "Bending elbows too much, shrugging.",
              safety: "Control the eccentric phase.",
              cues: "Squeeze rear delts, keep arms nearly straight."
            },
            alternatives: ["Reverse Machine Flyes"],
            media: ["/assets/images/exercises/ex_2_7_0.jpg", "/assets/images/exercises/ex_2_7_1.jpg"]
          },
          {
            id: "ex_f_2_6",
            name: "Face Pull",
            targetMuscles: "Rear Deltoids, Upper Back",
            setsCount: 3,
            repRangeMin: 12,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 7.5,
            structureType: "superset",
            supersetGroup: "rear_delt_facepull",
            instructions: {
              setup: "Set cable high with rope attachment. Stand back, hold rope ends.",
              movement: "Pull rope towards forehead, parting rope ends and squeezing rear shoulders.",
              breathing: "Exhale pull, inhale return.",
              commonMistakes: "Pulling too low, using upper trap shrugging.",
              safety: "Maintain a stable standing stance.",
              cues: "Pull rope to nose, squeeze back of shoulders."
            },
            alternatives: ["High Row"],
            media: ["/assets/images/exercises/ex_2_8_0.jpg", "/assets/images/exercises/ex_2_8_1.jpg"]
          },
          {
            id: "ex_f_2_7",
            name: "Cable Biceps Curl",
            targetMuscles: "Biceps",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 5,
            structureType: "superset",
            supersetGroup: "bicep_tricep_superset",
            instructions: {
              setup: "Stand facing low cable pulley with straight bar attachment. Grip underhand.",
              movement: "Curl bar upwards, keeping elbows locked at sides. Lower under control.",
              breathing: "Exhale curl, inhale down.",
              commonMistakes: "Elbows moving forward, swinging upper body.",
              safety: "Do not lock out elbows aggressively at bottom.",
              cues: "Elbows glued to ribs, squeeze biceps at top."
            },
            alternatives: ["Dumbbell Curl"],
            media: ["/assets/images/exercises/ex_2_9_0.jpg", "/assets/images/exercises/ex_2_9_1.jpg"]
          },
          {
            id: "ex_f_2_8",
            name: "Rope Triceps Pushdown",
            targetMuscles: "Triceps",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 7.5,
            structureType: "superset",
            supersetGroup: "bicep_tricep_superset",
            instructions: {
              setup: "Stand facing high cable pulley with rope. Grip ends, tuck elbows at 90 degrees.",
              movement: "Press rope downwards, separating rope ends at bottom. Return slow.",
              breathing: "Exhale down, inhale up.",
              commonMistakes: "Elbows flaring, shoulders rolling forward.",
              safety: "Control the weight on the way up.",
              cues: "Lock elbows at sides, pull rope apart at bottom."
            },
            alternatives: ["Cable Overhead Triceps Extension"],
            media: ["/assets/images/exercises/ex_2_10_0.jpg", "/assets/images/exercises/ex_2_10_1.jpg"]
          },
          {
            id: "ex_f_2_9",
            name: "Farmer’s Carry",
            targetMuscles: "Forearms, Core, Posture",
            setsCount: 3,
            repRangeMin: 30,
            repRangeMax: 45,
            restSeconds: 75,
            defaultStartWeight: 10,
            structureType: "time_hold",
            instructions: {
              setup: "Pick up two heavy dumbbells with neutral grip. Stand tall.",
              movement: "Walk in a straight line with slow, deliberate steps, maintaining a tight trunk.",
              breathing: "Breathe shallow and consistent.",
              commonMistakes: "Rolling shoulders forward, looking down, rushing.",
              safety: "Pick up and put down dumbbells with correct leg-bending form.",
              cues: "Shoulders back and down, tight core, steady pace."
            },
            alternatives: ["Suitcase Carry"],
            media: ["/assets/images/exercises/ex_2_11_0.jpg", "/assets/images/exercises/ex_2_11_1.jpg"]
          }
        ]
      },
      {
        id: "day_3",
        name: "Day 3 — Glutes, Hamstrings, and Chest",
        focus: "Glutes, Hamstrings, Chest, Core, Hip Stability",
        treadmill: [
          { id: "t_f_3_1", stage: 1, name: "Easy Walking (Comfortable Incline)", duration: 10, speed: 4.5, incline: 1.5, hrTarget: 100, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_3_2", stage: 2, name: "Moderate Walking (Small Incline)", duration: 20, speed: 5.0, incline: 2.5, hrTarget: 110, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_3_3", stage: 3, name: "Alternating Incline Intervals", duration: 20, speed: 5.2, incline: 4.0, hrTarget: 120, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] },
          { id: "t_f_3_4", stage: 4, name: "Cool-Down (Gradual Reduction)", duration: 10, speed: 4.0, incline: 1.0, hrTarget: 95, media: ["/assets/images/exercises/treadmill_0.jpg", "/assets/images/exercises/treadmill_1.jpg"] }
        ],
        stretches: [
          { id: "s_f_3_1", name: "Hamstring Stretch", duration: 45, sideIndicator: true, muscle: "Hamstrings", description: "Place foot forward, flat back, hinge at hips and lean down.", media: ["/assets/images/exercises/stretch_hamstring_0.jpg", "/assets/images/exercises/stretch_hamstring_1.jpg"] },
          { id: "s_f_3_2", name: "Glute Stretch", duration: 45, sideIndicator: true, muscle: "Glutes", description: "Cross one ankle over opposite thigh, sink back to stretch glutes.", media: ["/assets/images/exercises/stretch_glute_0.jpg", "/assets/images/exercises/stretch_glute_1.jpg"] },
          { id: "s_f_3_3", name: "Hip-Flexor Stretch", duration: 45, sideIndicator: true, muscle: "Hips", description: "Kneel on one knee, lean forward, stretch trailing hip.", media: ["/assets/images/exercises/stretch_quad_0.jpg", "/assets/images/exercises/stretch_quad_1.jpg"] },
          { id: "s_f_3_4", name: "Chest Stretch", duration: 45, sideIndicator: false, muscle: "Chest", description: "Place forearms against wall or doorway and lean forward.", media: ["/assets/images/exercises/stretch_chest_0.jpg", "/assets/images/exercises/stretch_chest_1.jpg"] },
          { id: "s_f_3_5", name: "Adductor Butterfly Stretch", duration: 45, sideIndicator: false, muscle: "Groin/Adductors", description: "Sit with soles of feet together, pull heels in, gently press knees down.", media: ["/assets/images/exercises/stretch_butterfly_0.jpg", "/assets/images/exercises/stretch_butterfly_1.jpg"] },
          { id: "s_f_3_6", name: "Child’s Pose", duration: 45, sideIndicator: false, muscle: "Lats & Lower Back", description: "Kneel, sit back on heels, reach arms forward onto floor.", media: ["/assets/images/exercises/stretch_child_0.jpg", "/assets/images/exercises/stretch_child_1.jpg"] }
        ],
        exercises: [
          {
            id: "ex_f_3_1",
            name: "Romanian Deadlift",
            targetMuscles: "Hamstrings, Glutes",
            setsCount: 4,
            repRangeMin: 6,
            repRangeMax: 10,
            restSeconds: 150,
            defaultStartWeight: 20,
            structureType: "straight",
            instructions: {
              setup: "Stand with feet shoulder-width apart, holding barbell or dumbbells. Keep shoulders back.",
              movement: "Hinge at the hips, pushing them backward. Lower weight along shins until hamstring limit. Drive up.",
              breathing: "Inhale down, exhale up.",
              commonMistakes: "Rounding the back, bending knees too much.",
              safety: "Keep bar close to body. Keep back neutral.",
              cues: "Push hips back, shave your shins, squeeze glutes."
            },
            alternatives: ["Cable Pull-through"],
            media: ["/assets/images/exercises/ex_3_2_0.jpg", "/assets/images/exercises/ex_3_2_1.jpg"]
          },
          {
            id: "ex_f_3_2",
            name: "Glute Bridge",
            targetMuscles: "Glutes",
            setsCount: 4,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 150,
            defaultStartWeight: 15,
            structureType: "straight",
            instructions: {
              setup: "Lie on your back, knees bent, feet flat on the floor close to your hips.",
              movement: "Squeeze glutes and press through heels to lift hips to ceiling. Pause, lower under control.",
              breathing: "Inhale down, exhale up.",
              commonMistakes: "Lifting heels off the ground, hyperextending back.",
              safety: "Add weight to hips only once bodyweight form is stable.",
              cues: "Press heels, tuck hips, squeeze glutes."
            },
            alternatives: ["Hip Thrust"],
            media: ["/assets/images/exercises/ex_f_3_2_0.jpg", "/assets/images/exercises/ex_f_3_2_1.jpg"]
          },
          {
            id: "ex_f_3_3",
            name: "Machine Chest Press",
            targetMuscles: "Chest, Front Delts, Triceps",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 105,
            defaultStartWeight: 15,
            structureType: "straight",
            instructions: {
              setup: "Sit in chest press machine. Adjust handles to chest height. Feet flat.",
              movement: "Press handles forward to full extension under control. Return slowly.",
              breathing: "Exhale forward, inhale back.",
              commonMistakes: "Bouncing weights, shoulder rolling forward.",
              safety: "Select a range of motion comfortable for your shoulders.",
              cues: "Push away, squeeze chest, slow on return."
            },
            alternatives: ["Dumbbell Bench Press"],
            media: ["/assets/images/exercises/ex_f_3_3_0.jpg", "/assets/images/exercises/ex_f_3_3_1.jpg"]
          },
          {
            id: "ex_f_3_4",
            name: "Cable Chest Fly",
            targetMuscles: "Chest",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 7.5,
            structureType: "straight",
            instructions: {
              setup: "Set pulleys to chest height. Hold handles, stand in middle with split stance.",
              movement: "Bring hands together in wide arc in front of chest, squeeze, return slow.",
              breathing: "Exhale together, inhale out.",
              commonMistakes: "Clapping handles, bending elbows excessively.",
              safety: "Control the stretch position.",
              cues: "Hug a tree, squeeze chest, slow on return."
            },
            alternatives: ["Dumbbell Flyes"],
            media: ["/assets/images/exercises/ex_f_3_4_0.jpg", "/assets/images/exercises/ex_f_3_4_1.jpg"]
          },
          {
            id: "ex_f_3_5",
            name: "Seated Leg Curl",
            targetMuscles: "Hamstrings",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 15,
            structureType: "straight",
            instructions: {
              setup: "Sit in leg curl machine, place back of ankles against lower roll pad and secure thighs.",
              movement: "Pull heels back towards glutes, squeeze, then return slow to starting position.",
              breathing: "Exhale down, inhale up.",
              commonMistakes: "Jerking the load, incomplete range of motion.",
              safety: "Make sure thigh pad is snug to prevent sliding.",
              cues: "Pull heels back, squeeze hamstrings, resist up."
            },
            alternatives: ["Lying Leg Curl"],
            media: ["/assets/images/exercises/ex_1_6_0.jpg", "/assets/images/exercises/ex_1_6_1.jpg"]
          },
          {
            id: "ex_f_3_6",
            name: "Cable Pull-Through",
            targetMuscles: "Hamstrings, Glutes",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 75,
            defaultStartWeight: 10,
            structureType: "straight",
            instructions: {
              setup: "Stand facing away from low cable pulley with rope attachment. Grip rope between legs.",
              movement: "Hinge at the hips. Drive hips forward to stand upright, squeezing glutes.",
              breathing: "Inhale hinge back, exhale stand up.",
              commonMistakes: "Pulling with arms, arching lower back.",
              safety: "Maintain a flat back throughout.",
              cues: "Push hips back, squeeze glutes to stand, arm straight."
            },
            alternatives: ["Back Extension"],
            media: ["/assets/images/exercises/ex_1_5_0.jpg", "/assets/images/exercises/ex_1_5_1.jpg"]
          },
          {
            id: "ex_f_3_7",
            name: "Hip-Abduction Machine",
            targetMuscles: "Glutes, Abductors",
            setsCount: 3,
            repRangeMin: 15,
            repRangeMax: 25,
            restSeconds: 60,
            defaultStartWeight: 20,
            structureType: "straight",
            instructions: {
              setup: "Sit in abduction machine, place outer knees against pad, select weight.",
              movement: "Push knees out wide against the pads. Squeeze glutes. Return slowly.",
              breathing: "Exhale out, inhale in.",
              commonMistakes: "Using momentum, fast return.",
              safety: "Sit back completely in the seat.",
              cues: "Push knees wide, squeeze glutes, control return."
            },
            alternatives: ["Band Abductions"],
            media: ["/assets/images/exercises/ex_f_3_7_0.jpg", "/assets/images/exercises/ex_f_3_7_1.jpg"]
          },
          {
            id: "ex_f_3_8",
            name: "Step-Up",
            targetMuscles: "Quadriceps, Glutes, Hamstrings",
            setsCount: 3,
            repRangeMin: 8,
            repRangeMax: 12,
            restSeconds: 105,
            defaultStartWeight: 0,
            structureType: "straight",
            instructions: {
              setup: "Stand in front of a flat box or bench. Place front foot entirely on the step.",
              movement: "Drive through front foot to step up onto the bench, keeping back foot light. Return under control.",
              breathing: "Exhale up, inhale down.",
              commonMistakes: "Pushing off back foot, stepping too high.",
              safety: "Ensure step is secure and stable.",
              cues: "Drive through front heel, control descent, stand tall."
            },
            alternatives: ["Reverse Lunge", "Bulgarian Split Squat"],
            media: ["/assets/images/exercises/ex_f_3_8_0.jpg", "/assets/images/exercises/ex_f_3_8_1.jpg"]
          },
          {
            id: "ex_f_3_9",
            name: "Pallof Press",
            targetMuscles: "Core, Obliques",
            setsCount: 3,
            repRangeMin: 10,
            repRangeMax: 15,
            restSeconds: 50,
            defaultStartWeight: 5,
            structureType: "straight",
            instructions: {
              setup: "Set cable to chest height. Hold handle in both hands, stand sideways to pulley. Pull to chest.",
              movement: "Press handle straight out in front of chest. Hold, resist lateral pull. Return to chest.",
              breathing: "Exhale press, inhale return.",
              commonMistakes: "Leaning, letting cable pull torso.",
              safety: "Maintain a solid stance.",
              cues: "Brace abs, press straight, resist rotation."
            },
            alternatives: ["Woodchoppers"],
            media: ["/assets/images/exercises/ex_f_3_9_0.jpg", "/assets/images/exercises/ex_f_3_9_1.jpg"]
          },
          {
            id: "ex_f_3_10",
            name: "Side Plank",
            targetMuscles: "Core, Obliques",
            setsCount: 2,
            repRangeMin: 20,
            repRangeMax: 40,
            restSeconds: 50,
            defaultStartWeight: 0,
            structureType: "time_hold",
            instructions: {
              setup: "Lie on your side. Lift hips, resting on forearm and side of foot.",
              movement: "Hold body straight, hips elevated, core braced.",
              breathing: "Breathe shallow and consistent.",
              commonMistakes: "Dropping hips, rolling chest down.",
              safety: "Keep elbow directly under shoulder.",
              cues: "Elevate hips, brace abs, side straight."
            },
            alternatives: ["Kneeling Side Plank"],
            media: ["/assets/images/exercises/ex_f_3_10_0.jpg", "/assets/images/exercises/ex_f_3_10_1.jpg"]
          }
        ]
      }
    ]
  };
  return defaultProgram;
}

module.exports = db;
