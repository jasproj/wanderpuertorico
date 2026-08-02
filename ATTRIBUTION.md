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
