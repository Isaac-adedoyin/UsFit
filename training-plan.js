// UsFit's own programming. References support technique, not endorsement of this plan.
const VERSION = 'couples-3day-2026-09-v1';
const source = (slug, note = '') => ({ provider: 'StrengthLog', url: `https://www.strengthlog.com/${slug}/`, note, checkedAt: '2026-09-30' });
const references = {
  'Hip Thrust': source('hip-thrust'),
  'Hack Squat': source('hack-squat-machine'),
  'Bulgarian Split Squat': source('bulgarian-split-squat'),
  'Romanian Deadlift': source('romanian-deadlift'),
  'Seated Leg Curl': source('seated-leg-curl'),
  'Hip-Abduction Machine': source('hip-abduction-machine'),
  'Plank': source('plank'),
  'Side Plank': source('side-plank'),
  'Machine Chest Press': source('machine-chest-press'),
  'Machine Shoulder Press': source('machine-shoulder-press'),
  'Machine Lateral Raise': source('machine-lateral-raise'),
  'Neutral-Grip Lat Pulldown': source('lat-pulldown-with-neutral-grip'),
  'Chest-Supported Machine Row': source('best-machine-exercises', 'See Seated Row → Seated Machine Row. Use the chest-supported machine variation.'),
  'Barbell Curl': source('barbell-curl'),
  'Rope Triceps Pushdown': source('tricep-pushdown-with-rope'),
  'Standing Calf Raise': source('strength-training-for-runners', 'See Standing Calf Raises. Use a stable support and controlled range.'),
  'Cable Crunch': source('cable-crunch'),
  'Leg Press': source('leg-press')
};
const specs = {
  female: [
    ['Glutes & quads', 'Build glutes and legs, with a short core finish.', [['Hip Thrust',3,8,12,150],['Hack Squat',3,8,12,150],['Bulgarian Split Squat',2,8,12,120],['Seated Leg Curl',3,10,15,90],['Standing Calf Raise',2,10,15,75],['Plank',2,30,45,60]]],
    ['Upper body & glute support', 'Balanced upper-body strength with a small glute accessory block.', [['Neutral-Grip Lat Pulldown',3,8,12,120],['Machine Chest Press',3,8,12,120],['Chest-Supported Machine Row',3,8,12,120],['Machine Lateral Raise',2,12,20,75],['Hip-Abduction Machine',2,15,20,75],['Barbell Curl',2,10,15,75],['Rope Triceps Pushdown',2,10,15,75]]],
    ['Glutes & hamstrings', 'Hip-hinge strength, glute growth and core control.', [['Romanian Deadlift',3,8,10,180],['Hip Thrust',3,10,12,150],['Seated Leg Curl',3,10,15,90],['Hip-Abduction Machine',2,15,20,75],['Machine Chest Press',2,10,15,90],['Side Plank',2,20,40,60],['Cable Crunch',2,10,15,75]]]
  ],
  male: [
    ['Back, shoulders & biceps', 'Build back width, shoulder size and stronger arms.', [['Neutral-Grip Lat Pulldown',3,8,12,120],['Chest-Supported Machine Row',3,8,12,120],['Machine Shoulder Press',3,8,12,120],['Machine Lateral Raise',3,12,20,75],['Barbell Curl',3,8,12,90],['Machine Chest Press',3,8,12,120],['Plank',2,30,45,60]]],
    ['Legs & abs', 'Build balanced legs and train your core with control.', [['Hack Squat',3,8,12,180],['Romanian Deadlift',3,8,10,180],['Bulgarian Split Squat',2,8,12,120],['Seated Leg Curl',3,10,15,90],['Standing Calf Raise',3,10,15,75],['Cable Crunch',3,10,15,75],['Side Plank',2,20,40,60]]],
    ['Upper body & arm focus', 'A second back, shoulder and biceps session, with chest and triceps balance.', [['Chest-Supported Machine Row',3,8,12,120],['Machine Chest Press',3,8,12,120],['Neutral-Grip Lat Pulldown',3,10,12,120],['Machine Lateral Raise',3,12,20,75],['Barbell Curl',3,10,15,90],['Rope Triceps Pushdown',3,10,15,75],['Cable Crunch',2,10,15,75]]]
  ]
};
function buildProgram(male, female, gender) {
  const original = gender === 'female' ? female : male;
  const pool = [...original.days, ...male.days, ...female.days].flatMap(d => d.exercises);
  const clone = name => JSON.parse(JSON.stringify(pool.find(ex => ex.name === name)));
  const make = name => {
    if (name === 'Chest-Supported Machine Row') return { ...clone('Chest-Supported Row'), id: 'machine_row_v1', name,
      instructions: { setup: 'Set the seat and chest pad so you can reach the handles without lifting your chest.', movement: 'Pull the handles toward your ribs with your chest supported. Let your arms lengthen slowly on the return.', breathing: 'Breathe out as you pull; in as you return.', commonMistakes: 'Lifting off the pad or shrugging to finish the pull.', safety: 'Keep a comfortable shoulder range and reduce load if control slips.', cues: 'Chest stays down. Elbows travel back.' } };
    if (name === 'Barbell Curl') return { ...clone('EZ-Bar Preacher Curl'), id: 'barbell_curl_v1', name,
      instructions: { setup: 'Stand balanced with an underhand grip on a bar, hands roughly shoulder-width apart.', movement: 'Bend your elbows to raise the bar without swinging your trunk. Lower it steadily.', breathing: 'Exhale on the curl, inhale on the return.', commonMistakes: 'Leaning back or throwing the elbows behind you.', safety: 'Choose a comfortable grip and a load you can lower smoothly.', cues: 'Quiet body. Move at the elbows.' } };
    if (name === 'Cable Crunch') return { ...clone('Plank'), id: 'cable_crunch_v1', name, isTimed: false, targetMuscles: 'Abdominals',
      instructions: { setup: 'Attach a rope to a high pulley. Kneel facing it with the rope beside your head.', movement: 'Curl your ribs toward your pelvis, then return slowly. Keep the movement in your trunk rather than pulling with your arms.', breathing: 'Exhale as you curl; inhale on the return.', commonMistakes: 'Rocking the hips or pulling down with the arms.', safety: 'Use a controlled, comfortable range and light load to learn the movement.', cues: 'Ribs toward pelvis. Arms stay quiet.' } };
    if (name === 'Leg Press') return { ...clone('Hack Squat'), id: 'leg_press_v1', name,
      instructions: { setup: 'Adjust the seat and safety stops. Keep your feet about shoulder-width apart on the platform.', movement: 'Lower the platform while keeping your pelvis and back against the pad, then press smoothly away.', breathing: 'Inhale as you lower; exhale as you press.', commonMistakes: 'Lowering until the pelvis lifts or bouncing at the bottom.', safety: 'Use the safety stops and keep your heels on the platform.', cues: 'Back on the pad. Push through the whole foot.' } };
    return clone(name);
  };
  const catalog = Object.keys(references).map(name => {
    const ex = make(name);
    return { ...ex, name, media: [], source: references[name], alternatives: [], defaultStartWeight: null,
      isTimed: ['Plank','Side Plank'].includes(name), perSide: ['Bulgarian Split Squat','Side Plank'].includes(name) };
  });
  const alternativeNames = {
    'Hack Squat': ['Leg Press'], 'Leg Press': ['Hack Squat'],
    'Hip Thrust': ['Romanian Deadlift'], 'Romanian Deadlift': ['Hip Thrust'],
    'Bulgarian Split Squat': ['Leg Press'],
    'Plank': ['Side Plank'], 'Side Plank': ['Plank'], 'Cable Crunch': ['Plank']
  };
  catalog.forEach(ex => { ex.alternativeExercises = (alternativeNames[ex.name] || []).map(name => {
    const alt = JSON.parse(JSON.stringify(catalog.find(e => e.name === name)));
    delete alt.alternativeExercises;
    if (alt.isTimed) { alt.repRangeMin = 20; alt.repRangeMax = 40; }
    return alt;
  }); ex.alternatives = (alternativeNames[ex.name] || []); });
  return { ...original, planVersion: VERSION, goal: gender === 'female' ? 'Glute growth · balanced strength · core control' : 'Back & shoulder size · bigger arms · balanced legs',
    guidance: 'Finish most sets with 1–3 good reps still possible. Add reps first; when every set reaches the top of its range with controlled form, try the smallest weight increase. Warm-up sets do not count as working sets.',
    days: specs[gender].map(([title, focus, exercises], index) => {
      const stretchDay = gender === 'male' ? original.days[[1,2,0][index]] : original.days[index];
      return { ...original.days[index], name: `Day ${index + 1} — ${title}`, focus, estimatedMinutes: '75–110',
        stretches: stretchDay.stretches,
        treadmill: [{ id: `warmup_${index}`, stage: 1, name: 'Easy conversational walk', duration: 8, speed: 4, incline: 0, hrTarget: null }],
        exercises: exercises.map(([name, setsCount, repRangeMin, repRangeMax, restSeconds]) => ({
          ...JSON.parse(JSON.stringify(catalog.find(ex => ex.name === name))), setsCount, repRangeMin, repRangeMax, restSeconds
        })) };
    }) };
}
module.exports = { VERSION, buildProgram, references };
