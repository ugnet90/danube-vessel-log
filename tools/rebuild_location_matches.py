#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/rebuild_location_matches.py
Version: 0.14.35
Updated: 2026-08-20

Einmaliges bzw. wiederholbares Wartungswerkzeug zur nachträglichen
Neuberechnung automatisch ermittelter Aufnahme-/Sichtungsorte anhand der
aktuellen Polygon- und Radiuslogik.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
LOCATIONS_PATH = ROOT / "data" / "locations.csv"
LOCATION_AREAS_PATH = ROOT / "data" / "location_areas.geojson"
SUBMISSIONS_DIR = ROOT / "inbox" / "submissions"
VESSEL_PHOTOS_DIR = ROOT / "data" / "vessel_photos"
SIGHTINGS_PATH = ROOT / "data" / "sightings.json"
VESSELS_PATH = ROOT / "data" / "vessels.csv"
PHOTO_LOCATIONS_PATH = ROOT / "data" / "photo_locations.json"
DOCS_PHOTO_LOCATIONS_PATH = ROOT / "docs" / "data" / "photo_locations.json"
DOCS_LOCATION_AREAS_PATH = ROOT / "docs" / "data" / "location_areas.geojson"
LEGACY_PHOTO_GPS_CUTOFF = "2026-08-18T00:00:00Z"


