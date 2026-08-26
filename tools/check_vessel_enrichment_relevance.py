#!/usr/bin/env python3
"""Decide whether a push contains vessel changes relevant to Wikidata enrichment.

Danube Vessel Log
File: tools/check_vessel_enrichment_relevance.py
Version: 0.15.7
Updated: 2026-08-26

Prints exactly ``true`` or ``false`` for use in GitHub Actions.
Only fields that can affect the enrichment report are compared. Pure media/audit
changes (for example after deleting a sighting or changing the primary photo)
do not require a new Wikidata query.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ZERO_SHA = "0" * 40


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.stdout


def load_json_at(revision: str, path: str) -> dict[str, Any] | None:
    result = subprocess.run(
        ["git", "show", f"{revision}:{path}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if result.returncode != 0:
        return None
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def projection(vessel: dict[str, Any] | None) -> Any:
    if vessel is None:
        return None
    audit = vessel.get("audit") if isinstance(vessel.get("audit"), dict) else {}
    return {
        "vessel_id": vessel.get("vessel_id"),
        "identity": vessel.get("identity"),
        "classification": vessel.get("classification"),
        "technical": vessel.get("technical"),
        "operations": vessel.get("operations"),
        "enrichment": vessel.get("enrichment"),
        # Environment changes whether a vessel belongs in the production report.
        "environment": audit.get("environment"),
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("true")
        return 0

    before, after = sys.argv[1:3]
    if not before or before == ZERO_SHA or not after:
        print("true")
        return 0

    try:
        changed = [
            line.strip()
            for line in git("diff", "--name-only", before, after).splitlines()
            if line.strip()
        ]
    except subprocess.CalledProcessError:
        print("true")
        return 0

    always_relevant = {
        "data/vessels.csv",
        "tools/build_vessel_enrichment.py",
        "tools/check_vessel_enrichment_relevance.py",
        ".github/workflows/build-vessel-enrichment.yml",
    }
    if any(path in always_relevant for path in changed):
        print("true")
        return 0

    vessel_paths = [
        path
        for path in changed
        if path.startswith("data/vessels/") and path.endswith(".json")
    ]
    for path in vessel_paths:
        before_value = projection(load_json_at(before, path))
        after_value = projection(load_json_at(after, path))
        if before_value != after_value:
            print("true")
            return 0

    print("false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
