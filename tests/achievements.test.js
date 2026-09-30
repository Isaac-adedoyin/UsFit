const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getAchievements,isoWeek}=require('../achievements');
const now=new Date('2026-09-30T12:00:00Z');
const fixture=()=>({users:{a:{id:'a',displayName:'A'},b:{id:'b',displayName:'B'}},history:[]});
function week(data,weekId,startTime,ids=['a','b']) { for(const id of ids)for(let i=1;i<=3;i++)data.history.push({workoutId:`day_${i}`,scheduledWeekId:weekId,startTime,completedByUserId:id,logs:{[id]:{} }}); }
test('ISO weeks cross calendar years correctly',()=>{assert.equal(isoWeek('2021-01-01'),'2020-W53');assert.equal(isoWeek('2025-12-29'),'2026-W01');});
test('both members required; current unfinished week has grace, missed week breaks streak',()=>{
 const d=fixture();week(d,'2026-W38','2026-09-15T12:00:00Z');week(d,'2026-W39','2026-09-22T12:00:00Z');week(d,'2026-W40','2026-09-29T12:00:00Z',['a']);
 const result=getAchievements(d,now);assert.equal(result.streak,2);assert.equal(result.bestStreak,2);assert.equal(result.perfectWeeks,2);assert.deepEqual(result.members.map(m=>m.completed),[3,0]);
 assert.equal(getAchievements(d,new Date('2026-10-06T12:00:00Z')).streak,0);
});
test('duplicate logs, other-member logs and timed sets cannot inflate totals',()=>{
 const d=fixture();const log={workoutId:'day_1',startTime:'2026-09-29T12:00:00Z',completedByUserId:'a',weightUnit:'lbs',timedExerciseIds:['hold'],logs:{a:{curl:[{weight:100,reps:10,completed:true},{weight:999,reps:99,completed:false}],hold:[{weight:999,reps:99,completed:true}]},b:{curl:[{weight:999,reps:99,completed:true}]}},treadmillData:{a:{distance:5},b:{distance:99}}};d.history.push(log,log);
 const result=getAchievements(d,now);assert.equal(result.volumeKg,454);assert.equal(result.totalSessions,1);assert.equal(result.distanceKm,5);
});
test('legacy shared completion alone does not award a couples week',()=>{const d=fixture();d.schedule={completedWeeks:[{weekId:'2026-W39',days:{Monday:{workoutId:'day_1',status:'Completed'}}}]};assert.equal(getAchievements(d,now).perfectWeeks,0);});
test('every demonstration file exists locally',()=>{const fs=require('node:fs'),path=require('node:path');for(const demo of Object.values(require('../exercise-media.json')))for(const image of demo.images)assert.ok(fs.statSync(path.join(__dirname,'../public',image)).size>100);});
