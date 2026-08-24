#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/rebuild_sightings_index.py
Version: 0.15.0
Updated: 2026-08-24

Rebuild data/sightings.json from reviewed submission JSON files.
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


def normalize_photo(photo: dict, index: int) -> dict | None:
    path = text(photo.get("path"))
    if not path:
        return None
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
    }


def build_record(submission: dict, path: Path) -> dict | None:
    workflow = submission.get("workflow") if isinstance(submission.get("workflow"), dict) else {}
    review = workflow.get("review") if isinstance(workflow.get("review"), dict) else {}
    vessel_id = text(review.get("vessel_id"))

    if workflow.get("status") != "reviewed" or not VESSEL_ID_RE.fullmatch(vessel_id):
        return None

    location = submission.get("location") if isinstance(submission.get("location"), dict) else {}
    berth = submission.get("berth") if isinstance(submission.get("berth"), dict) else {}
    movement = text(submission.get("movement")) or "unknown"
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
        "location": {
            "status": text(location.get("status")) or "unknown",
            "matched_by": text(location.get("matched_by")),
            "id": text(location.get("id")),
            "name": text(location.get("name")),
            "municipality": text(location.get("municipality")),
            "country": text(location.get("country")),
            "distance_m": number(location.get("distance_m")),
        },
        "berth": berth,
        "movement": movement,
        "alongside_position": alongside_position(
            submission.get("alongside_position"), movement
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


def main() -> None:
    paths = sorted(SUBMISSIONS_DIR.glob("*/*/SUB-*.json"))
    records: dict[str, dict] = {}
    invalid_files: list[str] = []

    for path in paths:
        try:
            submission = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception as exc:
            invalid_files.append(f"{path.relative_to(ROOT)}: {exc}")
            continue

        record = build_record(submission, path)
        if not record:
            continue

        submission_id = record["submission_id"]
        if not submission_id:
            invalid_files.append(f"{path.relative_to(ROOT)}: submission_id fehlt")
            continue
        if submission_id in records:
            raise SystemExit(f"Doppelte submission_id im Bestand: {submission_id}")
        records[submission_id] = record

    sightings = sorted(
        records.values(),
        key=lambda item: (item.get("captured_at", ""), item.get("submission_id", "")),
        reverse=True,
    )

    previous = None
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8-sig"))
        except Exception:
            previous = None

    if isinstance(previous, dict) and previous.get("sightings") == sightings:
        updated_at = text(previous.get("updated_at"))
    else:
        updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    document = {
        "schema_version": 2,
        "updated_at": updated_at,
        "sightings": sightings,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Submission-Dateien geprüft: {len(paths)}")
    print(f"Bestätigte Sichtungen übernommen: {len(sightings)}")
    print(f"Ungültige Dateien übersprungen: {len(invalid_files)}")
    for item in invalid_files:
        print(f"WARNUNG: {item}")


if __name__ == "__main__":
    main()
