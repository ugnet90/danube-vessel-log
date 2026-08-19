#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/rebuild_location_matches.py
Version: 0.14.26
Updated: 2026-08-19

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


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, document: Any) -> None:
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rebuild_submission(path: Path, locations: list[dict[str, Any]], areas: list[dict[str, Any]], apply_changes: bool) -> tuple[bool, str]:
    document = read_json(path)
    location_block = document.get("location")
    if not should_rebuild(location_block):
        return False, "manual"

    lat = parse_coordinate(document.get("observer_lat"))
    lon = parse_coordinate(document.get("observer_lon"))
    if lat is None or lon is None:
        lat = parse_coordinate(document.get("photo_lat"))
        lon = parse_coordinate(document.get("photo_lon"))

    if lat is None or lon is None:
        return False, "no_coordinates"

    new_location = resolve_location(lat, lon, locations, areas)
    old_location = normalize_location_block(location_block)
    if locations_equal(old_location, new_location):
        return False, "unchanged"

    document["location"] = new_location
    if apply_changes:
        write_json(path, document)
    return True, f'{old_location.get("name", "") or "<leer>"} -> {new_location.get("name", "") or "<unknown>"}'


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


def rebuild_sightings_index(path: Path, locations: list[dict[str, Any]], areas: list[dict[str, Any]], apply_changes: bool) -> tuple[int, int]:
    if not path.exists():
        return 0, 0
    document = read_json(path)
    sightings = document.get("sightings") if isinstance(document.get("sightings"), list) else []
    scanned = 0
    changed = 0
    for sighting in sightings:
        scanned += 1
        if not should_rebuild(sighting.get("location")):
            continue
        lat = parse_coordinate(sighting.get("observer_lat"))
        lon = parse_coordinate(sighting.get("observer_lon"))
        if lat is None or lon is None:
            lat = parse_coordinate(sighting.get("photo_lat"))
            lon = parse_coordinate(sighting.get("photo_lon"))
        if lat is None or lon is None:
            continue
        new_location = resolve_location(lat, lon, locations, areas)
        old_location = normalize_location_block(sighting.get("location"))
        if locations_equal(old_location, new_location):
            continue
        sighting["location"] = new_location
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
    for submission_path in iter_submission_files():
        submission_scanned += 1
        changed, note = rebuild_submission(submission_path, locations, areas, args.apply)
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

    sightings_scanned, sightings_changed = rebuild_sightings_index(SIGHTINGS_PATH, locations, areas, args.apply)

    print("Danube Vessel Log – Rebuild Location Matches")
    print(f"Modus: {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"Submission-Dateien geprüft: {submission_scanned}")
    print(f"Submission-Standorte geändert: {submission_changed}")
    print(f"Direkte-Foto-Dateien geprüft: {vessel_photo_files}")
    print(f"Direkte Fotos geprüft: {vessel_photo_records}")
    print(f"Direkte Foto-Standorte geändert: {vessel_photo_changed}")
    print(f"Sichtungsindex-Einträge geprüft: {sightings_scanned}")
    print(f"Sichtungsindex-Einträge geändert: {sightings_changed}")
    if submission_logs:
        print("\nBeispiele geänderter Submissions:")
        for line in submission_logs[:20]:
            print(f"- {line}")
        if len(submission_logs) > 20:
            print(f"- ... weitere {len(submission_logs) - 20} Änderungen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