def parse_coordinate(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if text == "":
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if not math.isfinite(number):
        return None
    return number


def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6_371_000
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_m * c


def load_locations() -> list[dict[str, Any]]:
    if not LOCATIONS_PATH.exists():
        raise FileNotFoundError(f"{LOCATIONS_PATH} fehlt.")

    with LOCATIONS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        rows = []
        for row in reader:
            location_id = str(row.get("location_id", "")).strip()
            latitude = parse_coordinate(row.get("latitude"))
            longitude = parse_coordinate(row.get("longitude"))
            radius_m = parse_coordinate(row.get("radius_m"))
            if not location_id or latitude is None or longitude is None or radius_m is None or radius_m <= 0:
                continue
            normalized = {key: (value.strip() if isinstance(value, str) else value) for key, value in row.items()}
            normalized.update({
                "location_id": location_id,
                "latitude": latitude,
                "longitude": longitude,
                "radius_m": radius_m,
            })
            rows.append(normalized)
        return rows


def load_location_areas() -> list[dict[str, Any]]:
    if not LOCATION_AREAS_PATH.exists():
        return []

    with LOCATION_AREAS_PATH.open("r", encoding="utf-8") as handle:
        document = json.load(handle)

    if document.get("type") != "FeatureCollection" or not isinstance(document.get("features"), list):
        raise ValueError("data/location_areas.geojson ist keine gültige FeatureCollection.")

    areas: list[dict[str, Any]] = []
    for feature in document["features"]:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        area_id = str(properties.get("area_id", "")).strip()
        location_id = str(properties.get("location_id", "")).strip()
        if not area_id or not location_id:
            continue
        if geometry.get("type") not in {"Polygon", "MultiPolygon"} or not isinstance(geometry.get("coordinates"), list):
            continue
        priority_raw = properties.get("priority", 0)
        try:
            priority = int(priority_raw)
        except Exception:
            priority = 0
        areas.append({
            "area_id": area_id,
            "location_id": location_id,
            "name": str(properties.get("name", "")).strip(),
            "public_name": str(properties.get("public_name", "")).strip(),
            "municipality": str(properties.get("municipality", "")).strip(),
            "country": str(properties.get("country", "")).strip(),
            "priority": priority,
            "geometry": geometry,
        })
    return areas


def point_on_segment(lon: float, lat: float, lon1: float, lat1: float, lon2: float, lat2: float) -> bool:
    epsilon = 1e-10
    cross = (lat - lat1) * (lon2 - lon1) - (lon - lon1) * (lat2 - lat1)
    if abs(cross) > epsilon:
        return False
    squared_length = (lon2 - lon1) ** 2 + (lat2 - lat1) ** 2
    if squared_length <= epsilon ** 2:
        return abs(lon - lon1) <= epsilon and abs(lat - lat1) <= epsilon
    dot = (lon - lon1) * (lon2 - lon1) + (lat - lat1) * (lat2 - lat1)
    if dot < -epsilon:
        return False
    return dot <= squared_length + epsilon


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    if not isinstance(ring, list) or len(ring) < 3:
        return False
    inside = False
    previous_index = len(ring) - 1
    for index, current in enumerate(ring):
        previous = ring[previous_index]
        previous_index = index
        if not (isinstance(current, list) and isinstance(previous, list) and len(current) >= 2 and len(previous) >= 2):
            continue
        current_lon, current_lat = float(current[0]), float(current[1])
        previous_lon, previous_lat = float(previous[0]), float(previous[1])
        if point_on_segment(lon, lat, previous_lon, previous_lat, current_lon, current_lat):
            return True
        crosses_latitude = (current_lat > lat) != (previous_lat > lat)
        if not crosses_latitude:
            continue
        intersection_lon = ((previous_lon - current_lon) * (lat - current_lat)) / (previous_lat - current_lat) + current_lon
        if lon < intersection_lon:
            inside = not inside
    return inside


def point_in_polygon(lon: float, lat: float, rings: list[list[list[float]]]) -> bool:
    if not isinstance(rings, list) or not rings:
        return False
    if not point_in_ring(lon, lat, rings[0]):
        return False
    for hole in rings[1:]:
        if point_in_ring(lon, lat, hole):
            return False
    return True


def point_in_geometry(lon: float, lat: float, geometry: dict[str, Any]) -> bool:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon":
        return point_in_polygon(lon, lat, coordinates)
    if geometry_type == "MultiPolygon":
        return any(point_in_polygon(lon, lat, polygon) for polygon in coordinates)
    return False


def find_area_match(lon: float, lat: float, areas: list[dict[str, Any]]) -> dict[str, Any] | None:
    best = None
    for area in areas:
        if not point_in_geometry(lon, lat, area["geometry"]):
            continue
        if best is None or area["priority"] > best["priority"]:
            best = area
    return best


def unknown_location() -> dict[str, Any]:
    return {
        "status": "unknown",
        "matched_by": "",
        "id": "",
        "area_id": "",
        "name": "",
        "municipality": "",
        "country": "",
        "distance_m": None,
    }


def resolve_location(lat: float | None, lon: float | None, locations: list[dict[str, Any]], areas: list[dict[str, Any]]) -> dict[str, Any]:
    if lat is None or lon is None:
        return unknown_location()
    if lat == 0 and lon == 0:
        return unknown_location()

    area_match = find_area_match(lon, lat, areas)
    if area_match:
        parent = next((item for item in locations if item["location_id"] == area_match["location_id"]), None)
        public_name = area_match["public_name"] or area_match["name"] or (parent.get("public_name") if parent else "") or (parent.get("name") if parent else "")
        return {
            "status": "matched",
            "matched_by": "geo_area",
            "id": area_match["location_id"],
            "area_id": area_match["area_id"],
            "name": public_name,
            "municipality": area_match["municipality"] or (parent.get("municipality", "") if parent else ""),
            "country": area_match["country"] or (parent.get("country", "") if parent else ""),
            "distance_m": None,
        }

    area_managed_location_ids = {area["location_id"] for area in areas}
    best = None
    for location in locations:
        if location["location_id"] in area_managed_location_ids:
            continue
        distance = calculate_distance_meters(lat, lon, location["latitude"], location["longitude"])
        if distance <= location["radius_m"]:
            if best is None or distance < best["distance_m"]:
                best = {
                    "status": "matched",
                    "matched_by": "coordinates",
                    "id": location["location_id"],
                    "area_id": "",
                    "name": location.get("public_name") or location.get("name") or "",
                    "municipality": location.get("municipality", ""),
                    "country": location.get("country", ""),
                    "distance_m": round(distance),
                }
    return best or unknown_location()


def should_rebuild(location: Any) -> bool:
    if not isinstance(location, dict):
        return True
    matched_by = str(location.get("matched_by", "")).strip()
    return matched_by != "location_id"


def locations_equal(left: dict[str, Any], right: dict[str, Any]) -> bool:
    keys = ["status", "matched_by", "id", "area_id", "name", "municipality", "country", "distance_m"]
    return all(left.get(key) == right.get(key) for key in keys)


def normalize_location_block(location: Any) -> dict[str, Any]:
    if not isinstance(location, dict):
        return unknown_location()
    return {
        "status": str(location.get("status", "unknown")),
        "matched_by": str(location.get("matched_by", "")),
        "id": str(location.get("id", "")),
        "area_id": str(location.get("area_id", "")),
        "name": str(location.get("name", "")),
        "municipality": str(location.get("municipality", "")),
        "country": str(location.get("country", "")),
        "distance_m": location.get("distance_m") if isinstance(location.get("distance_m"), int) or location.get("distance_m") is None else None,
    }


def parent_location_record(location_id: str, locations: list[dict[str, Any]]) -> dict[str, Any]:
    parent = next((item for item in locations if item["location_id"] == location_id), None)
    if not parent:
        return unknown_location()
    return {
        "status": "matched",
        "matched_by": "legacy_parent",
        "id": location_id,
        "area_id": "",
        "name": parent.get("public_name") or parent.get("name") or "",
        "municipality": parent.get("municipality", ""),
        "country": parent.get("country", ""),
        "distance_m": None,
    }


def photo_has_reliable_metadata(photo: Any) -> bool:
    if not isinstance(photo, dict):
        return False
    try:
        metadata_version = int(photo.get("metadata_version", 0) or 0)
    except (TypeError, ValueError):
        metadata_version = 0
    return (
        metadata_version >= 1
        and isinstance(photo.get("captured_at"), str)
    )


def is_legacy_photo_submission(document: dict[str, Any]) -> bool:
    uploaded_at = str(document.get("uploaded_at", "")).strip()
    if not uploaded_at:
        return True
    return uploaded_at < LEGACY_PHOTO_GPS_CUTOFF


def submission_has_reliable_photo_metadata(document: dict[str, Any]) -> bool:
    photos = document.get("photos") if isinstance(document.get("photos"), list) else []
    return bool(photos) and all(photo_has_reliable_metadata(photo) for photo in photos)


def rebuild_individual_photo(photo: dict[str, Any], locations: list[dict[str, Any]], areas: list[dict[str, Any]]) -> bool:
    if not photo_has_reliable_metadata(photo):
        return False
    lat = parse_coordinate(photo.get("photo_lat"))
    lon = parse_coordinate(photo.get("photo_lon"))
    if lat is None or lon is None:
        return False
    new_location = resolve_location(lat, lon, locations, areas)
    old_location = normalize_location_block(photo.get("location"))
    if locations_equal(old_location, new_location):
        return False
    photo["location"] = new_location
    return True


def sync_submission_from_first_reliable_photo(document: dict[str, Any]) -> None:
    photos = document.get("photos") if isinstance(document.get("photos"), list) else []
    first = next((photo for photo in photos if photo_has_reliable_metadata(photo)), None)
    if not first:
        return
    document["location"] = normalize_location_block(first.get("location"))
    document["photo_lat"] = parse_coordinate(first.get("photo_lat"))
    document["photo_lon"] = parse_coordinate(first.get("photo_lon"))


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def json_text(document: Any) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def write_json_if_changed(path: Path, document: Any, apply_changes: bool) -> bool:
    content = json_text(document)
    current = path.read_text(encoding="utf-8") if path.exists() else None
    changed = current != content
    if changed and apply_changes:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return changed


def sync_text_file(source: Path, target: Path, apply_changes: bool) -> bool:
    if not source.exists():
        return False
    content = source.read_text(encoding="utf-8")
    current = target.read_text(encoding="utf-8") if target.exists() else None
    changed = current != content
    if changed and apply_changes:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return changed


def load_vessel_names() -> dict[str, str]:
    if not VESSELS_PATH.exists():
        return {}
    names: dict[str, str] = {}
    with VESSELS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            vessel_id = str(row.get("vessel_id", "")).strip()
            name = str(row.get("name", "")).strip()
            if vessel_id:
                names[vessel_id] = name
    return names


def normalized_berth_for_index(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return {
        "status": str(value.get("status", "unknown")),
        "id": str(value.get("id", "")),
        "name": str(value.get("name", "")),
        "short_name": str(value.get("short_name", "")),
        "station_number": str(value.get("station_number", "")),
    }


def photo_index_record(
    *,
    photo: dict[str, Any],
    source_type: str,
    vessel_id: str,
    vessel_name: str,
    submission_id: str = "",
    fallback_captured_at: str = "",
    fallback_location: Any = None,
    berth: Any = None,
    movement: str = "",
) -> dict[str, Any] | None:
    lat = parse_coordinate(photo.get("photo_lat"))
    lon = parse_coordinate(photo.get("photo_lon"))
    if lat is None or lon is None or (lat == 0 and lon == 0):
        return None

    location_value = photo.get("location")
    if not isinstance(location_value, dict):
        location_value = fallback_location

    return {
        "photo_id": str(photo.get("photo_id", "")).strip(),
        "source_type": source_type,
        "submission_id": submission_id,
        "vessel_id": vessel_id,
        "vessel_name": vessel_name,
        "captured_at": str(photo.get("captured_at") or fallback_captured_at or "").strip(),
        "photo_lat": lat,
        "photo_lon": lon,
        "location": normalize_location_block(location_value),
        "berth": normalized_berth_for_index(berth),
        "movement": str(movement or "").strip(),
        "path": str(photo.get("path", "")).strip(),
    }


def build_photo_locations_document() -> dict[str, Any]:
    vessel_names = load_vessel_names()
    records: list[dict[str, Any]] = []

    for path in iter_submission_files():
        try:
            submission = read_json(path)
        except Exception:
            continue

        workflow = submission.get("workflow") if isinstance(submission.get("workflow"), dict) else {}
        review = workflow.get("review") if isinstance(workflow.get("review"), dict) else {}
        auto = workflow.get("auto") if isinstance(workflow.get("auto"), dict) else {}
        vessel_match = auto.get("vessel_match") if isinstance(auto.get("vessel_match"), dict) else {}

        reviewed_id = str(review.get("vessel_id", "")).strip()
        auto_id = str(vessel_match.get("vessel_id", "")).strip()
        vessel_id = reviewed_id if reviewed_id.startswith("VES-") else auto_id if auto_id.startswith("VES-") else ""
        entered_name = str(submission.get("vessel_name_entered", "")).strip()
        vessel_name = vessel_names.get(vessel_id, "") or entered_name or vessel_id
        submission_id = str(submission.get("submission_id", "")).strip()
        captured_at = str(submission.get("captured_at", "")).strip()
        photos = submission.get("photos") if isinstance(submission.get("photos"), list) else []

        for photo in photos:
            if not isinstance(photo, dict):
                continue
            record = photo_index_record(
                photo=photo,
                source_type="sighting",
                vessel_id=vessel_id,
                vessel_name=vessel_name,
                submission_id=submission_id,
                fallback_captured_at=captured_at,
                fallback_location=submission.get("location"),
                berth=submission.get("berth"),
                movement=str(submission.get("movement", "")),
            )
            if record:
                records.append(record)

    for path in iter_vessel_photo_files():
        try:
            document = read_json(path)
        except Exception:
            continue
        vessel_id = str(document.get("vessel_id", "")).strip()
        vessel_name = vessel_names.get(vessel_id, "") or vessel_id
        photos = document.get("photos") if isinstance(document.get("photos"), list) else []
        for photo in photos:
            if not isinstance(photo, dict):
                continue
            record = photo_index_record(
                photo=photo,
                source_type="direct",
                vessel_id=vessel_id,
                vessel_name=vessel_name,
            )
            if record:
                records.append(record)

    records.sort(
        key=lambda item: (
            str(item.get("captured_at", "")),
            str(item.get("photo_id", "")),
        ),
        reverse=True,
    )

    return {
        "schema_version": 1,
        "updated_at": max((str(item.get("captured_at", "")) for item in records), default=""),
        "count": len(records),
        "photos": records,
    }


def rebuild_submission(path: Path, locations: list[dict[str, Any]], areas: list[dict[str, Any]], apply_changes: bool) -> tuple[bool, str, dict[str, Any] | None]:
    document = read_json(path)
    photos = document.get("photos") if isinstance(document.get("photos"), list) else []
    changed = False
    notes: list[str] = []

    if photos and submission_has_reliable_photo_metadata(document):
        photo_changes = 0
        for photo in photos:
            if rebuild_individual_photo(photo, locations, areas):
                photo_changes += 1
        before = normalize_location_block(document.get("location"))
        sync_submission_from_first_reliable_photo(document)
        after = normalize_location_block(document.get("location"))
        if photo_changes or not locations_equal(before, after):
            changed = True
            notes.append(f"{photo_changes} Foto-Standort(e) aktualisiert")
    elif photos:
        current = normalize_location_block(document.get("location"))

        if is_legacy_photo_submission(document):
            # Vor der 0.14.22-Kurzbefehl-Umstellung stammten photo_lat/photo_lon
            # noch nicht zuverlässig aus dem Foto. Scheinbare Polygon-Präzision
            # wird deshalb auf die übergeordnete kanonische Location zurückgenommen.
            if current.get("matched_by") == "geo_area" and current.get("id"):
                restored = parent_location_record(current["id"], locations)
                if not locations_equal(current, restored):
                    document["location"] = restored
                    changed = True
                    notes.append(f'Legacy-Präzision zurückgenommen: {current.get("name") or "<leer>"} -> {restored.get("name") or "<unknown>"}')
        else:
            # Ab 18.08.2026 liefert der 0.14.22-Kurzbefehl für die Sichtung
            # bereits verlässliche GPS-Daten des ersten ausgewählten Fotos.
            # Solche Sichtungen dürfen auf Sichtungsebene weiterhin präzise
            # neu berechnet werden, auch wenn sie noch kein photo_metadata-Array haben.
            lat = parse_coordinate(document.get("photo_lat"))
            lon = parse_coordinate(document.get("photo_lon"))
            if lat is not None and lon is not None and should_rebuild(document.get("location")):
                new_location = resolve_location(lat, lon, locations, areas)
                if not locations_equal(current, new_location):
                    document["location"] = new_location
                    changed = True
                    notes.append(f'{current.get("name") or "<leer>"} -> {new_location.get("name") or "<unknown>"}')
    else:
        # Sichtungen ohne Foto verwenden observer_* als tatsächlichen
        # Beobachterstandort und dürfen weiterhin neu berechnet werden.
        if should_rebuild(document.get("location")):
            lat = parse_coordinate(document.get("observer_lat"))
            lon = parse_coordinate(document.get("observer_lon"))
            if lat is not None and lon is not None:
                new_location = resolve_location(lat, lon, locations, areas)
                old_location = normalize_location_block(document.get("location"))
                if not locations_equal(old_location, new_location):
                    document["location"] = new_location
                    changed = True
                    notes.append(f'{old_location.get("name") or "<leer>"} -> {new_location.get("name") or "<unknown>"}')

    if changed and apply_changes:
        write_json(path, document)

    submission_id = str(document.get("submission_id", "")).strip()
    return changed, "; ".join(notes) or "unchanged", {
        "submission_id": submission_id,
        "location": normalize_location_block(document.get("location")),
        "photos": document.get("photos") if isinstance(document.get("photos"), list) else [],
    }


def rebuild_direct_vessel_photos(path: Path, locations: list[dict[str, Any]], areas: list[dict[str, Any]], apply_changes: bool) -> tuple[int, int]:
    document = read_json(path)
    photos = document.get("photos") if isinstance(document.get("photos"), list) else []
    changed = 0
    scanned = 0
    for photo in photos:
        scanned += 1
        if not should_rebuild(photo.get("location")):
            continue
        lat = parse_coordinate(photo.get("photo_lat"))
        lon = parse_coordinate(photo.get("photo_lon"))
        if lat is None or lon is None:
            continue
        new_location = resolve_location(lat, lon, locations, areas)
        old_location = normalize_location_block(photo.get("location"))
        if locations_equal(old_location, new_location):
            continue
        photo["location"] = new_location
        changed += 1
    if changed and apply_changes:
        write_json(path, document)
    return scanned, changed


def normalize_sighting_photo_from_submission(photo: dict[str, Any]) -> dict[str, Any]:
    return {
        "photo_id": str(photo.get("photo_id", "")),
        "path": str(photo.get("path", "")),
        "filename": str(photo.get("filename", "")),
        "original_filename": str(photo.get("original_filename", "")),
        "mime_type": str(photo.get("mime_type", "image/jpeg")) or "image/jpeg",
        "size_bytes": photo.get("size_bytes") if isinstance(photo.get("size_bytes"), int) else None,
        "sequence": photo.get("sequence") if isinstance(photo.get("sequence"), int) else 0,
        "captured_at": str(photo.get("captured_at", "")),
        "added_at": str(photo.get("added_at", "")),
        "source": str(photo.get("source", "submission")) or "submission",
        "notes": str(photo.get("notes", "")),
        "metadata_version": (
            int(photo.get("metadata_version", 0) or 0)
            if str(photo.get("metadata_version", 0) or 0).lstrip("-").isdigit()
            else 0
        ),
        "photo_lat": parse_coordinate(photo.get("photo_lat")),
        "photo_lon": parse_coordinate(photo.get("photo_lon")),
        "location": normalize_location_block(photo.get("location")) if isinstance(photo.get("location"), dict) else None,
    }


def rebuild_sightings_index_from_submissions(path: Path, submission_states: dict[str, dict[str, Any]], apply_changes: bool) -> tuple[int, int]:
    if not path.exists():
        return 0, 0
    document = read_json(path)
    sightings = document.get("sightings") if isinstance(document.get("sightings"), list) else []
    scanned = 0
    changed = 0
    for sighting in sightings:
        scanned += 1
        submission_id = str(sighting.get("submission_id", "")).strip()
        state = submission_states.get(submission_id)
        if not state:
            continue
        before_location = normalize_location_block(sighting.get("location"))
        after_location = state["location"]
        new_photos = [normalize_sighting_photo_from_submission(photo) for photo in state["photos"] if isinstance(photo, dict)]
        if not locations_equal(before_location, after_location) or sighting.get("photos") != new_photos:
            sighting["location"] = after_location
            sighting["photos"] = new_photos
            sighting["photo_count"] = len(new_photos)
            changed += 1
    if changed and apply_changes:
        write_json(path, document)
    return scanned, changed

def iter_submission_files() -> Iterable[Path]:
    if not SUBMISSIONS_DIR.exists():
        return []
    return sorted(SUBMISSIONS_DIR.rglob("*.json"))


def iter_vessel_photo_files() -> Iterable[Path]:
    if not VESSEL_PHOTOS_DIR.exists():
        return []
    return sorted(VESSEL_PHOTOS_DIR.glob("*.json"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild automatically matched location data using the current polygon/radius rules.")
    parser.add_argument("--apply", action="store_true", help="Änderungen tatsächlich in Dateien schreiben.")
    args = parser.parse_args()

    locations = load_locations()
    areas = load_location_areas()

    submission_scanned = 0
    submission_changed = 0
    submission_logs: list[str] = []
    submission_states: dict[str, dict[str, Any]] = {}
    for submission_path in iter_submission_files():
        submission_scanned += 1
        changed, note, state = rebuild_submission(submission_path, locations, areas, args.apply)
        if state and state.get("submission_id"):
            submission_states[state["submission_id"]] = state
        if changed:
            submission_changed += 1
            submission_logs.append(f"SUBMISSION {submission_path.as_posix()}: {note}")

    vessel_photo_files = 0
    vessel_photo_records = 0
    vessel_photo_changed = 0
    for photo_path in iter_vessel_photo_files():
        vessel_photo_files += 1
        scanned, changed = rebuild_direct_vessel_photos(photo_path, locations, areas, args.apply)
        vessel_photo_records += scanned
        vessel_photo_changed += changed

    sightings_scanned, sightings_changed = rebuild_sightings_index_from_submissions(
        SIGHTINGS_PATH,
        submission_states,
        args.apply
    )

    photo_locations_document = build_photo_locations_document()
    photo_index_changed = write_json_if_changed(
        PHOTO_LOCATIONS_PATH,
        photo_locations_document,
        args.apply
    )
    docs_photo_index_changed = write_json_if_changed(
        DOCS_PHOTO_LOCATIONS_PATH,
        photo_locations_document,
        args.apply
    )
    docs_areas_changed = sync_text_file(
        LOCATION_AREAS_PATH,
        DOCS_LOCATION_AREAS_PATH,
        args.apply
    )

    print("Danube Vessel Log – Rebuild Location Matches")
    print(f"Modus: {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"Submission-Dateien geprüft: {submission_scanned}")
    print(f"Submission-Standorte geändert: {submission_changed}")
    print(f"Direkte-Foto-Dateien geprüft: {vessel_photo_files}")
    print(f"Direkte Fotos geprüft: {vessel_photo_records}")
    print(f"Direkte Foto-Standorte geändert: {vessel_photo_changed}")
    print(f"Sichtungsindex-Einträge geprüft: {sightings_scanned}")
    print(f"Sichtungsindex-Einträge geändert: {sightings_changed}")
    print(f"Foto-Standortindex Einträge: {photo_locations_document['count']}")
    print(f"Foto-Standortindex geändert: {photo_index_changed or docs_photo_index_changed}")
    print(f"Docs-Polygonspiegel geändert: {docs_areas_changed}")
    if submission_logs:
        print("\nBeispiele geänderter Submissions:")
        for line in submission_logs[:20]:
            print(f"- {line}")
        if len(submission_logs) > 20:
            print(f"- ... weitere {len(submission_logs) - 20} Änderungen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
