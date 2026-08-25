#!/usr/bin/env python3
"""s49-wpr-unittag: tag the KEPT whole-party rows (PR #251) with _unknownFields.priceUnit under the s49 rules.
Rule 1 tier label verbatim — the stored tier label states the party/unit ("Private Charter", "Night Transport • 1 - 4 People", "KAYAK").
Rule 2 description quoted — label is generic; the tier note or description carries an explicit capacity/party phrase, quoted as-is.
Rule 3 product name quoted — label generic, no phrase; the product name states it and is used verbatim (WENG s49 wave-2 unitFromName).
Otherwise NOT tagged: listed for ruling, basis unchanged. Price/label/confidence never move. Serializer: json.dumps indent=2 ensure_ascii=False (byte round-trip proven)."""
import json,re,sys
DAY='2026-08-25'; SRC='s49-wpr-unittag'
b=open('tours-data.json','rb').read(); d=json.loads(b); assert (json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()==b,'no byte round-trip'
kept=[r for r in d['tours'] if str(r.get('priceBasis','')).startswith('KEPT (D-621')]
LABEL_UNIT=re.compile(r'\b(private|privado|privada|charter|charters|boat|yacht|jet ?ski|jetski|sea doo|cruiser|vehicle|veh[ií]culo|cabin|utv|atv|buggy|rental|rentals|hire|group|grupo|people|persons|passengers|guests|pax|party|up to|for one|one to|1-\d|\d-\d|seater|whole|per hour|hour rental|trip •|couple|board|court|equipment|package|jetcar|kayak)\b|\d+\s*(people|persons|passengers|guests)',re.I)
CAP=re.compile(r'(up to \d+ (people|persons|passengers|guests|pax|riders|players)|\d+\s*(-|to|–)\s*\d+ (people|persons|passengers|guests|pax)|per (boat|vehicle|group|charter|jet ?ski|kayak|cabin|utv|buggy)|private (charter|boat|tour|group|vehicle|yacht|experience)|whole boat|max(imum)? (of )?\d+ (people|passengers|guests)|capacity (of )?\d+|for \d+ people|\d+ passengers|group of \d+)',re.I)
# rows whose KEPT status is itself a classifier gap or a deposit — ruling, not tagging
RULING={581595:'"Climber" is per person (ladder Climber $90 / $55 / Non-Climber $10); KEPT via group misclass; unit "up to 30 guests" from the description would mislead',
 637393:'"Diver" $105 is a per-person tier (classified group only because the product name contains "boat")',
 641067:'"Diver" $65 gear rental is per person (same "Diver" gap)',
 290742:'"10 participantes Depósito" $249.50 is a DEPOSIT tier, not a price — publishing it as From $249.50 is itself questionable',
 107727:'"Bio Bay Night Kayaking • Beach • Rainforest Trio" $145 is a per-person combo tour (classified group because the label contains "kayak")',
 324591:'sole live tier is "Child" $103.14 — an adult tier is absent; anchoring on a child fare needs a ruling',
 16306:'"Discovery Dive" $140, note "For booking from one to three people" — per person or per booking is not determinable from the ladder',
 17489:'"SSI Open Water Diver" $585 is a per-person course fee (classifier gap: diver/course)'}
tagged=[];ruled=[]
for r in kept:
    L=r['priceLabel']; tier=next((t for t in r['priceTiers'] if t['name']==L),{}); note=' '.join((tier.get('note') or '').split()); desc=' '.join((r.get('description') or '').split())
    if r['pk'] in RULING: ruled.append({'pk':r['pk'],'price':r['price'],'label':L,'name':r['name'],'why':RULING[r['pk']]}); continue
    if LABEL_UNIT.search(L): unit,rule=L.strip(),'tier label verbatim'
    else:
        m=CAP.search(note) or CAP.search(desc)
        if m: unit,rule=m.group(0),f'description quoted ("{m.group(0)}")'
        elif CAP.search(r['name']) or LABEL_UNIT.search(r['name']): unit,rule=r['name'].strip(),'product name quoted'
        else: ruled.append({'pk':r['pk'],'price':r['price'],'label':L,'name':r['name'],'why':'no unit derivable from label, note, description or name'}); continue
    old=r['priceBasis']
    r['_unknownFields']={**(r.get('_unknownFields') or {}),'priceUnit':unit}
    r['priceBasis']=f'D-621 published with unit "{unit}" (rule: {rule}); '+old.replace('KEPT (D-621 hold pending WPR ruling): ','')
    r['priceSource']=SRC; r['priceSourceAt']=DAY; r['priceConfidence']='high'
    tagged.append({'pk':r['pk'],'price':r['price'],'label':L,'unit':unit,'rule':rule.split(' (')[0]})
out=(json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()
if '--dry-run' not in sys.argv: open('tours-data.json','wb').write(out)
json.dump({'day':DAY,'kept':len(kept),'tagged':len(tagged),'ruling':len(ruled),'tagged_rows':tagged,'ruling_rows':ruled},open('_evidence/s49-wpr-unittag/summary.json','w'),indent=1,ensure_ascii=False)
import collections; print({'kept':len(kept),'tagged':len(tagged),'ruling':len(ruled),'by_rule':dict(collections.Counter(t['rule'] for t in tagged))})
# ---- Jason's rulings on the 8 (2026-08-25), applied on top of the tagging pass (see summary.json['rulings_2026-08-25']) ----
#   581595 / 637393 / 641067 / 17489 / 107727 -> priceBasis "KEPT per-person (ruling …, not D-621)", no unit
#   324591 -> "KEPT sole-tier", no unit        16306 -> priceUnit "for one to three people" (tier note quoted)
#   290742 -> priceConfidence low, "deposit tier is not a price" -> renders "Price on request", no offer
