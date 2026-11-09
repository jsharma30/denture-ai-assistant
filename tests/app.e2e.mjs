// End-to-end test of the browser app in headless Chromium.
// Run from web/:  python3 -m http.server 8080 &  then  node tests/app.e2e.mjs
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1024, height: 1300 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE);

// ---- synthetic test photos, made in the browser (no patient data)
async function makePhoto(kind) {
  const b64 = await page.evaluate(async (kind) => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const g = c.getContext('2d');
    g.fillStyle = kind === 'dark' ? '#050505' : '#b5655b'; g.fillRect(0, 0, 1600, 1200);
    if (kind !== 'dark') {
      for (let i = -7; i <= 7; i++) {
        if (!i) continue;
        const x = 800 + Math.sign(i) * (Math.abs(i) - 0.5) * 80, dx = x - 800;
        const y = 250 + 0.0011 * dx * dx;
        g.fillStyle = '#ece6d8'; g.strokeStyle = '#6d5c4c'; g.lineWidth = 4;
        g.beginPath(); g.roundRect(x - 34, y - 45, 68, 90, 16); g.fill(); g.stroke();
      }
      for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * 1600, Math.random() * 1200, 3, 3); }
      if (kind === 'glare') { g.fillStyle = '#ffffff'; g.fillRect(500, 150, 600, 300); }
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  }, kind);
  const path = `${OUT}${kind}.jpg`;
  writeFileSync(path, Buffer.from(b64, 'base64'));
  return path;
}
const photos = { good: await makePhoto('good'), dark: await makePhoto('dark'), glare: await makePhoto('glare') };

// ---- home + disclaimer
await page.screenshot({ path: `${OUT}01-home.png` });
check((await page.textContent('footer')).includes('should be verified by a qualified prosthodontist'), 'disclaimer shown on every page');

