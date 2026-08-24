#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/sync_public_data.py
Version: 0.14.52
Updated: 2026-08-24

Synchronisiert die für GitHub Pages benötigten öffentlichen Datenspiegel
unter docs/data/ ausschließlich aus den kanonischen Dateien unter data/.
Die Dateien unter docs/data/ werden nicht manuell gepflegt.
Der Workflow .github/workflows/sync_public_data.yml führt --apply bei
Änderungen der kanonischen Dateien auf main automatisch aus.
"""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAIRS = (
    (
        ROOT / "data" / "location_areas.geojson",
        ROOT / "docs" / "data" / "location_areas.geojson",
    ),
    (
        ROOT / "data" / "photo_locations.json",
        ROOT / "docs" / "data" / "photo_locations.json",
    ),
    (
        ROOT / "data" / "berth_geometries.geojson",
        ROOT / "docs" / "data" / "berth_geometries.geojson",
    ),
)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def compare(source: Path, target: Path) -> bool:
    return (
        source.exists()
        and target.exists()
        and source.read_bytes() == target.read_bytes()
    )


def apply_sync() -> int:
    changed = 0
    for source, target in PAIRS:
        if not source.exists():
            raise FileNotFoundError(f"Kanonische Datei fehlt: {relative(source)}")
        source_bytes = source.read_bytes()
        current = target.read_bytes() if target.exists() else None
        if current == source_bytes:
            print(f"OK: {relative(target)} ist bereits synchron.")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source_bytes)
        changed += 1
        print(f"SYNC: {relative(source)} -> {relative(target)}")
    return changed


def check_sync() -> list[tuple[Path, Path]]:
    mismatches = []
    for source, target in PAIRS:
        if compare(source, target):
            print(f"OK: {relative(source)} == {relative(target)}")
        else:
            mismatches.append((source, target))
            print(f"FEHLER: {relative(source)} != {relative(target)}")
    return mismatches


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Synchronisiert kanonische Kartendaten nach docs/data/."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Abweichende öffentliche Spiegel aus data/ überschreiben.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Bei einer Abweichung mit Fehlercode beenden.",
    )
    args = parser.parse_args()

    if args.apply:
        changed = apply_sync()
        print(f"Geänderte Spiegeldateien: {changed}")

    mismatches = check_sync()
    if mismatches and (args.check or args.apply):
        return 1

    if not args.apply and not args.check:
        print("Nur geprüft. Mit --apply werden Abweichungen synchronisiert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
