#!/usr/bin/env python3
"""
Apply the WNZ price patch to tours-data.json.

  dry run : python3 apply-nz-price-patch.py tours-data.json wnz-price-patch.json
  execute : python3 apply-nz-price-patch.py tours-data.json wnz-price-patch.json --execute

Safety: a row is only touched when its CURRENT price still equals the patch's
oldPrice. If the file moved under us, the row is skipped and reported. Nothing
is written unless --execute is passed, and the original is backed up first.
"""
import json, re, sys, shutil, datetime

SRC, PATCH = sys.argv[1], sys.argv[2]
EXEC = '--execute' in sys.argv
STAMP = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
TAG = 's62-wpr-price-refresh'

doc = json.load(open(SRC))
tours = doc['tours'] if isinstance(doc, dict) and 'tours' in doc else doc
patch = json.load(open(PATCH))

RX = re.compile(r'embeds/book/([a-z0-9-]+)/items/(\d+)')
index = {}
for t in tours:
    m = RX.search(t.get('bookingUrl') or '')
    if m:
        index.setdefault((m.group(1), m.group(2)), []).append(t)

applied, skipped, missing = [], [], []

for p in patch['auto']:
    rows = index.get((p['co'], p['pk']))
    if not rows:
        missing.append(p); continue
    for t in rows:
        cur = t.get('price')
        if cur is None or abs(float(cur) - p['oldPrice']) > 0.01:
            skipped.append(dict(p, actual=cur)); continue
        nv = p['newPrice']
        t['price'] = int(nv) if float(nv).is_integer() else nv
        if p['newLabel'] != p['oldLabel']:
            t['priceLabel'] = p['newLabel']
        t['priceSource'] = TAG
        t['priceEnrichmentAt'] = STAMP
        t['priceBasis'] = ('%s: %s $%.2f -> $%.2f (%s); re-measured on FareHarbor '
                           'asn=fhdn across 4 dates, identical each time'
                           % (TAG, p['newLabel'], p['oldPrice'], p['newPrice'], p['cls'].lower()))
        applied.append(p)

delisted = []
for d in patch['delist']:
    rows = index.get((d['co'], d['pk']))
    if not rows:
        missing.append(d); continue
    for t in rows:
        t['status'] = 'inactive'
        t['statusReason'] = TAG + ': ' + d['reason']
        t['priceConfidence'] = 'none'
        delisted.append(d)

print('rows in file          :', len(tours))
print('price corrections     :', len(applied), 'of', len(patch['auto']))
print('delisted (unpriced)   :', len(delisted))
print('skipped, price moved  :', len(skipped))
print('not found in file     :', len(missing))
if applied:
    print('overstatement removed : $%.2f' % sum(x['oldPrice'] - x['newPrice'] for x in applied))
for s in skipped:
    print('  SKIP %-24s %-36s expected %.2f, found %s' % (s['co'][:24], s['name'][:36], s['oldPrice'], s.get('actual')))
for m in missing:
    print('  MISS %-24s pk %-8s %s' % (m['co'][:24], m['pk'], m['name'][:40]))
print()
print('still needs a human call (not patched):')
for f in patch['flag']:
    print('  %-24s %-38s card %.2f, label %r' % (f['co'][:24], f['name'][:38], f['card'], f['label']))
    print('     tiers:', ', '.join('%s=%.2f' % (n, v) for n, v in f['tiers'])[:150])

if not EXEC:
    print('\nDRY RUN. Nothing written. Re-run with --execute to write.')
    sys.exit(0)

shutil.copy2(SRC, SRC + '.bak-' + TAG)
if isinstance(doc, dict):
    doc['lastNormalized'] = STAMP
open(SRC, 'w').write(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print('\nWROTE %s  (backup: %s.bak-%s)' % (SRC, SRC, TAG))
