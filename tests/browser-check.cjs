// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.USFIT_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'usfit-browser-'));
process.env.USFIT_PASSPHRASE='browser-test-only';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const app=require('../server'),db=require('../db');
const {dateForDay,todayInZone,DAY_ORDER}=require('../schedule-dates');
const today=todayInZone(),year=Number(today.slice(0,4));
const weekId=[year-1,year,year+1].flatMap(y=>Array.from({length:53},(_,i)=>`${y}-W${String(i+1).padStart(2,'0')}`)).find(w=>DAY_ORDER.some(d=>dateForDay(w,d)===today));
const dayName=DAY_ORDER.find(d=>dateForDay(weekId,d)===today);
db.saveSchedule({currentWeek:{weekId,days:{[dayName]:{workoutId:'day_1',status:'Upcoming',userStatuses:{usr_isaac:'Upcoming',usr_mary:'Upcoming'}}}},completedWeeks:[]});
(async()=>{
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const base=`http://127.0.0.1:${server.address().port}`;
 const errors=[];
 for (const [email,expected,owner] of [['okonmary1502@gmail.com','Hip Thrust','usr_mary'],['ibright053@gmail.com','Neutral-Grip Lat Pulldown','usr_isaac']]) {
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['notifications']});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'Test skip':undefined));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#auth-email').fill(email);await page.locator('#auth-email').blur();await page.locator('#auth-passphrase').fill('browser-test-only');await page.locator('#auth-submit-btn').click();await page.locator('#dashboard-view').waitFor({state:'visible'});
 for(const width of [390,1280]) {
 await page.setViewportSize({width,height:844});
 for(const view of ['dashboard','planner','program','progress','settings']) {
 await page.locator(`[data-view="${view}"]`).click();await page.waitForTimeout(120);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${owner} ${view} overflow at ${width}`);
 }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#test-notif-btn').click();
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r && (await r.getNotifications()).some(n=>n.title.includes('Test Reminder'));});
 console.log('PASS',owner,'mobile/desktop navigation and service-worker notification');
 await page.locator('[data-view="dashboard"]').click();
 await page.locator('.milestone-details summary').click();await page.locator('.milestone-badge').first().waitFor();assert.equal(await page.locator('.milestone-badge').count(),5);
 assert.ok((await page.locator('#today-workout-panel').textContent()).includes(String(year)));
 await page.locator('#dashboard-start-workout-btn').click();await page.locator('#readiness-form button[type="submit"]').click();
 await page.locator('#phase-treadmill').waitFor({state:'visible'});
 await page.waitForTimeout(1200);const running=await page.locator('#treadmill-timer-clock').textContent();assert.notEqual(running,'08:00');
 await page.locator('#treadmill-pause-btn').click();const paused=await page.locator('#treadmill-timer-clock').textContent();await page.waitForTimeout(1200);assert.equal(await page.locator('#treadmill-timer-clock').textContent(),paused);
 await page.locator('#complete-warmup-btn').click();assert.equal(await page.locator('#workout-ex-name').textContent(),expected);
 const source=page.locator('#workout-ex-media .technique-link');assert.ok((await source.getAttribute('href')).startsWith('https://www.strengthlog.com/'));
 await page.waitForFunction(()=>document.querySelector('.exercise-demo-photo')?.naturalWidth > 0);
 const initialPhoto=await page.locator('.exercise-demo-photo').getAttribute('src');await page.locator('.demo-next').click();assert.notEqual(await page.locator('.exercise-demo-photo').getAttribute('src'),initialPhoto);
 await page.locator('.input-weight').first().fill('12.5');await page.locator('.input-reps').first().fill('10');await page.locator('.btn-check-done').first().click();
 const rest=await page.locator('#rest-timer-clock').textContent();await page.waitForTimeout(1200);assert.notEqual(await page.locator('#rest-timer-clock').textContent(),rest);
 await page.waitForTimeout(500);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#resume-banner-btn').click();
 assert.equal(await page.locator('.input-weight').first().inputValue(),'12.5');assert.ok((await page.locator('.btn-check-done').first().getAttribute('class')).includes('checked'));
 await page.waitForTimeout(500);
 await page.screenshot({animations:'disabled',path:path.join(process.env.USFIT_DATA_DIR,`${owner}-workout.png`),fullPage:true});
 for(let i=0;i<10 && await page.locator('#phase-strength').isVisible();i++) {
 if(await page.locator('#exercise-work-timer-box').isVisible()) {
 await page.locator('#work-timer-toggle').click();const before=await page.locator('#work-timer-clock').textContent();await page.waitForTimeout(1200);assert.notEqual(await page.locator('#work-timer-clock').textContent(),before);
 }
 await page.locator('#save-exercise-sets-btn').click();
 }
 await page.locator('#skip-stretching-btn').click();await page.locator('#session-summary-notes').fill('Browser verified');await page.locator('#save-session-btn').click();
 await page.locator('#dashboard-view').waitFor({state:'visible'});
 await page.locator('[data-view="progress"]').click();await page.locator('#history-search').fill('Browser verified');await page.locator('.history-session').first().waitFor();
 assert.equal(db.getHistory().filter(w=>w.completedByUserId===owner).length,1);
 console.log('PASS',owner,'warm-up pause, rest timer, reload recovery, hold timer, completion, history');
 await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS no browser JavaScript errors. Screenshots:',process.env.USFIT_DATA_DIR);
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
