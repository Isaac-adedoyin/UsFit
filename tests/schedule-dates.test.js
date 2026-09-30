const {test}=require('node:test');
const assert=require('node:assert/strict');
const {dateForDay,workoutAccess}=require('../schedule-dates');
test('ISO calendar dates include Sunday and cross-year weeks correctly',()=>{
 assert.equal(dateForDay('2026-W40','Monday'),'2026-09-28');
 assert.equal(dateForDay('2026-W40','Sunday'),'2026-10-04');
 assert.equal(dateForDay('2026-W01','Monday'),'2025-12-29');
 assert.equal(dateForDay('2025-W53','Monday'),null);
});
test('sessions unlock only on their exact date, including when already in progress',()=>{
 const schedule={currentWeek:{weekId:'2026-W40',days:{Wednesday:{workoutId:'day_1',userStatuses:{mary:'In progress'}}}}};
 assert.equal(workoutAccess(schedule,'mary','day_1','Wednesday',new Date('2026-09-30T12:00:00Z')).allowed,true);
 for(const time of ['2026-09-29T12:00:00Z','2026-10-01T12:00:00Z','2026-10-07T12:00:00Z']) assert.equal(workoutAccess(schedule,'mary','day_1','Wednesday',new Date(time)).allowed,false);
 assert.equal(workoutAccess(schedule,'mary','day_2','Wednesday',new Date('2026-09-30T12:00:00Z')).allowed,false);
});
