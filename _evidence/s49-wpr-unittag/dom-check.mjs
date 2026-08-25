import { chromium } from 'playwright'; import fs from 'node:fs';
const sm = JSON.parse(fs.readFileSync('_evidence/s49-wpr-unittag/summary.json','utf8')); const tagged = new Set(sm.tagged_rows.map(t => t.pk));
const b = await chromium.launch(); const ctx = await b.newContext();
async function run(page, onlyTagged) { const p = await ctx.newPage(); await p.addInitScript(() => { let s = 42; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; });
  if (onlyTagged) await p.route('**/tours-data.json', async r => { const j = await (await r.fetch()).json(); j.tours = j.tours.filter(t => tagged.has(t.pk)); await r.fulfill({ json: j }); });
  await p.goto(`http://localhost:8933/${page}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const e = [...document.querySelectorAll('.tour-price')]; return { cards: e.length, smalls: document.querySelectorAll('.tour-price small').length, from: e.filter(x => x.firstChild && x.firstChild.textContent.startsWith('From $')).length, sample: e.slice(0,3).map(x => x.innerText.replace(/\n/g,' | ')), smallCss: (s => s ? getComputedStyle(s).display + ' ' + getComputedStyle(s).fontSize : null)(document.querySelector('.tour-price small')), basis: document.querySelectorAll('.tour-price-basis').length }; });
  await p.close(); return r; }
console.log('index.html (route: ONLY the 180 tagged rows, seeded draw):', JSON.stringify(await run('index.html', true)));
console.log('index.html (real data, seeded draw):', JSON.stringify(await run('index.html', false)));
console.log('el-yunque.html (real data):', JSON.stringify(await run('el-yunque.html', false)));
await b.close();
