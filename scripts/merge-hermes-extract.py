#!/usr/bin/env python3
"""
Merge FareHarbor extraction into tours-data.json for WanderPuertoRico.
Filters to Puerto Rico tours only based on location.country field.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
TOURS_FILE = REPO_ROOT / "tours-data.json"
HERMES_EXTRACT = Path("/tmp/fh_pr.json")
AFFILIATE_CODE = "walktheplankadventures"

# Puerto Rico location mapping
PR_LOCATIONS = {
    "San Juan": "San Juan",
    "Fajardo": "Fajardo",
    "Carolina": "Carolina",
    "Aguadilla": "Aguadilla",
    "Rincón": "Rincon",
    "Rincon": "Rincon",
    "Vieques": "Vieques",
    "Dorado": "Dorado",
    "Luquillo": "Luquillo",
    "Patillas": "Patillas",
    "Culebra": "Culebra",
    "Lajas": "Lajas",
    "Isabela": "Isabela",
    "Humacao": "Humacao",
    "Cabo Rojo": "Cabo Rojo",
    "Ponce": "Ponce",
    "Ceiba": "Ceiba",
    "Rio Grande": "Rio Grande",
    "Arecibo": "Arecibo",
    "Guaynabo": "Guaynabo",
    "Bayamon": "Bayamon",
    "Caguas": "Caguas",
    "Mayaguez": "Mayaguez",
}

def normalize_location(loc_dict):
    """Map FH location to our location taxonomy."""
    city = loc_dict.get("city", "") or loc_dict.get("state", "") or ""
    for key, val in PR_LOCATIONS.items():
        if key.lower() in city.lower():
            return val
    # Default to state field or San Juan
    return loc_dict.get("state", "San Juan") or "San Juan"

def build_booking_url(item):
    """Build affiliate booking URL."""
    company_sn = item.get("company", {}).get("shortname", "")
    item_pk = item.get("pk") or item.get("id")
    if company_sn and item_pk:
        return f"https://fareharbor.com/{company_sn}/items/{item_pk}/book/?full-items=yes&flow=no&ref={AFFILIATE_CODE}"
    return None

def transform_hermes_item(item):
    """Transform FH API item to our schema."""
    loc = item.get("location", {})
    
    # Skip non-PR tours
    if loc.get("country") != "Puerto Rico":
        return None
    
    images = item.get("images", [])
    gallery = [img.get("image_cdn_url") for img in images if img.get("image_cdn_url")]
    
    return {
        "pk": item.get("pk") or item.get("id"),
        "name": item.get("name", ""),
        "description": item.get("summary", ""),
        "location": normalize_location(loc),
        "price": None,  # FH API doesn't expose pricing
        "bookingUrl": build_booking_url(item),
        "gallery": gallery[:5],  # Cap at 5 images
        "tags": [],
        "needsEnrichment": True,
        "source": "fareharbor-hermes-extract",
    }

def main():
    # Load existing tours (handle both array and object-with-tours-key formats)
    raw = json.load(open(TOURS_FILE))
    if isinstance(raw, dict) and "tours" in raw:
        existing = raw["tours"]
        wrapper = raw
    else:
        existing = raw
        wrapper = None
    
    existing_by_pk = {t.get("pk"): t for t in existing if t.get("pk")}
    existing_by_name = {t.get("name", "").lower(): t for t in existing}
    
    print(f"Existing tours: {len(existing)}")
    
    # Load Hermes extract
    hermes_items = json.load(open(HERMES_EXTRACT))
    print(f"Hermes extract items: {len(hermes_items)}")
    
    # Transform and merge
    added = 0
    updated = 0
    skipped = 0
    
    for item in hermes_items:
        transformed = transform_hermes_item(item)
        if not transformed:
            skipped += 1
            continue
        
        pk = transformed["pk"]
        name_lower = transformed["name"].lower()
        
        # Check if exists by pk or name
        if pk in existing_by_pk:
            # Update: keep existing price/description, take Hermes pk/gallery/tags where empty
            ex = existing_by_pk[pk]
            if not ex.get("gallery"):
                ex["gallery"] = transformed["gallery"]
            if not ex.get("pk"):
                ex["pk"] = pk
            if not ex.get("bookingUrl"):
                ex["bookingUrl"] = transformed["bookingUrl"]
            updated += 1
        elif name_lower in existing_by_name:
            # Match by name
            ex = existing_by_name[name_lower]
            if not ex.get("pk"):
                ex["pk"] = pk
            if not ex.get("gallery"):
                ex["gallery"] = transformed["gallery"]
            if not ex.get("bookingUrl"):
                ex["bookingUrl"] = transformed["bookingUrl"]
            updated += 1
        else:
            # New tour
            existing.append(transformed)
            existing_by_pk[pk] = transformed
            existing_by_name[name_lower] = transformed
            added += 1
    
    print(f"Added: {added}, Updated: {updated}, Skipped (non-PR): {skipped}")
    print(f"Final total: {len(existing)}")
    
    # Count nulls
    null_prices = sum(1 for t in existing if t.get("price") is None)
    print(f"Null prices: {null_prices} ({100*null_prices/len(existing):.1f}%)")
    
    # Write back
    if wrapper:
        wrapper["tours"] = existing
        wrapper["lastNormalized"] = "2026-05-27T00:00:00Z"
        with open(TOURS_FILE, "w") as f:
            json.dump(wrapper, f, indent=2)
    else:
        with open(TOURS_FILE, "w") as f:
            json.dump(existing, f, indent=2)
    print(f"Written to {TOURS_FILE}")

if __name__ == "__main__":
    main()
