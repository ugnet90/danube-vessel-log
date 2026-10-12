#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/rebuild_sightings_index.py
Version: 0.15.17
Updated: 2026-10-12

Safely reconcile data/sightings.json with currently retained reviewed submission
JSON files. Existing historical index entries are preserved when the original
inbox file has already been deleted. A currently present submission may add,
replace or explicitly remove its own index record.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUBMISSIONS_DIR = ROOT / "inbox" / "submissions"
OUTPUT = ROOT / "data" / "sightings.json"
VESSEL_ID_RE = re.compile(r"^VES-\d{6}$")


def text(value) -> str:
    return str(value or "").strip()


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def alongside_position(value, movement: str) -> int | None:
    if movement != "moored" or value in (None, ""):
        return None
    try:
        position = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return position if position in {1, 2, 3} else None


def normalize_location(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    return {
        "status": text(value.get("status")) or "unknown",
        "matched_by": text(value.get("matched_by")),
        "id": text(value.get("id")),
        "area_id": text(value.get("area_id")),
        "name": text(value.get("name")),
        "municipality": text(value.get("municipality")),
        "country": text(value.get("country")),
        "distance_m": number(value.get("distance_m")),
    }


def number_or_none(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        return float(str(value).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


def integer_or_none(value):
    parsed = number_or_none(value)
    if parsed is None or int(parsed) != parsed:
        return None
    return int(parsed)


def normalize_berth(value, movement: str) -> dict:
    source = value if isinstance(value, dict) else {}
    fallback_status = "not_applicable" if movement == "moving" else "unknown"
    allowed = {"matched", "unknown", "not_applicable", "unlisted"}
    status = text(source.get("status"))
    if status not in allowed:
        status = fallback_status

    return {
        "status": status,
        "matched_by": text(source.get("matched_by")),
        "id": text(source.get("id")),
        "name": text(source.get("name")),
        "short_name": text(source.get("short_name")),
        "station_number": text(source.get("station_number")),
        "location_id": text(source.get("location_id")),
        "area_id": text(source.get("area_id")),
        "municipality": text(source.get("municipality")),
        "country": text(source.get("country")),
        "river": text(source.get("river")),
        "bank": text(source.get("bank")),
        "relative_to_reference": text(source.get("relative_to_reference")),
        "river_km": number_or_none(source.get("river_km")),
        "river_km_text": text(source.get("river_km_text")),
        "facility_type": text(source.get("facility_type")),
        "mooring_order": text(source.get("mooring_order")),
        "entry_count": integer_or_none(source.get("entry_count")),
        "entry_height": text(source.get("entry_height")),
        "latitude": number_or_none(source.get("latitude")),
        "longitude": number_or_none(source.get("longitude")),
        "address": text(source.get("address")),
        "access_type": text(source.get("access_type")),
        "source_url": text(source.get("source_url")),
        "source_checked_at": text(source.get("source_checked_at")),
    }


def normalize_photo(photo: dict, index: int) -> dict | None:
    path = text(photo.get("path"))
    if not path:
        return None
    metadata_version = photo.get("metadata_version")
    return {
        "photo_id": text(photo.get("photo_id")),
        "path": path,
        "filename": text(photo.get("filename")),
        "original_filename": text(photo.get("original_filename")),
        "mime_type": text(photo.get("mime_type")) or "image/jpeg",
        "size_bytes": number(photo.get("size_bytes")),
        "sequence": photo.get("sequence") if isinstance(photo.get("sequence"), int) else index + 1,
        "captured_at": text(photo.get("captured_at")),
        "added_at": text(photo.get("added_at")),
        "source": text(photo.get("source")) or "submission",
        "notes": text(photo.get("notes")),
        "metadata_version": metadata_version if isinstance(metadata_version, int) else 0,
        "photo_lat": number(photo.get("photo_lat")),
        "photo_lon": number(photo.get("photo_lon")),
        "location": normalize_location(photo.get("location")),
    }


def build_record(submission: dict, path: Path) -> dict | None:
    workflow = submission.get("workflow") if isinstance(submission.get("workflow"), dict) else {}
    review = workflow.get("review") if isinstance(workflow.get("review"), dict) else {}
    vessel_id = text(review.get("vessel_id"))

    if workflow.get("status") != "reviewed" or not VESSEL_ID_RE.fullmatch(vessel_id):
        return None

    location = submission.get("location") if isinstance(submission.get("location"), dict) else {}
    movement = text(submission.get("movement")) or "unknown"
    berth = normalize_berth(submission.get("berth"), movement)
    photos = []
    for index, photo in enumerate(submission.get("photos") or []):
        if isinstance(photo, dict):
            normalized = normalize_photo(photo, index)
            if normalized:
                photos.append(normalized)

    return {
        "submission_id": text(submission.get("submission_id")),
        "submission_path": path.relative_to(ROOT).as_posix(),
        "vessel_id": vessel_id,
        "captured_at": text(submission.get("captured_at")),
        "uploaded_at": text(submission.get("uploaded_at")),
        "reviewed_at": text(review.get("reviewed_at")),
        "vessel_name_entered": text(submission.get("vessel_name_entered")),
        "location": normalize_location(location) or {
            "status": "unknown",
            "matched_by": "",
            "id": "",
            "area_id": "",
            "name": "",
            "municipality": "",
            "country": "",
            "distance_m": None,
        },
        "berth": berth,
        "movement": movement,
        "alongside_position": (
            alongside_position(submission.get("alongside_position"), movement)
            if berth.get("status") in {"matched", "unlisted"}
            else None
        ),
        "direction": text(submission.get("direction")) or "unknown",
        "notes": text(submission.get("notes")),
        "observer_lat": number(submission.get("observer_lat")),
        "observer_lon": number(submission.get("observer_lon")),
        "photo_lat": number(submission.get("photo_lat")),
        "photo_lon": number(submission.get("photo_lon")),
        "review_decision": text(review.get("decision")),
        "review_notes": text(review.get("notes")),
        "photos": photos,
        "updated_at": text(submission.get("updated_at")) or text(review.get("reviewed_at")) or text(submission.get("uploaded_at")),
    }


def load_existing_records() -> tuple[dict[str, dict], str]:
    if not OUTPUT.exists():
        return {}, ""

    try:
        document = json.loads(OUTPUT.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise SystemExit(
            "ABBRUCH: data/sightings.json ist ungültig. "
            "Der bestehende historische Index wird nicht überschrieben: " + str(exc)
        ) from exc

    if not isinstance(document, dict) or not isinstance(document.get("sightings"), list):
        raise SystemExit(
            "ABBRUCH: data/sightings.json hat kein gültiges sightings-Array. "
            "Der bestehende historische Index wird nicht überschrieben."
        )

    records: dict[str, dict] = {}
    for item in document["sightings"]:
        if not isinstance(item, dict):
            continue
        submission_id = text(item.get("submission_id"))
        if not submission_id:
            continue
        if submission_id in records:
            raise SystemExit(f"Doppelte submission_id im bestehenden Index: {submission_id}")
        records[submission_id] = item

    return records, text(document.get("updated_at"))


def main() -> None:
    records, previous_updated_at = load_existing_records()
    previous_snapshot = list(records.values())
    previous_count = len(records)

    paths = sorted(SUBMISSIONS_DIR.glob("*/*/SUB-*.json"))
    invalid_files: list[str] = []
    seen_ids: set[str] = set()
    added = 0
    replaced = 0
    removed = 0

    for path in paths:
        try:
            submission = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception as exc:
            invalid_files.append(f"{path.relative_to(ROOT)}: {exc}")
            continue

        submission_id = text(submission.get("submission_id"))
        if not submission_id:
            invalid_files.append(f"{path.relative_to(ROOT)}: submission_id fehlt")
            continue
        if submission_id in seen_ids:
            raise SystemExit(f"Doppelte submission_id in aktuellen Inbox-Dateien: {submission_id}")
        seen_ids.add(submission_id)

        record = build_record(submission, path)
        if record:
            if submission_id in records:
                if records[submission_id] != record:
                    replaced += 1
            else:
                added += 1
            records[submission_id] = record
        elif submission_id in records:
            # Die Submission existiert noch und ist ausdrücklich nicht mehr als
            # bestätigte Sichtung gültig. Nur dieser vorhandene Datensatz darf
            # deshalb entfernt werden. Fehlende historische Inbox-Dateien sind
            # dagegen niemals ein Löschsignal.
            del records[submission_id]
            removed += 1

    sightings = sorted(
        records.values(),
        key=lambda item: (item.get("captured_at", ""), item.get("submission_id", "")),
        reverse=True,
    )
    previous_sorted = sorted(
        previous_snapshot,
        key=lambda item: (item.get("captured_at", ""), item.get("submission_id", "")),
        reverse=True,
    )

    if previous_sorted == sightings:
        updated_at = previous_updated_at
    else:
        updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    document = {
        "schema_version": 2,
        "updated_at": updated_at,
        "sightings": sightings,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    retained_without_inbox = len([submission_id for submission_id in records if submission_id not in seen_ids])
    print(f"Bestehende Indexeinträge vor Abgleich: {previous_count}")
    print(f"Aktuelle Submission-Dateien geprüft: {len(paths)}")
    print(f"Neu ergänzt: {added}")
    print(f"Aus aktueller Inbox aktualisiert: {replaced}")
    print(f"Explizit entfernte aktuelle Einträge: {removed}")
    print(f"Historische Einträge ohne Inbox-Datei beibehalten: {retained_without_inbox}")
    print(f"Indexeinträge nach Abgleich: {len(sightings)}")
    print(f"Ungültige Dateien übersprungen: {len(invalid_files)}")
    for item in invalid_files:
        print(f"WARNUNG: {item}")


if __name__ == "__main__":
    main()
