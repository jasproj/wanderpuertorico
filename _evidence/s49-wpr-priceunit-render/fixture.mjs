import { chromium } from 'playwright';
const [appPage] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
async function read(port, page, inject) {
  const p = await ctx.newPage();
  // index.html draws a random 50 of 1170 (app.js shuffle); seed Math.random so main and branch draw the SAME 50 and the comparison is like-for-like
  await p.addInitScript(() => { let s = 42; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; });
  if (inject) await p.route('**/tours-data.json', async r => { const j = await (await r.fetch()).json(); for (const t of j.tours) t._unknownFields = { ...(t._unknownFields || {}), priceUnit: 'per boat · up to 6 guests' }; await r.fulfill({ json: j }); });
  await p.goto(`http://localhost:${port}/${page}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const out = await p.evaluate(() => { const els = [...document.querySelectorAll('.tour-price')]; const smalls = [...document.querySelectorAll('.tour-price small')];
    const cs = smalls[0] ? getComputedStyle(smalls[0]) : null;
    return { cards: els.length, prices: els.map(e => e.firstChild ? e.firstChild.textContent.trim() : '').sort(), smalls: smalls.length, smallText: smalls[0]?.textContent, css: cs ? { display: cs.display, fontSize: cs.fontSize, tt: cs.textTransform } : null, basisSpans: document.querySelectorAll('.tour-price-basis').length }; });
  await p.close(); return out;
}
for (const page of [appPage, 'el-yunque.html']) {
  const main = await read(8931, page, false), br = await read(8932, page, false), br2 = await read(8932, page, false), fx = await read(8932, page, true);
  const same = JSON.stringify(main.prices) === JSON.stringify(br.prices), det = JSON.stringify(br.prices) === JSON.stringify(br2.prices);
  console.log(`${page}: main cards=${main.cards} smalls=${main.smalls} | branch cards=${br.cards} smalls=${br.smalls} basisSpans=${br.basisSpans} | prices identical main==branch: ${same} | branch deterministic: ${det}`);
  console.log(`   fixture(all rows priceUnit): cards=${fx.cards} smalls=${fx.smalls} basisSpans=${fx.basisSpans} text=${JSON.stringify(fx.smallText)} css=${JSON.stringify(fx.css)}`);
  console.log(`   visible(From $) main=${main.prices.filter(x=>x.startsWith('From')).length} branch=${br.prices.filter(x=>x.startsWith('From')).length}`);
}
await b.close();
