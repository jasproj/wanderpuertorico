#!/usr/bin/env python3
"""s51-wpr-unstamped apply stage (copy of apply-patch.py, PR #251) (Python half): write the per-pk patch emitted by s49-wpr-refresh.mjs apply
with the serializer that round-trips WPR's tours-data.json byte-identically (json.dumps indent=2, ensure_ascii=False).
Guards: byte round-trip, patch pks ⊆ population, no row outside the patch changes, row count/order unchanged."""
import json,sys
EV='_evidence/s51-wpr-unstamped'
b=open('tours-data.json','rb').read(); d=json.loads(b)
assert (json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()==b, 'ABORT: no byte round-trip'
patch=json.load(open(f'{EV}/patch.json')); patch={int(k):v for k,v in patch.items()}
pop={r['pk'] for r in d['tours'] if not isinstance(r.get('priceEnrichmentAt'),str)}
assert set(patch)<=pop, f'ABORT: patch outside population {set(patch)-pop}'
order=[r['pk'] for r in d['tours']]
new=[patch.get(r['pk'],r) for r in d['tours']]
assert [r['pk'] for r in new]==order and len(new)==len(order)
changed=[o['pk'] for o,n in zip(d['tours'],new) if o!=n]
assert set(changed)<=set(patch), 'ABORT: rows outside patch changed'
d['tours']=new
out=(json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()
if '--dry-run' in sys.argv: print({'wouldChange':len(changed),'patchRows':len(patch),'population':len(pop)}); sys.exit(0)
open('tours-data.json','wb').write(out)
print({'changed':len(changed),'patchRows':len(patch),'population':len(pop),'bytes':[len(b),len(out)]})
