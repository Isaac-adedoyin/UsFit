const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TIME_ZONE = process.env.USFIT_TIMEZONE || 'Europe/Budapest';
function dateForDay(weekId, day) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId || '');
  if (!match || !DAY_ORDER.includes(day)) return null;
  const year = Number(match[1]), week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year,0,4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay()+6)%7 + (week-1)*7);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate()+3);
  if (thursday.getUTCFullYear() !== year) return null;
  monday.setUTCDate(monday.getUTCDate()+DAY_ORDER.indexOf(day));
  return monday.toISOString().slice(0,10);
}
function todayInZone(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function workoutAccess(schedule, userId, workoutId, scheduledDay, now = new Date(), allowEarly = true) {
  const week = schedule?.currentWeek;
  const day = week?.days?.[scheduledDay];
  const date = week && dateForDay(week.weekId, scheduledDay);
  if (!day || day.workoutId !== workoutId || !date || day.rescheduledTo) return {allowed:false,error:'This workout is not on the current schedule.'};
  if (!allowEarly && date !== todayInZone(now)) return {allowed:false,date,error:`This workout is scheduled for ${date}.`};
  if ((day.userStatuses?.[userId] || day.status) === 'Completed') return {allowed:false,date,error:'You have already completed this scheduled workout.'};
  return {allowed:true,date};
}
module.exports = { DAY_ORDER, TIME_ZONE, dateForDay, todayInZone, workoutAccess };
