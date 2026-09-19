import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
const shots = process.argv[2] ?? '/tmp';
const log = (...a) => console.log('·', ...a);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

async function signIn(email) {
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', 'password');
  await Promise.all([page.waitForURL(/\/(app|search|admin)/, { timeout: 15000 }), page.click('button[type=submit]')]);
  log('signed in as', email, '->', new URL(page.url()).pathname);
}

// --- venue: search, profile, inquiry -------------------------------------
await signIn('penthouse@encore.test');

await page.goto(`${BASE}/search?gigType=one_time&city=dubai&date=2026-12-31`, { waitUntil: 'networkidle' });
const oneOff = await page.locator('.act-card__name').allInnerTexts();
log('one-off Dubai 31 Dec:', oneOff.join(', '));
await page.screenshot({ path: `${shots}/01-search.png` });

await page.goto(`${BASE}/search?gigType=long_term&months=6`, { waitUntil: 'networkidle' });
log('residency, anywhere:', (await page.locator('.act-card__name').allInnerTexts()).join(', '));

await page.goto(`${BASE}/entertainers/the-amber-quartet`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${shots}/02-profile.png`, fullPage: false });

// Live quote in the booking panel.
await page.selectOption('#months', '6').catch(() => {});
const quoteBefore = await page.locator('aside .title').first().innerText();
log('residency quote shown:', quoteBefore.replace(/\s+/g, ' '));

// Switch to a one-off on a special date and watch the quote change.
await page.click('button:has-text("One-off")');
await page.fill('#startDate', '2026-12-31');
await page.selectOption('#timeBlock', 'late_night');
await page.fill('#hours', '4');
await page.waitForTimeout(300);
const panel = await page.locator('aside .card').first().innerText();
log('NYE quote panel:', panel.replace(/\s+/g, ' ').slice(0, 160));
await page.screenshot({ path: `${shots}/03-inquiry-panel.png` });

await page.fill('#eventType', 'NYE rooftop');
await Promise.all([
  page.waitForURL(/\/app\/inquiries\//, { timeout: 20000 }),
  page.click('button:has-text("Send inquiry")'),
]);
const inquiryUrl = page.url();
log('inquiry created:', new URL(inquiryUrl).pathname);
await page.fill('textarea[name=body]', 'Four hours, 21:00 start, 180 covers.');
await page.click('.composer button[type=submit]');
await page.waitForTimeout(800);
log('thread messages:', await page.locator('.bubble').count());
await page.screenshot({ path: `${shots}/04-inquiry.png` });

// --- entertainer: see it, counter, confirm -------------------------------
await page.click('form[action="/api/signout"] button');
await page.waitForTimeout(500);
await signIn('amber@encore.test');
await page.goto(`${BASE}/app/inquiries`, { waitUntil: 'networkidle' });
log('entertainer inquiries visible:', await page.locator('.listing__item').count());
await page.goto(inquiryUrl, { waitUntil: 'networkidle' });
log('status after the act opens it:', await page.locator('.pill').first().innerText());

await page.click('.row button:has-text("Accept")');
await page.click('form.card button[type=submit]');
await page.waitForTimeout(1500);
log('status after accepting:', await page.locator('.pill').first().innerText());
await page.click('.row button:has-text("Confirm booking")');
await page.click('form.card button[type=submit]');
await page.waitForTimeout(1800);
log('status after confirming:', await page.locator('.pill').first().innerText());
await page.screenshot({ path: `${shots}/05-confirmed.png` });

await page.goto(`${BASE}/app/calendar`, { waitUntil: 'networkidle' });
const held = await page.locator('.listing__item:has-text("Held by a booking")').count();
log('calendar entries held by a booking:', held);
await page.screenshot({ path: `${shots}/06-calendar.png` });

await page.goto(`${BASE}/app/rates`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${shots}/07-rates.png` });

// The act should now be gone from a one-off search on that date.
await page.goto(`${BASE}/search?gigType=one_time&city=dubai&date=2026-12-31`, { waitUntil: 'networkidle' });
const after = await page.locator('.act-card__name').allInnerTexts();
log('one-off 31 Dec after confirming:', after.join(', '));
log('Amber Quartet still listed?', after.includes('The Amber Quartet'));

// --- admin ---------------------------------------------------------------
await page.click('form[action="/api/signout"] button');
await page.waitForTimeout(500);
await signIn('admin@encore.test');
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
log('review queue:', (await page.locator('.card .subtitle').allInnerTexts()).join(', '));
await page.screenshot({ path: `${shots}/08-admin.png` });

// Light theme check.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/09-home-light.png` });

console.log(errors.length ? `\nPAGE ERRORS:\n${errors.join('\n')}` : '\nNo page or console errors.');
await browser.close();
