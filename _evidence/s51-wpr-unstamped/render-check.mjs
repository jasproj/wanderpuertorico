// Render every row through the real tour-render.js (classic script, loaded via vm) and compare HEAD vs branch card strings.
import fs from 'node:fs'; import vm from 'node:vm'; import { execSync } from 'node:child_process';
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('tour-render.js','utf8') + '\nthis.formatPrice=formatPrice;this.priceUnitHtml=priceUnitHtml;this.generateTourSchema=generateTourSchema;', ctx);
const card = t => `${ctx.formatPrice(t.price, t.priceConfidence)}${ctx.priceUnitHtml(t)}|offer=${JSON.stringify(ctx.generateTourSchema(t).offers?.price ?? null)}`;
const now = JSON.parse(fs.readFileSync('tours-data.json','utf8')).tours; const head = JSON.parse(execSync('git show HEAD:tours-data.json', { maxBuffer: 64 * 1024 * 1024 })).tours;
const H = new Map(head.map(t => [t.pk, card(t)])); let diff = 0, vis = 0, small = 0, offerMismatch = 0;
for (const t of now) { const c = card(t); if (c !== H.get(t.pk)) diff++; if (!c.startsWith('Price on request')) vis++; if (c.includes('<small>')) small++;
  const m = /^From \$([\d.]+)/.exec(c); if (m && Number(m[1]) !== ctx.generateTourSchema(t).offers?.price) offerMismatch++; if (c.startsWith('Price on request') && ctx.generateTourSchema(t).offers) offerMismatch++; }
const s51 = now.filter(t => t.priceSource === 's51-wpr-unstamped'); const s51diff = s51.filter(t => card(t) !== H.get(t.pk)).length;
const outside = now.filter(t => t.priceSource !== 's51-wpr-unstamped' && card(t) !== H.get(t.pk)).length;
const sample = s51.filter(t => card(t).includes('<small>')).slice(0,3).map(t => [t.pk, card(t)]);
console.log(JSON.stringify({ rows: now.length, cardsChanged: diff, changedInS51: s51diff, changedOutsideS51: outside, visibleHead: [...H.values()].filter(c => !c.startsWith('Price on request')).length, visibleNow: vis, smallHead: [...H.values()].filter(c => c.includes('<small>')).length, smallNow: small, offerMismatch, sample }));
if (outside || offerMismatch) process.exit(1);
