# Image Attribution — wanderpuertorico

**This is the single authoritative provenance record for this repository.**
`images/ATTRIBUTION.md` and `CREDITS.md` were consolidated into this file on
2026-08-02 and deleted. They had drifted: `images/ATTRIBUTION.md` still
presented `hero-photo-2.jpg` as "El Morro fortress" with no warning, months
after this file had blacklisted it as Havana, Cuba. A blacklist in one file and
a clean caption in another is how a Cuban fortress stayed in the homepage hero
rotation until 2026-08-02. One file, or the blacklist does not hold.

Most photographs are from [Pexels](https://www.pexels.com) under the
[Pexels License](https://www.pexels.com/license/) — free for commercial use,
**no attribution required**; recorded here for transparency, not obligation.

---

## ⚠️ UNRESOLVED — conflicting photographer records

Two records name different photographers for the same two files. **Not
resolved. Do not pick a winner without checking the Pexels photo IDs.**

| File | This file says | Add-commit `af6f7a8` (PR #16, 2026-05-04) says |
|---|---|---|
| `images/hero-bio-bay.jpg` | Kostas Exarhos | **Diego F. Parra** |
| `images/hero-fajardo.jpg` | Wii Love | **Diego F. Parra** |

Neither file is currently referenced by any page, so nothing is published under
a disputed credit today. Both are Pexels-licensed, which requires no
attribution, so the exposure is record-keeping rather than legal.

**Embedded metadata cannot settle it.** PR #16's pipeline was
`ImageMagick resize 1920x>, quality 85 … strip metadata`; verified 2026-08-02 —
every image in this repo carries only an APP0/JFIF segment, with no EXIF, XMP,
IPTC, Copyright, Artist or Credit field. Provenance exists only in this file
and in git history.

---

## Hero images — Pexels

| File | Photographer | Pexels URL | Photo ID |
|---|---|---|---|
| `images/hero-culebra.jpg` | Jo Kassis | https://www.pexels.com/photo/photo-of-tank-on-seashore-4633556/ | 4633556 |
| `images/hero-vieques.jpg` | Sam.Sei | https://www.pexels.com/photo/tropical-beach-scene-with-palm-trees-and-ocean-waves-32041532/ | 32041532 |
| `images/hero-el-yunque.jpg` | Candy Nogales | https://www.pexels.com/photo/trees-in-the-forest-11784825/ | 11784825 |
| `images/hero-bio-bay.jpg` | Kostas Exarhos *(disputed — see above)* | https://www.pexels.com/photo/ocean-under-starry-sky-10676753/ | 10676753 |
| `images/hero-san-juan.jpg` | Ricardo Olvera | https://www.pexels.com/photo/residential-buildings-of-san-juan-20795503/ | 20795503 |
| `images/hero-fajardo.jpg` | Wii Love *(disputed — see above)* | https://www.pexels.com/photo/serene-sunset-at-langkawi-yacht-marina-36662527/ | 36662527 |
| `images/hero-photo-1.jpg` | Ricardo Olvera | https://www.pexels.com/photo/residential-buildings-of-san-juan-20795503/ | 20795503 |
| `images/hero-photo-2.jpg` | Osviel Rodriguez Valdés | https://www.pexels.com/photo/iconic-el-morro-lighthouse-overlooking-havana-bay-31280906/ | 31280906 |
| `images/hero-photo-3.jpg` | Mark Stebnicki | https://www.pexels.com/photo/porto-rican-flag-on-shore-15114297/ | 15114297 |

`hero-photo-1.jpg` and `hero-san-juan.jpg` are the **same photograph** (different
bytes, identical scene). Never use both in one rotation — it reads as a
duplicate slide.

Downloaded 2026-04-24 (photo-1/2/3) and 2026-05-04 (the six region heroes),
resized to 1920px wide.

---

## Non-Pexels files

| File | Author | Licence | Source | Status |
|---|---|---|---|---|
| `images/bio-bay-vieques.jpg` | Milan Loiacono / NASA | **Public Domain** (NASA work) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Bioluminescent_Handprint_(oceanos2024loiacono-5).jpg) | **In use.** No attribution obligation. |
| `images/el-yunque-rainforest.jpg` | Shannon McGee | **CC BY-SA 2.0** — attribution AND share-alike **required** | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hike_to_La_Mina_Falls_in_El_Yunque_National_Forest,_Puerto_Rico.jpg) | **RETAINED, UNUSED — do not reference.** |

**`el-yunque-rainforest.jpg`** was live on `index.html` with **no on-page
attribution anywhere on the site**, and this record was linked from no page.
Rather than add a credit line, the reference was replaced with
`images/hero-el-yunque.jpg` (Pexels, no attribution required) on 2026-08-02,
removing the obligation entirely. The file is retained but must not be
referenced again without surfacing the required credit and share-alike notice.

`bio-bay-vieques.jpg`: original shows an OCEANOS instructor's hand glowing in
bioluminescent plankton off La Parguera, Puerto Rico. Center-cropped from
3662×5493 to 3662×2441, resized to 1200×800, JPEG q82. **This is the only asset
that actually shows bioluminescence.**

---

## ⛔ BLACKLIST — do not reference these files

Verified by reading each file's recorded source URL **and inspecting the image
itself**. A caption we wrote is not provenance.

| File | Status | What it actually shows |
|---|---|---|
| `images/hero-photo-2.jpg` | **WRONG COUNTRY** | Castillo del Morro, **Havana, Cuba**. Source slug `el-morro-lighthouse-overlooking-havana-bay`. Our caption said "El Morro fortress"; San Juan's El Morro has no such lighthouse tower. Was in homepage hero slides 2 and 5 until 2026-08-02. Now referenced nowhere. |
| `images/hero-fajardo.jpg` | **WRONG COUNTRY** | Langkawi Yacht Marina, **Malaysia**. Source slug `serene-sunset-at-langkawi-yacht-marina`. A Malaysian flag and "LANGKAWI" signage are visible in frame. Removed from `fajardo.html`; referenced nowhere. |
| `images/el-yunque-rainforest.jpg` | **LICENCE OBLIGATION** | Correct subject and correct country, but CC BY-SA 2.0 with no attribution surfaced. See above. |

## ⚠️ In use, but location NOT verifiable from source

These carry no false claim **provided alt text does not name a place**. Their
source URLs name no location, so they must never be captioned as a specific one.

| File | Source slug | What it actually shows |
|---|---|---|
| `images/hero-vieques.jpg` | `tropical-beach-scene-with-palm-trees-and-ocean-waves` | Palm-lined golden-sand beach with sea grape and a reef break. Caribbean-consistent, **no identifiable landmark** — cannot be confirmed as Vieques or as Puerto Rico. |
| `images/hero-el-yunque.jpg` | `trees-in-the-forest` | Tropical rainforest of sierra palms with a narrow trail. Subject strongly consistent with El Yunque's palm zone; **location not provable**. |
| `images/hero-bio-bay.jpg` | `ocean-under-starry-sky` | Milky Way over a dark rocky coastline. **Shows no bioluminescence at all** — the water is dark. Removed from `bio-bay.html` 2026-07-28; re-introduced in error by PR #128 and removed again 2026-08-02. Use `bio-bay-vieques.jpg` for anything bioluminescent. |

## ✅ Verified correct by inspection

| File | Verification |
|---|---|
| `images/hero-photo-1.jpg` / `images/hero-san-juan.jpg` | Source names San Juan; inspection confirms an Old San Juan street with the Puerto Rican flag and the city wall. |
| `images/hero-photo-3.jpg` | Puerto Rican flag over the Condado/San Juan waterfront. Unambiguously Puerto Rico. |
| `images/hero-culebra.jpg` | The graffitied Sherman tank on **Flamenco Beach, Culebra** — a real Culebra landmark. |
| `images/bio-bay-vieques.jpg` | Bioluminescent plankton, La Parguera, Puerto Rico. |

## Blog card images (added 2026-09-02, s56)

All from Pexels (free license, attribution not required but recorded). Note:
several of these are stock photos of other Caribbean/global locations (Cuba,
Curaçao, Anguilla, Trinidad & Tobago, Zanzibar, the Maldives) rotated in as
generic tropical stand-ins for "vs"-series and other posts — the wired
aria-label on each card describes only what is visibly in frame and never
asserts Puerto Rico unless something in the photo (a flag, El Morro, etc.)
proves it.

- `images/blog/best-beaches-puerto-rico.jpg` — Pexels photo 32041532 by Sam.Sei — https://www.pexels.com/photo/tropical-beach-scene-with-palm-trees-and-ocean-waves-32041532/
- `images/blog/best-hikes-puerto-rico.jpg` — Pexels photo 7682676 by Mikhail Nilov — https://www.pexels.com/photo/woman-in-red-dress-standing-in-between-two-trees-7682676/
- `images/blog/culebra-island-tours.jpg` — Pexels photo 11493264 by DIDIER VILLALBA — https://www.pexels.com/photo/a-person-standing-on-the-beach-11493264/
- `images/blog/day-trips-from-san-juan.jpg` — Pexels photo 3018041 by Caleb Oquendo — https://www.pexels.com/photo/two-people-on-a-boat-3018041/
- `images/blog/el-yunque-rainforest-tours.jpg` — Pexels photo 784148 by Molly Champion — https://www.pexels.com/photo/mountain-covered-with-green-trees-784148/
- `images/blog/fajardo-boat-tours.jpg` — Pexels photo 14762341 by Sergio Hurtado — https://www.pexels.com/photo/catamaran-at-exotic-beach-14762341/
- `images/blog/first-time-puerto-rico-guide.jpg` — Pexels photo 15306044 by Diego F. Parra — https://www.pexels.com/photo/an-aerial-shot-of-a-beautiful-shore-15306044/
- `images/blog/instagram-spots-puerto-rico.jpg` — Pexels photo 2526099 by Reynaldo #brigworkz Brigantty — https://www.pexels.com/photo/assorted-coloured-umbrellas-hanging-near-buildings-2526099/
- `images/blog/is-puerto-rico-safe-travel-guide.jpg` — Pexels photo 20795503 by Ricardo Olvera — https://www.pexels.com/photo/residential-buildings-of-san-juan-20795503/
- `images/blog/old-san-juan-walking-tours.jpg` — Pexels photo 19935977 by Joaquin Lopez — https://www.pexels.com/photo/light-in-a-narrow-alley-at-night-19935977/
- `images/blog/ponce-day-trips.jpg` — Pexels photo 2565221 by Deeana Arts 🇵🇷 — https://www.pexels.com/photo/student-standing-on-school-ground-2565221/
- `images/blog/puerto-rico-3-day-itinerary.jpg` — Pexels photo 37074208 by Emanuel Cortés — https://www.pexels.com/photo/charming-street-view-in-old-san-juan-puerto-rico-37074208/
- `images/blog/puerto-rico-5-day-itinerary.jpg` — Pexels photo 3010317 by Caleb Oquendo — https://www.pexels.com/photo/island-and-ocean-under-a-cloudy-sky-3010317/
- `images/blog/puerto-rico-7-day-itinerary.jpg` — Pexels photo 11784825 by Candy  Nogales — https://www.pexels.com/photo/trees-in-the-forest-11784825/
- `images/blog/puerto-rico-bioluminescent-bay-tours.jpg` — Pexels photo 7966667 by Takuya Hozumi — https://www.pexels.com/photo/kayakers-under-a-bridge-7966667/
- `images/blog/puerto-rico-catamaran-tours.jpg` — Pexels photo 4784477 by Jess Loiterton — https://www.pexels.com/photo/white-yacht-on-blue-sea-4784477/
- `images/blog/puerto-rico-cave-tours.jpg` — Pexels photo 6876991 by Quang Nguyen Vinh — https://www.pexels.com/photo/view-of-an-underground-river-6876991/
- `images/blog/puerto-rico-destination-wedding-guide.jpg` — Pexels photo 9470486 by Asad Photo Maldives — https://www.pexels.com/photo/a-beach-occasion-and-white-sail-boat-on-shore-9470486/
- `images/blog/puerto-rico-festivals-events.jpg` — Pexels photo 37859381 by Anil — https://www.pexels.com/photo/vibrant-street-parade-with-colorful-costumes-37859381/
- `images/blog/puerto-rico-fishing-charters.jpg` — Pexels photo 37789607 by Tiago Chaves — https://www.pexels.com/photo/two-men-fishing-on-rocky-seashore-in-summer-37789607/
- `images/blog/puerto-rico-food-guide.jpg` — Pexels photo 38272223 by Following NYC — https://www.pexels.com/photo/energetic-crowd-at-puerto-rican-day-parade-in-nyc-38272223/
- `images/blog/puerto-rico-history-culture-guide.jpg` — Pexels photo 15305872 by Diego F. Parra — https://www.pexels.com/photo/mother-and-daughter-walking-on-el-morro-castle-on-puerto-rico-15305872/
- `images/blog/puerto-rico-honeymoon-guide.jpg` — Pexels photo 1024993 by Asad Photo Maldives — https://www.pexels.com/photo/man-and-woman-walking-of-body-of-water-1024993/
- `images/blog/puerto-rico-kayak-tours.jpg` — Pexels photo 29643901 by Santiago Morales — https://www.pexels.com/photo/serene-kayaking-adventure-in-jalcomulco-mangrove-29643901/
- `images/blog/puerto-rico-nightlife-guide.jpg` — Pexels photo 19935977 by Joaquin Lopez — https://www.pexels.com/photo/light-in-a-narrow-alley-at-night-19935977/
- `images/blog/puerto-rico-on-a-budget.jpg` — Pexels photo 6834092 by Leah Newhouse — https://www.pexels.com/photo/waves-on-a-tropical-beach-6834092/
- `images/blog/puerto-rico-packing-list.jpg` — Pexels photo 8212231 by Kindel Media — https://www.pexels.com/photo/photo-of-a-packed-suitcase-8212231/
- `images/blog/puerto-rico-road-trip-guide.jpg` — Pexels photo 25637102 by K — https://www.pexels.com/photo/forest-and-fields-on-sea-coast-25637102/
- `images/blog/puerto-rico-shopping-guide.jpg` — Pexels photo 30826584 by Dominik Gryzbon — https://www.pexels.com/photo/colorful-caribbean-souvenir-display-in-tobago-30826584/
- `images/blog/puerto-rico-snorkeling-tours.jpg` — Pexels photo 36132584 by Zack Gilbert — https://www.pexels.com/photo/hawksbill-sea-turtle-swimming-in-caribbean-waters-36132584/
- `images/blog/puerto-rico-sunset-cruises.jpg` — Pexels photo 4316233 by Steshka Croes — https://www.pexels.com/photo/a-person-riding-on-the-boat-while-sailing-on-the-sea-during-golden-hour-4316233/
- `images/blog/puerto-rico-vs-aruba.jpg` — Pexels photo 35342123 by David Pospíšil — https://www.pexels.com/photo/stunning-beach-sunset-in-cuba-with-palm-trees-35342123/
- `images/blog/puerto-rico-vs-bahamas.jpg` — Pexels photo 32330667 by Wijs (Wise) — https://www.pexels.com/photo/pristine-curacao-beach-with-azure-waters-32330667/
- `images/blog/puerto-rico-vs-bermuda.jpg` — Pexels photo 27688420 by Arquimedes Paulino — https://www.pexels.com/photo/lindos-lugares-en-anguilla-27688420/
- `images/blog/puerto-rico-vs-cancun.jpg` — Pexels photo 3051575 by Caleb Oquendo — https://www.pexels.com/photo/photography-of-seashore-3051575/
- `images/blog/puerto-rico-vs-caribbean-comparison.jpg` — Pexels photo 11807180 by Katie Cerami — https://www.pexels.com/photo/aerial-view-of-islands-on-ocean-11807180/
- `images/blog/puerto-rico-vs-costa-rica.jpg` — Pexels photo 9743191 by Ludvig Hedenborg — https://www.pexels.com/photo/green-trees-beside-body-of-water-9743191/
- `images/blog/puerto-rico-vs-cuba.jpg` — Pexels photo 20795503 by Ricardo Olvera — https://www.pexels.com/photo/residential-buildings-of-san-juan-20795503/
- `images/blog/puerto-rico-vs-dominican-republic.jpg` — Pexels photo 10490913 by Mr Pixel — https://www.pexels.com/photo/palm-trees-on-a-beach-10490913/
- `images/blog/puerto-rico-vs-florida.jpg` — Pexels photo 25637102 by K — https://www.pexels.com/photo/forest-and-fields-on-sea-coast-25637102/
- `images/blog/puerto-rico-vs-hawaii.jpg` — Pexels photo 11832789 by WeRatherBe — https://www.pexels.com/photo/aerial-view-of-mountains-and-valley-at-sunset-11832789/
- `images/blog/puerto-rico-vs-jamaica.jpg` — Pexels photo 2927993 by Caleb Oquendo — https://www.pexels.com/photo/photo-beach-surrounded-by-palm-trees-2927993/
- `images/blog/puerto-rico-vs-st-thomas.jpg` — Pexels photo 5769693 by Julia Volk — https://www.pexels.com/photo/sailboats-in-bay-5769693/
- `images/blog/puerto-rico-vs-us-virgin-islands-snorkeling.jpg` — Pexels photo 7973885 by Samson Bush — https://www.pexels.com/photo/photo-of-a-yellow-and-silver-fish-swimming-near-coral-reefs-7973885/
- `images/blog/rincon-surf-tours.jpg` — Pexels photo 33927451 by Yaraliz Vazquez — https://www.pexels.com/photo/dramatic-waves-and-mist-at-manati-puerto-rico-33927451/
- `images/blog/san-juan-tours.jpg` — Pexels photo 20795503 by Ricardo Olvera — https://www.pexels.com/photo/residential-buildings-of-san-juan-20795503/
- `images/blog/scuba-diving-puerto-rico.jpg` — Pexels photo 10749506 by Pascal Ingelrest — https://www.pexels.com/photo/diver-on-sea-bottom-10749506/
- `images/blog/solo-travel-puerto-rico.jpg` — Pexels photo 5215723 by Yan Krukau — https://www.pexels.com/photo/a-person-carrying-a-backpack-walking-near-a-rocky-coast-5215723/
- `images/blog/spanish-phrases-puerto-rico.jpg` — Pexels photo 5092744 by Malcolm Garret — https://www.pexels.com/photo/view-of-a-building-5092744/
- `images/blog/things-to-do-cabo-rojo.jpg` — Pexels photo 3010317 by Caleb Oquendo — https://www.pexels.com/photo/island-and-ocean-under-a-cloudy-sky-3010317/
- `images/blog/things-to-do-fajardo.jpg` — Pexels photo 35541054 by Manuel Enrique Sankitts 🌹 — https://www.pexels.com/photo/abandoned-ruins-on-puerto-rico-coastline-35541054/
- `images/blog/things-to-do-ponce.jpg` — Pexels photo 5092761 by Malcolm Garret — https://www.pexels.com/photo/aerial-photography-of-cementerio-santa-maria-magdalena-de-pazzi-5092761/
- `images/blog/things-to-do-puerto-rico.jpg` — Pexels photo 16158702 by Mohan Nannapaneni — https://www.pexels.com/photo/grassland-near-town-on-sea-coast-16158702/
- `images/blog/things-to-do-san-juan.jpg` — Pexels photo 15305908 by Diego F. Parra — https://www.pexels.com/photo/panorama-of-san-juan-on-puerto-rico-15305908/
- `images/blog/things-to-do-vieques.jpg` — Pexels photo 30796577 by Keegan Checks — https://www.pexels.com/photo/horse-riding-in-azure-waters-of-zanzibar-beach-30796577/
- `images/blog/vieques-island-tours.jpg` — Pexels photo 34261519 by Sam Jotham Sutharson — https://www.pexels.com/photo/serene-beach-rock-stack-on-vieques-island-34261519/
- `images/blog/where-to-stay-puerto-rico.jpg` — Pexels photo 3051575 by Caleb Oquendo — https://www.pexels.com/photo/photography-of-seashore-3051575/
