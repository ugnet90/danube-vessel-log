#!/usr/bin/env python3
"""Build a review-only vessel enrichment report from Wikidata.

The script reads data/vessels.csv and the canonical JSON files referenced by
that index. It never modifies vessel records. Suggestions are written to
`docs/data/vessel_enrichment.json` for review in the browser.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
VESSELS_CSV = ROOT / "data" / "vessels.csv"
OUTPUT_PATH = ROOT / "docs" / "data" / "vessel_enrichment.json"

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = os.environ.get(
    "WIKIDATA_USER_AGENT",
    "DanubeVesselLog/0.13.0 (personal vessel database; GitHub Actions)",
)
REQUEST_DELAY = float(os.environ.get("WIKIDATA_DELAY_SECONDS", "0.20"))
REQUEST_TIMEOUT = int(os.environ.get("WIKIDATA_TIMEOUT_SECONDS", "35"))
MAX_CANDIDATES = int(os.environ.get("WIKIDATA_MAX_CANDIDATES", "5"))

# Wikidata properties used by this first enrichment provider.
P_INSTANCE_OF = "P31"
P_IMO = "P458"
P_MMSI = "P587"
P_ENI = "P5910"
P_CALL_SIGN = "P2317"
P_COUNTRY_OF_REGISTRY = "P8047"
P_COUNTRY = "P17"
P_ISO2 = "P297"
P_SERVICE_ENTRY = "P729"
P_INCEPTION = "P571"
P_MANUFACTURER = "P176"
P_LENGTH = "P2043"
P_BEAM = "P2261"
P_DRAFT = "P2262"
P_CAPACITY = "P1083"
P_OPERATOR = "P137"
P_OWNER = "P127"
P_HOME_PORT = "P504"
P_PORT_OF_REGISTRY = "P532"

ITEM_PROPERTIES = {
    P_INSTANCE_OF,
    P_COUNTRY_OF_REGISTRY,
    P_COUNTRY,
    P_MANUFACTURER,
    P_OPERATOR,
    P_OWNER,
    P_HOME_PORT,
    P_PORT_OF_REGISTRY,
}

FIELD_LABELS = {
    "identity.mmsi": "MMSI",
    "identity.imo": "IMO",
    "identity.eni": "ENI",
    "identity.call_sign": "Rufzeichen",
    "classification.ship_type": "Schiffstyp",
    "classification.ship_subtype": "Untertyp",
    "classification.flag": "Flagge",
    "classification.status": "Status",
    "technical.year_built": "Baujahr",
    "technical.shipyard": "Werft",
    "technical.length_m": "Länge",
    "technical.width_m": "Breite",
    "technical.draft_m": "Tiefgang",
    "technical.passengers": "Passagiere",
    "operations.operator": "Betreiber",
    "operations.owner": "Eigentümer",
    "operations.manager": "Manager",
    "operations.cruise_brand": "Marke",
    "operations.home_port": "Heimathafen",
}

REPORT_FIELDS = list(FIELD_LABELS)

PROPERTY_BY_FIELD = {
    "identity.mmsi": P_MMSI,
    "identity.imo": P_IMO,
    "identity.eni": P_ENI,
    "identity.call_sign": P_CALL_SIGN,
    "classification.flag": P_COUNTRY_OF_REGISTRY,
    "technical.year_built": P_SERVICE_ENTRY,
    "technical.shipyard": P_MANUFACTURER,
    "technical.length_m": P_LENGTH,
    "technical.width_m": P_BEAM,
    "technical.draft_m": P_DRAFT,
    "technical.passengers": P_CAPACITY,
    "operations.operator": P_OPERATOR,
    "operations.owner": P_OWNER,
    "operations.home_port": P_HOME_PORT,
}

PROPERTY_LABELS = {
    P_MMSI: "MMSI",
    P_IMO: "IMO ship number",
    P_ENI: "ENI number",
    P_CALL_SIGN: "call sign",
    P_COUNTRY_OF_REGISTRY: "country of registry",
    P_COUNTRY: "country",
    P_SERVICE_ENTRY: "service entry",
    P_INCEPTION: "inception",
    P_MANUFACTURER: "manufacturer",
    P_LENGTH: "length",
    P_BEAM: "beam",
    P_DRAFT: "draft",
    P_CAPACITY: "maximum capacity",
    P_OPERATOR: "operator",
    P_OWNER: "owned by",
    P_HOME_PORT: "shipping port",
    P_PORT_OF_REGISTRY: "port of registry",
}

METRE_UNITS = {"Q11573": 1.0}
CENTIMETRE_UNITS = {"Q174728": 0.01}
MILLIMETRE_UNITS = {"Q174789": 0.001}
FOOT_UNITS = {"Q3710": 0.3048}


@dataclass
class VesselRecord:
    vessel_id: str
    path: Path
    index: dict[str, str]
    vessel: dict[str, Any]


class LookupErrorWithContext(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Only build the missing-field report; skip Wikidata calls.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run internal parser tests and exit.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help="Output JSON path.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_text(value: Any) -> str:
    text = str(value or "").strip()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def nested_get(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def is_missing(path: str, value: Any) -> bool:
    if path == "classification.status":
        return value in (None, "", "unknown")
    if value is None or value == "":
        return True
    if isinstance(value, list):
        return len(value) == 0
    return False


def load_vessels() -> list[VesselRecord]:
    if not VESSELS_CSV.exists():
        raise FileNotFoundError(f"{VESSELS_CSV} fehlt.")

    records: list[VesselRecord] = []
    with VESSELS_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            vessel_id = str(row.get("vessel_id") or "").strip()
            json_path = str(row.get("json_path") or "").strip()
            if not vessel_id or not json_path:
                continue
            path = ROOT / json_path
            if not path.exists():
                records.append(
                    VesselRecord(
                        vessel_id=vessel_id,
                        path=path,
                        index={key: str(value or "") for key, value in row.items()},
                        vessel={},
                    )
                )
                continue
            try:
                vessel = json.loads(path.read_text(encoding="utf-8-sig"))
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"{json_path} konnte nicht gelesen werden: {exc}") from exc
            records.append(
                VesselRecord(
                    vessel_id=vessel_id,
                    path=path,
                    index={key: str(value or "") for key, value in row.items()},
                    vessel=vessel if isinstance(vessel, dict) else {},
                )
            )
    return records


def request_json(url: str, *, accept: str = "application/json") -> Any:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": accept},
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt == 3:
                break
            time.sleep(1.5 * (attempt + 1))
    raise LookupErrorWithContext(f"Abruf fehlgeschlagen: {url}: {last_error}")


def sparql_exact_matches(vessel: dict[str, Any]) -> dict[str, list[str]]:
    identity = vessel.get("identity") if isinstance(vessel.get("identity"), dict) else {}
    pairs = [
        (P_IMO, str(identity.get("imo") or "").strip(), "identity.imo"),
        (P_MMSI, str(identity.get("mmsi") or "").strip(), "identity.mmsi"),
        (P_ENI, str(identity.get("eni") or "").strip(), "identity.eni"),
    ]
    blocks = []
    for prop, value, matched_by in pairs:
        if not value:
            continue
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        blocks.append(
            f'{{ ?item wdt:{prop} "{escaped}" . BIND("{matched_by}" AS ?matchedBy) }}'
        )
    if not blocks:
        return {}
    query = "SELECT DISTINCT ?item ?matchedBy WHERE { " + " UNION ".join(blocks) + " } LIMIT 20"
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    payload = request_json(url, accept="application/sparql-results+json")
    matches: dict[str, list[str]] = {}
    for binding in payload.get("results", {}).get("bindings", []):
        uri = str(binding.get("item", {}).get("value") or "")
        qid = uri.rsplit("/", 1)[-1]
        matched_by = str(binding.get("matchedBy", {}).get("value") or "identifier")
        if re.fullmatch(r"Q\d+", qid):
            matches.setdefault(qid, []).append(matched_by)
    return matches


def search_name(name: str) -> list[str]:
    if not name.strip():
        return []
    params = {
        "action": "wbsearchentities",
        "search": name,
        "language": "de",
        "uselang": "de",
        "type": "item",
        "limit": str(max(8, MAX_CANDIDATES * 2)),
        "format": "json",
        "origin": "*",
    }
    payload = request_json(WIKIDATA_API + "?" + urllib.parse.urlencode(params))
    return [
        str(item.get("id"))
        for item in payload.get("search", [])
        if re.fullmatch(r"Q\d+", str(item.get("id") or ""))
    ]


def chunked(values: list[str], size: int) -> Iterable[list[str]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def get_entities(qids: Iterable[str]) -> dict[str, dict[str, Any]]:
    ordered = list(dict.fromkeys(qid for qid in qids if re.fullmatch(r"Q\d+", qid)))
    entities: dict[str, dict[str, Any]] = {}
    for batch in chunked(ordered, 50):
        params = {
            "action": "wbgetentities",
            "ids": "|".join(batch),
            "props": "labels|descriptions|aliases|claims|info",
            "languages": "de|en",
            "languagefallback": "1",
            "format": "json",
            "origin": "*",
        }
        payload = request_json(WIKIDATA_API + "?" + urllib.parse.urlencode(params))
        for qid, entity in payload.get("entities", {}).items():
            if isinstance(entity, dict) and not entity.get("missing"):
                entities[qid] = entity
        time.sleep(REQUEST_DELAY)
    return entities


def claim_statements(entity: dict[str, Any], prop: str) -> list[dict[str, Any]]:
    statements = entity.get("claims", {}).get(prop, [])
    if not isinstance(statements, list):
        return []
    usable = [item for item in statements if item.get("rank") != "deprecated"]
    preferred = [item for item in usable if item.get("rank") == "preferred"]
    return preferred or usable


def datavalue(statement: dict[str, Any]) -> Any:
    return statement.get("mainsnak", {}).get("datavalue", {}).get("value")


def string_values(entity: dict[str, Any], prop: str) -> list[str]:
    values: list[str] = []
    for statement in claim_statements(entity, prop):
        value = datavalue(statement)
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
    return list(dict.fromkeys(values))


def item_values(entity: dict[str, Any], prop: str) -> list[str]:
    values: list[str] = []
    for statement in claim_statements(entity, prop):
        value = datavalue(statement)
        qid = value.get("id") if isinstance(value, dict) else None
        if re.fullmatch(r"Q\d+", str(qid or "")):
            values.append(str(qid))
    return list(dict.fromkeys(values))


def time_year(entity: dict[str, Any], prop: str) -> int | None:
    for statement in claim_statements(entity, prop):
        value = datavalue(statement)
        raw = value.get("time") if isinstance(value, dict) else None
        match = re.match(r"^[+-](\d{4,})-", str(raw or ""))
        if match:
            year = int(match.group(1))
            if 1700 <= year <= datetime.now(timezone.utc).year + 2:
                return year
    return None


def quantity_value(entity: dict[str, Any], prop: str, *, integer: bool = False) -> int | float | None:
    for statement in claim_statements(entity, prop):
        value = datavalue(statement)
        if not isinstance(value, dict):
            continue
        try:
            amount = float(str(value.get("amount") or "").replace("+", ""))
        except ValueError:
            continue
        unit_uri = str(value.get("unit") or "")
        unit_qid = unit_uri.rsplit("/", 1)[-1] if unit_uri else ""
        factor = 1.0
        if unit_qid in METRE_UNITS or not unit_qid:
            factor = 1.0
        elif unit_qid in CENTIMETRE_UNITS:
            factor = CENTIMETRE_UNITS[unit_qid]
        elif unit_qid in MILLIMETRE_UNITS:
            factor = MILLIMETRE_UNITS[unit_qid]
        elif unit_qid in FOOT_UNITS:
            factor = FOOT_UNITS[unit_qid]
        elif prop in {P_LENGTH, P_BEAM, P_DRAFT}:
            continue
        result = amount * factor
        if not math.isfinite(result):
            continue
        if integer:
            return int(round(result))
        return round(result, 3)
    return None


def entity_label(entity: dict[str, Any], fallback: str = "") -> str:
    labels = entity.get("labels", {})
    for language in ("de", "en"):
        value = labels.get(language, {}).get("value")
        if value:
            return str(value).strip()
    return fallback


def entity_description(entity: dict[str, Any]) -> str:
    descriptions = entity.get("descriptions", {})
    for language in ("de", "en"):
        value = descriptions.get(language, {}).get("value")
        if value:
            return str(value).strip()
    return ""


def entity_names(entity: dict[str, Any]) -> list[str]:
    names = [entity_label(entity)]
    aliases = entity.get("aliases", {})
    for language in ("de", "en"):
        for alias in aliases.get(language, []) if isinstance(aliases.get(language), list) else []:
            value = alias.get("value") if isinstance(alias, dict) else None
            if value:
                names.append(str(value).strip())
    return list(dict.fromkeys(name for name in names if name))


def collect_referenced_qids(entities: dict[str, dict[str, Any]]) -> set[str]:
    result: set[str] = set()
    for entity in entities.values():
        for prop in ITEM_PROPERTIES:
            result.update(item_values(entity, prop))
    return result


def first_item_label(
    entity: dict[str, Any],
    properties: Iterable[str],
    referenced: dict[str, dict[str, Any]],
) -> tuple[str, str] | tuple[None, None]:
    for prop in properties:
        for qid in item_values(entity, prop):
            label = entity_label(referenced.get(qid, {}), qid)
            if label:
                return label, prop
    return None, None


def country_suggestion(
    entity: dict[str, Any],
    referenced: dict[str, dict[str, Any]],
) -> tuple[str, str, str] | tuple[None, None, None]:
    for prop in (P_COUNTRY_OF_REGISTRY, P_COUNTRY):
        for qid in item_values(entity, prop):
            country = referenced.get(qid, {})
            code_values = string_values(country, P_ISO2)
            if code_values:
                return code_values[0].upper(), entity_label(country, code_values[0]), prop
    return None, None, None


def current_value(vessel: dict[str, Any], path: str) -> Any:
    return nested_get(vessel, path)


def suggestion(
    *,
    path: str,
    value: Any,
    prop: str,
    candidate_qid: str,
    score: float,
    display_value: str | None = None,
) -> dict[str, Any] | None:
    if value is None or value == "":
        return None
    return {
        "field": path,
        "field_label": FIELD_LABELS[path],
        "value": value,
        "display_value": display_value if display_value is not None else value,
        "property": prop,
        "property_label": PROPERTY_LABELS.get(prop, prop),
        "property_url": f"https://www.wikidata.org/wiki/Property:{prop}",
        "source_url": f"https://www.wikidata.org/wiki/{candidate_qid}",
        "confidence": round(score, 3),
        "apply_supported": True,
    }


def build_suggestions(
    vessel: dict[str, Any],
    qid: str,
    entity: dict[str, Any],
    referenced: dict[str, dict[str, Any]],
    score: float,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    def add(path: str, value: Any, prop: str, display: str | None = None) -> None:
        if not is_missing(path, current_value(vessel, path)):
            return
        item = suggestion(
            path=path,
            value=value,
            prop=prop,
            candidate_qid=qid,
            score=score,
            display_value=display,
        )
        if item:
            result.append(item)

    values = string_values(entity, P_MMSI)
    if values:
        add("identity.mmsi", values[0], P_MMSI)
    values = string_values(entity, P_IMO)
    if values:
        add("identity.imo", values[0], P_IMO)
    values = string_values(entity, P_ENI)
    if values:
        add("identity.eni", values[0], P_ENI)
    values = string_values(entity, P_CALL_SIGN)
    if values:
        add("identity.call_sign", values[0], P_CALL_SIGN)

    flag_code, flag_label, flag_prop = country_suggestion(entity, referenced)
    if flag_code and flag_prop:
        add("classification.flag", flag_code, flag_prop, flag_label)

    year = time_year(entity, P_SERVICE_ENTRY)
    year_prop = P_SERVICE_ENTRY
    if year is None:
        year = time_year(entity, P_INCEPTION)
        year_prop = P_INCEPTION
    if year is not None:
        add("technical.year_built", year, year_prop)

    shipyard, shipyard_prop = first_item_label(entity, (P_MANUFACTURER,), referenced)
    if shipyard and shipyard_prop:
        add("technical.shipyard", shipyard, shipyard_prop)

    length = quantity_value(entity, P_LENGTH)
    if length is not None:
        add("technical.length_m", length, P_LENGTH)
    width = quantity_value(entity, P_BEAM)
    if width is not None:
        add("technical.width_m", width, P_BEAM)
    draft = quantity_value(entity, P_DRAFT)
    if draft is not None:
        add("technical.draft_m", draft, P_DRAFT)
    passengers = quantity_value(entity, P_CAPACITY, integer=True)
    if passengers is not None:
        add("technical.passengers", passengers, P_CAPACITY)

    operator, operator_prop = first_item_label(entity, (P_OPERATOR,), referenced)
    if operator and operator_prop:
        add("operations.operator", operator, operator_prop)
    owner, owner_prop = first_item_label(entity, (P_OWNER,), referenced)
    if owner and owner_prop:
        add("operations.owner", owner, owner_prop)
    home_port, home_port_prop = first_item_label(
        entity, (P_HOME_PORT, P_PORT_OF_REGISTRY), referenced
    )
    if home_port and home_port_prop:
        add("operations.home_port", home_port, home_port_prop)

    return result


def identifiers(entity: dict[str, Any]) -> dict[str, list[str]]:
    return {
        "mmsi": string_values(entity, P_MMSI),
        "imo": string_values(entity, P_IMO),
        "eni": string_values(entity, P_ENI),
        "call_sign": string_values(entity, P_CALL_SIGN),
    }


def score_candidate(
    vessel: dict[str, Any],
    entity: dict[str, Any],
    exact_matches: list[str],
    name_search_rank: int | None,
) -> tuple[float, list[str]]:
    matched_by = list(dict.fromkeys(exact_matches))
    identity = vessel.get("identity") if isinstance(vessel.get("identity"), dict) else {}
    candidate_ids = identifiers(entity)

    for key, field in (("imo", "identity.imo"), ("mmsi", "identity.mmsi"), ("eni", "identity.eni")):
        value = str(identity.get(key) or "").strip()
        if value and value in candidate_ids[key] and field not in matched_by:
            matched_by.append(field)

    if matched_by:
        return 1.0, matched_by

    vessel_names = [str(identity.get("name") or "")]
    former_names = identity.get("former_names")
    if isinstance(former_names, list):
        vessel_names.extend(str(item) for item in former_names)
    vessel_norms = {normalize_text(name) for name in vessel_names if normalize_text(name)}
    candidate_norms = {normalize_text(name) for name in entity_names(entity) if normalize_text(name)}

    if vessel_norms & candidate_norms:
        matched_by.append("name")
        score = 0.92
    elif any(a in b or b in a for a in vessel_norms for b in candidate_norms if len(a) >= 5 and len(b) >= 5):
        matched_by.append("name_partial")
        score = 0.76
    else:
        score = 0.45

    if name_search_rank is not None:
        score += max(0.0, 0.04 - name_search_rank * 0.005)
    if any(candidate_ids[key] for key in ("imo", "mmsi", "eni")):
        score += 0.02
    return min(score, 0.99), matched_by


def confidence_label(score: float) -> str:
    if score >= 0.98:
        return "very_high"
    if score >= 0.90:
        return "high"
    if score >= 0.82:
        return "medium"
    return "low"


def build_candidate_reports(
    vessel: dict[str, Any],
    exact: dict[str, list[str]],
    search_qids: list[str],
) -> list[dict[str, Any]]:
    qids = list(dict.fromkeys([*exact.keys(), *search_qids]))
    entities = get_entities(qids)
    referenced_qids = collect_referenced_qids(entities)
    referenced = get_entities(referenced_qids) if referenced_qids else {}
    search_rank = {qid: rank for rank, qid in enumerate(search_qids)}

    candidates: list[dict[str, Any]] = []
    for qid, entity in entities.items():
        score, matched_by = score_candidate(
            vessel,
            entity,
            exact.get(qid, []),
            search_rank.get(qid),
        )
        if score < 0.65:
            continue
        suggestions = build_suggestions(vessel, qid, entity, referenced, score)
        candidates.append(
            {
                "qid": qid,
                "label": entity_label(entity, qid),
                "description": entity_description(entity),
                "url": f"https://www.wikidata.org/wiki/{qid}",
                "score": round(score, 3),
                "confidence": confidence_label(score),
                "matched_by": matched_by,
                "identifiers": identifiers(entity),
                "instance_of": [
                    entity_label(referenced.get(item_qid, {}), item_qid)
                    for item_qid in item_values(entity, P_INSTANCE_OF)
                ],
                "suggestions": suggestions,
                "revision_id": entity.get("lastrevid"),
            }
        )
    candidates.sort(key=lambda item: (-item["score"], item["label"].casefold()))
    return candidates[:MAX_CANDIDATES]


def build_record(record: VesselRecord, offline: bool) -> dict[str, Any]:
    vessel = record.vessel
    identity = vessel.get("identity") if isinstance(vessel.get("identity"), dict) else {}
    audit = vessel.get("audit") if isinstance(vessel.get("audit"), dict) else {}
    missing = [
        {"field": path, "label": FIELD_LABELS[path]}
        for path in REPORT_FIELDS
        if is_missing(path, current_value(vessel, path))
    ]
    item: dict[str, Any] = {
        "vessel_id": record.vessel_id,
        "name": str(identity.get("name") or record.index.get("name") or record.vessel_id),
        "environment": str(audit.get("environment") or "production"),
        "json_path": str(record.index.get("json_path") or record.path.relative_to(ROOT)),
        "missing_fields": missing,
        "missing_count": len(missing),
        "lookup": {
            "provider": "wikidata",
            "status": "not_needed" if not missing else ("offline" if offline else "pending"),
            "error": "",
            "candidates": [],
        },
    }
    if not missing or offline:
        return item

    try:
        exact = sparql_exact_matches(vessel)
        name = str(identity.get("name") or record.index.get("name") or "").strip()
        search_qids = search_name(name)
        candidates = build_candidate_reports(vessel, exact, search_qids)
        best = candidates[0] if candidates else None
        if best and best["score"] >= 0.82:
            status = "candidate" if best["suggestions"] else "matched_no_new_data"
        elif candidates:
            status = "low_confidence"
        else:
            status = "no_match"
        item["lookup"] = {
            "provider": "wikidata",
            "status": status,
            "error": "",
            "candidates": candidates,
        }
    except Exception as exc:  # Keep the report usable if one lookup fails.
        item["lookup"] = {
            "provider": "wikidata",
            "status": "lookup_error",
            "error": str(exc),
            "candidates": [],
        }
    time.sleep(REQUEST_DELAY)
    return item


def build_report(records: list[VesselRecord], offline: bool) -> dict[str, Any]:
    vessels = []
    for position, record in enumerate(records, start=1):
        print(f"[{position}/{len(records)}] {record.vessel_id}", flush=True)
        vessels.append(build_record(record, offline))

    summary = {
        "vessels_total": len(vessels),
        "vessels_incomplete": sum(item["missing_count"] > 0 for item in vessels),
        "vessels_complete": sum(item["missing_count"] == 0 for item in vessels),
        "candidate_matches": sum(item["lookup"]["status"] == "candidate" for item in vessels),
        "matched_no_new_data": sum(item["lookup"]["status"] == "matched_no_new_data" for item in vessels),
        "low_confidence": sum(item["lookup"]["status"] == "low_confidence" for item in vessels),
        "no_match": sum(item["lookup"]["status"] == "no_match" for item in vessels),
        "lookup_errors": sum(item["lookup"]["status"] == "lookup_error" for item in vessels),
        "suggestions_total": sum(
            len(candidate.get("suggestions", []))
            for item in vessels
            for candidate in item["lookup"].get("candidates", [])[:1]
        ),
    }
    return {
        "schema_version": 1,
        "generated_at": utc_now(),
        "provider": {
            "id": "wikidata",
            "label": "Wikidata",
            "license": "CC0",
            "url": "https://www.wikidata.org/",
        },
        "mode": "offline" if offline else "online",
        "field_labels": FIELD_LABELS,
        "summary": summary,
        "vessels": vessels,
    }


def self_test() -> None:
    assert normalize_text("AmaMora") == "AMAMORA"
    assert normalize_text("MS Ama-Mora") == "MSAMAMORA"
    vessel = {
        "identity": {"mmsi": "", "imo": "", "eni": "", "call_sign": ""},
        "classification": {"ship_type": "", "ship_subtype": "", "flag": "", "status": "unknown"},
        "technical": {"year_built": None, "shipyard": "", "length_m": None, "width_m": None, "draft_m": None, "passengers": None},
        "operations": {"operator": "", "owner": "", "manager": "", "cruise_brand": "", "home_port": ""},
    }
    assert all(is_missing(path, current_value(vessel, path)) for path in REPORT_FIELDS)
    quantity_entity = {
        "claims": {
            P_LENGTH: [
                {
                    "rank": "normal",
                    "mainsnak": {"datavalue": {"value": {"amount": "+135", "unit": "http://www.wikidata.org/entity/Q11573"}}},
                }
            ]
        }
    }
    assert quantity_value(quantity_entity, P_LENGTH) == 135.0
    print("Self-test OK")


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0
    records = load_vessels()
    report = build_report(records, args.offline)
    output = args.output if args.output.is_absolute() else ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Report written: {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