// ---- demo report is clearly labelled
await page.click('text=Open demo report');
check(await page.isVisible('text=DEMO / MOCK OUTPUT'), 'demo report carries DEMO / MOCK label');
check(await page.isVisible('text=built from made-up data'), 'demo report says it is made-up data');
await page.click('text=Show on demo drawing >> nth=0');
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}02-demo.png`, fullPage: true });
await page.click('#nav-home');

// ---- RPD setup
await page.click('[data-start=RPD]');
await page.click('[data-t="14"]'); await page.click('[data-t="15"]');
check(await page.isVisible('text=Kennedy Class III'), 'Kennedy class computed (14,15 → III)');
await page.screenshot({ path: `${OUT}03-setup.png` });
await page.click('#next');
check((await page.$$('.view-item')).length === 5, 'RPD checklist has exactly 5 photos');

// ---- capture: unusable photo is blocked, glare only warns
const views = await page.evaluate(() => import('./engine/index.js').then((E) => E.requiredViews('RPD').map((v) => v.view)));
await page.click(`[data-cap=${views[0]}]`);
await page.setInputFiles('#file', photos.dark);
await page.waitForSelector('#use');
check(await page.isDisabled('#use'), 'almost-black photo → retake required');
check(await page.isVisible('text=Please retake this photo'), 'retake message shown');
await page.setInputFiles('#file', photos.glare);
await page.waitForSelector('text=glare');
check(!(await page.isDisabled('#use')), 'glare photo → warning only, can continue');
await page.screenshot({ path: `${OUT}04-glare.png`, fullPage: true });

// ---- original preserved: displayed image bytes == file bytes
const fileHash = createHash('sha256').update(readFileSync(photos.glare)).digest('hex');
const shown = await page.evaluate(async () => {
  const img = document.querySelector('#cap-stage img');
  const buf = await (await fetch(img.src)).arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return { src: img.src.slice(0, 5), hash: [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('') };
});
check(shown.src === 'blob:' && shown.hash === fileHash, 'photo shown is the byte-identical original file');
await page.click('#orig');
check(await page.isVisible('text=Original photo — unchanged'), '"View original" opens the unchanged photo');
await page.click('.viewer #close');

// ---- use all 5 photos and mark landmarks
async function markView(view) {
  const steps = await page.evaluate((v) => import('./engine/index.js').then((E) =>
    E.annotationSteps(v, window.__app.state.case).map((s) => ({ shape: s.shape, id: s.id, noContact: !!s.allowNoContact }))), view);
  if (!steps.length) return 0;
  await page.waitForSelector('#ann-stage canvas');
  const box = await page.locator('#ann-stage img').boundingBox();
  const at = (fx, fy) => page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
  let n = 0;
  for (const s of steps) {
    if (s.noContact && n % 2) { await page.click('#nocontact'); n++; continue; }
    const fx = 0.1 + (n % 12) * 0.07;
    if (s.shape === 'line2') { await at(fx, 0.2); await at(fx + 0.05, 0.8); }
    else if (s.shape === 'point') await at(fx, 0.5);
    else if (s.shape === 'polyline') { await at(0.2, 0.6); await at(0.3, 0.62); await at(0.4, 0.63); await page.click('#done'); }
    else { await at(fx, 0.45); await at(fx + 0.05, 0.45); await at(fx + 0.025, 0.3); }
    n++;
  }
  return n;
}
let marked = 0;
for (const v of views) {
  if (!(await page.$('#file'))) await page.click(`[data-cap=${v}]`);
  await page.setInputFiles('#file', photos.good);
  await page.waitForSelector('#use:not([disabled])');
  if (v === views[3]) await page.screenshot({ path: `${OUT}05-capture.png`, fullPage: true });
  await page.click('#use');
  marked += await markView(v);
  if (v === views[3]) await page.screenshot({ path: `${OUT}06-marked.png`, fullPage: true });
  await page.waitForSelector('#analyse');
}
check(marked > 20, `landmarks marked across views (${marked} steps)`);
await page.screenshot({ path: `${OUT}07-checklist.png`, fullPage: true });

// ---- AI model: none connected → honest message, no fake result
await page.click('#model');
check(await page.isVisible('text=No trained AI model is connected'), 'no model → honest message, no fake AI result');

// ---- analyse
await page.click('#analyse');
await page.waitForSelector('text=Feedback report');
check(await page.isVisible('text=STUDENT-ANNOTATED'), 'results labelled STUDENT-ANNOTATED');
const statuses = await page.$$eval('.param', (els) => els.map((e) => [...e.classList].find((c) => c.startsWith('s-'))));
check(statuses.length >= 12, `${statuses.length} parameters graded`);
check(statuses.some((s) => s !== 's-INSUFFICIENT'), 'some parameters measured from the marks');
await page.click('[data-show] >> nth=0');
await page.waitForSelector('#res-stage');
await page.screenshot({ path: `${OUT}08-results.png`, fullPage: true });
const after = await page.evaluate(async () => {
  const p = Object.values(window.__app.state.photos)[0];
  const d = await crypto.subtle.digest('SHA-256', await p.file.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('') === p.sha256;
});
check(after, 'photos still byte-identical after marking and analysis');

// ---- progress saved without photos
await page.click('[data-go=progress] >> nth=0');
check(await page.isVisible('text=RPD 14,15'), 'attempt saved to progress');
const stored = await page.evaluate(() => localStorage.getItem('progress'));
check(!/data:image|blob:/.test(stored), 'no photos stored in progress');

// ---- complete denture path opens with 3 photos
await page.click('#nav-home');
await page.click('[data-start=CD]');
check((await page.$$('.view-item')).length === 3, 'CD checklist has 3 photos');

// ---- phone width: no horizontal scroll
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#nav-home');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check(!overflow, 'no horizontal scrolling at phone width');
await page.screenshot({ path: `${OUT}09-phone.png`, fullPage: true });

check(errors.length === 0, `no browser errors ${errors.length ? JSON.stringify(errors) : ''}`);
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
