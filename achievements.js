const { todayInZone, dateForDay } = require('./schedule-dates');
function isoWeek(date) {
  const d=new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate()+3-(d.getUTCDay()+6)%7);
  const year=d.getUTCFullYear();
  const first=new Date(Date.UTC(year,0,4,12));
  const week=1+Math.round(((d-first)/86400000-3+(first.getUTCDay()+6)%7)/7);
  return `${year}-W${String(week).padStart(2,'0')}`;
}
function getAchievements(data, now=new Date()) {
  const members=Object.values(data.users || {}).slice(0,2);
  const ids=members.map(m=>m.id);
  const currentWeek=isoWeek(todayInZone(now));
  const currentMonday=dateForDay(currentWeek,'Monday');
  const weeks=new Map(); const seen=new Set();
  let volumeKg=0,distanceKm=0,totalSessions=0;
  const number=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):0;
  const getWeek=w=>{if(!weeks.has(w))weeks.set(w,Object.fromEntries(ids.map(id=>[id,new Set()])));return weeks.get(w);};
  for(const workout of data.history || []) {
    if (!Number.isFinite(Date.parse(workout.startTime)) || Date.parse(workout.startTime)>now.getTime()) continue;
    const week=workout.scheduledWeekId || isoWeek(todayInZone(new Date(workout.startTime)));
    if (!dateForDay(week,'Monday') || dateForDay(week,'Monday')>currentMonday) continue;
    for(const id of ids) {
      if (!workout.logs?.[id] || (workout.completedByUserId && workout.completedByUserId!==id)) continue;
      const key=`${id}:${workout.workoutId}:${workout.startTime}`;
      if(seen.has(key))continue; seen.add(key);totalSessions++;
      if(['day_1','day_2','day_3'].includes(workout.workoutId))getWeek(week)[id].add(workout.workoutId);
      const factor=workout.weightUnit==='lbs'?0.45359237:1;
      for(const [exercise,sets] of Object.entries(workout.logs[id])) {
        if(workout.timedExerciseIds?.includes(exercise) || /plank|carry|hold/i.test(workout.exerciseNames?.[exercise] || ''))continue;
        if(!Array.isArray(sets))continue;
        for(const set of sets)if(set.completed)volumeKg+=number(set.weight)*number(set.reps)*factor;
      }
      distanceKm+=number(workout.treadmillData?.[id]?.distance);
    }
  }
  // Closed legacy weeks retain their actual per-member completion evidence.
  for(const week of data.schedule?.completedWeeks || []) {
    if(!dateForDay(week.weekId,'Monday') || dateForDay(week.weekId,'Monday')>currentMonday)continue;
    for(const day of Object.values(week.days || {}))for(const id of ids) {
      if(day.userStatuses?.[id]==='Completed' && ['day_1','day_2','day_3'].includes(day.workoutId))getWeek(week.weekId)[id].add(day.workoutId);
    }
  }
  const perfect=[...weeks].filter(([,counts])=>ids.length===2 && ids.every(id=>counts[id].size===3)).map(([w])=>dateForDay(w,'Monday')).sort();
  const complete=new Set(perfect); let best=0,run=0,previous=null;
  for(const monday of perfect){run=previous && (Date.parse(monday)-Date.parse(previous))===604800000?run+1:1;best=Math.max(best,run);previous=monday;}
  let cursor=new Date(currentMonday+'T12:00:00Z');
  if(!complete.has(currentMonday))cursor.setUTCDate(cursor.getUTCDate()-7);
  let streak=0;
  while(complete.has(cursor.toISOString().slice(0,10))){streak++;cursor.setUTCDate(cursor.getUTCDate()-7);}
  const current=getWeek(currentWeek);
  const badge=(id,title,description,value,target,icon)=>({id,title,description,value:Math.round(value*10)/10,target,earned:value>=target,progress:Math.min(100,Math.floor(value/target*100)),icon});
  return {streak,bestStreak:best,perfectWeeks:perfect.length,currentWeek,volumeKg:Math.round(volumeKg),distanceKm:Math.round(distanceKm*10)/10,totalSessions,
    members:members.map(m=>({id:m.id,name:m.displayName,completed:current[m.id].size,target:3})),
    badges:[badge('perfect-week','Perfect attendance','Both complete all 3 sessions in one calendar week.',perfect.length,1,'★'),badge('four-weeks','Better together','Complete 4 consecutive perfect weeks.',best,4,'🔥'),badge('ten-sessions','Showing up','Complete 10 sessions between you.',totalSessions,10,'✓'),badge('ten-tonnes','10-tonne team','Lift 10,000 kg of combined working-set volume.',volumeKg,10000,'🏋'),badge('hundred-km','100 km club','Log 100 km on the treadmill together.',distanceKm,100,'↗')]};
}
module.exports={getAchievements,isoWeek};
