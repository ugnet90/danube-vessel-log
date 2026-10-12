#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/build_analytics.py
Version: 0.15.18
Updated: 2026-10-12

Build a privacy-reduced public analytics dataset from canonical vessel and
sighting data. The generated file intentionally omits observer coordinates,
notes, submission paths, review notes and raw entered vessel names.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SIGHTINGS_PATH = ROOT / "data" / "sightings.json"
VESSELS_PATH = ROOT / "data" / "vessels.csv"
LOCATIONS_PATH = ROOT / "data" / "locations.csv"
BERTHS_PATH = ROOT / "data" / "berths.csv"
OUTPUT_PATH = ROOT / "docs" / "data" / "analytics.json"
LOCAL_TZ = ZoneInfo("Europe/Vienna")


def text(value) -> str:
    return str(value or "").strip()


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def parse_timestamp(value: str) -> datetime | None:
    raw = text(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(LOCAL_TZ)


def load_sightings() -> dict:
    if not SIGHTINGS_PATH.exists():
        raise SystemExit(f"Fehlt: {SIGHTINGS_PATH.relative_to(ROOT)}")
    try:
        document = json.loads(SIGHTINGS_PATH.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise SystemExit(f"Ungültiges JSON in data/sightings.json: {exc}") from exc
    if not isinstance(document, dict) or not isinstance(document.get("sightings"), list):
        raise SystemExit("data/sightings.json hat kein gültiges sightings-Array.")
    return document


def load_csv_index(path: Path, id_field: str) -> dict[str, dict[str, str]]:
    if not path.exists():
        raise SystemExit(f"Fehlt: {path.relative_to(ROOT)}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        return {
            text(row.get(id_field)): {key: text(value) for key, value in row.items()}
            for row in reader
            if text(row.get(id_field))
        }


def load_vessels() -> dict[str, dict[str, str]]:
    return load_csv_index(VESSELS_PATH, "vessel_id")


def load_locations() -> dict[str, dict[str, str]]:
    return load_csv_index(LOCATIONS_PATH, "location_id")


def load_berths() -> dict[str, dict[str, str]]:
    return load_csv_index(BERTHS_PATH, "berth_id")


def area_by_municipality(berths: dict[str, dict[str, str]]) -> dict[str, str]:
    candidates: dict[str, set[str]] = {}
    for berth in berths.values():
        municipality = text(berth.get("municipality"))
        area_id = text(berth.get("berth_area_id"))
        if municipality and area_id:
            candidates.setdefault(municipality, set()).add(area_id)
    return {
        municipality: next(iter(area_ids))
        for municipality, area_ids in candidates.items()
        if len(area_ids) == 1
    }


def build_record(
    sighting: dict,
    vessels: dict[str, dict[str, str]],
    locations: dict[str, dict[str, str]],
    berths: dict[str, dict[str, str]],
    municipality_areas: dict[str, str],
) -> dict | None:
    vessel_id = text(sighting.get("vessel_id"))
    vessel = vessels.get(vessel_id)
    if not vessel:
        return None

    captured_at = text(sighting.get("captured_at"))
    local_dt = parse_timestamp(captured_at)
    if not local_dt:
        return None

    location = sighting.get("location") if isinstance(sighting.get("location"), dict) else {}
    berth = sighting.get("berth") if isinstance(sighting.get("berth"), dict) else {}
    photos = sighting.get("photos") if isinstance(sighting.get("photos"), list) else []

    location_id = text(location.get("id")) or text(berth.get("location_id"))
    location_master = locations.get(location_id, {})
    location_name = (
        text(location.get("name"))
        or text(location_master.get("public_name"))
        or text(location_master.get("name"))
    )
    municipality = (
        text(location.get("municipality"))
        or text(berth.get("municipality"))
        or text(location_master.get("municipality"))
    )
    country = (
        text(location.get("country"))
        or text(berth.get("country"))
        or text(location_master.get("country"))
    )

    berth_id = text(berth.get("id"))
    berth_master = berths.get(berth_id, {})
    location_area_id = (
        text(berth.get("area_id"))
        or text(berth_master.get("berth_area_id"))
        or municipality_areas.get(municipality, "")
    )
    location_area_name = municipality
    if not location_area_name and location_id:
        location_area_name = location_name

    return {
        "vessel_id": vessel_id,
        "vessel_name": text(vessel.get("name")) or vessel_id,
        "operator": text(vessel.get("operator")),
        "cruise_brand": text(vessel.get("cruise_brand")),
        "ship_type": text(vessel.get("ship_type")),
        "ship_subtype": text(vessel.get("ship_subtype")),
        "flag": text(vessel.get("flag")),
        "status": text(vessel.get("status")),
        "captured_at": captured_at,
        "local_date": local_dt.date().isoformat(),
        "local_month": local_dt.strftime("%Y-%m"),
        "local_year": local_dt.year,
        "weekday": local_dt.weekday(),
        "hour": local_dt.hour,
        "location_reference_id": location_id,
        "location_reference_name": location_name,
        "location_area_id": location_area_id,
        "location_area_name": location_area_name,
        "municipality": municipality,
        "country": country,
        "berth_id": berth_id,
        "berth_name": text(berth.get("name")),
        "berth_short_name": text(berth.get("short_name")),
        "movement": text(sighting.get("movement")) or "unknown",
        "direction": text(sighting.get("direction")) or "unknown",
        "alongside_position": number(sighting.get("alongside_position")),
        "photo_count": len([photo for photo in photos if isinstance(photo, dict)]),
    }


def unique_dimension(records: list[dict], id_key: str, name_key: str) -> list[dict]:
    items: dict[str, str] = {}
    for record in records:
        item_id = text(record.get(id_key))
        if not item_id:
            continue
        items[item_id] = text(record.get(name_key)) or item_id
    return [
        {"id": item_id, "name": name}
        for item_id, name in sorted(items.items(), key=lambda item: item[1].casefold())
    ]


def main() -> None:
    sightings_document = load_sightings()
    vessels = load_vessels()
    locations = load_locations()
    berths = load_berths()
    municipality_areas = area_by_municipality(berths)

    records = []
    skipped = 0
    for sighting in sightings_document.get("sightings", []):
        if not isinstance(sighting, dict):
            skipped += 1
            continue
        record = build_record(sighting, vessels, locations, berths, municipality_areas)
        if record:
            records.append(record)
        else:
            skipped += 1

    records.sort(key=lambda item: (item["captured_at"], item["vessel_id"]), reverse=True)

    vessel_ids = sorted({record["vessel_id"] for record in records})
    local_dates = sorted({record["local_date"] for record in records if record["local_date"]})

    document_without_generated_at = {
        "schema_version": 1,
        "source_updated_at": text(sightings_document.get("updated_at")),
        "timezone": "Europe/Vienna",
        "meta": {
            "record_count": len(records),
            "vessel_count": len(vessel_ids),
            "date_min": local_dates[0] if local_dates else "",
            "date_max": local_dates[-1] if local_dates else "",
            "skipped_record_count": skipped,
        },
        "dimensions": {
            "vessels": [
                {
                    "id": vessel_id,
                    "name": text(vessels[vessel_id].get("name")) or vessel_id,
                    "operator": text(vessels[vessel_id].get("operator")),
                    "cruise_brand": text(vessels[vessel_id].get("cruise_brand")),
                }
                for vessel_id in sorted(vessel_ids, key=lambda item: text(vessels[item].get("name")).casefold())
            ],
            "locations": unique_dimension(records, "location_area_id", "location_area_name"),
            "berths": unique_dimension(records, "berth_id", "berth_short_name"),
            "operators": sorted(
                {record["operator"] or record["cruise_brand"] for record in records if record["operator"] or record["cruise_brand"]},
                key=str.casefold,
            ),
        },
        "records": records,
    }

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if OUTPUT_PATH.exists():
        try:
            previous = json.loads(OUTPUT_PATH.read_text(encoding="utf-8-sig"))
        except Exception:
            previous = None
        if isinstance(previous, dict):
            previous_without_generated_at = {
                key: value for key, value in previous.items() if key != "generated_at"
            }
            if previous_without_generated_at == document_without_generated_at:
                generated_at = text(previous.get("generated_at")) or generated_at

    document = {
        "schema_version": document_without_generated_at["schema_version"],
        "generated_at": generated_at,
        **{
            key: value
            for key, value in document_without_generated_at.items()
            if key != "schema_version"
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Sichtungen veröffentlicht: {len(records)}")
    print(f"Verschiedene Schiffe: {len(vessel_ids)}")
    print(f"Datumsbereich: {document['meta']['date_min']} bis {document['meta']['date_max']}")
    print(f"Übersprungene Datensätze: {skipped}")
    print(f"Ausgabe: {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
