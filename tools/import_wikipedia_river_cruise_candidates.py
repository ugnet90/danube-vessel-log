#!/usr/bin/env python3
"""Build a searchable candidate catalog from German Wikipedia.

Danube Vessel Log
File: tools/import_wikipedia_river_cruise_candidates.py
Version: 0.10.3
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag


VERSION = "0.10.3"

PAGE_TITLE = (
    "Liste von Flusskreuzfahrtschiffen"
)

PAGE_URL = (
    "https://de.wikipedia.org/wiki/"
    "Liste_von_Flusskreuzfahrtschiffen"
)

API_URL = (
    "https://de.wikipedia.org/w/api.php"
)

LICENSE = "CC BY-SA 4.0"

USER_AGENT = (
    "DanubeVesselLog/0.10.3 "
    "(GitHub Actions candidate import)"
)


ROOT = Path(__file__).resolve().parents[1]

FLAGS_PATH = (
    ROOT
    / "docs"
    / "data"
    / "reference"
    / "flags.json"
)

IMPORT_PATH = (
    ROOT
    / "data"
    / "imports"
    / "wikipedia_river_cruise_ships.json"
)

INDEX_PATH = (
    ROOT
    / "data"
    / "vessel_candidates.csv"
)

REPORT_PATH = (
    ROOT
    / "data"
    / "imports"
    / "wikipedia_river_cruise_import_report.json"
)


INDEX_HEADERS = [
    "candidate_id",
    "name",
    "former_names",
    "name_key",
    "name_key_compact",
    "name_key_without_prefix",
    "eni",
    "imo",
    "year_built",
    "length_m",
    "width_m",
    "passengers",
    "operator",
    "home_port",
    "flag",
    "flag_text",
    "article_url",
    "source_revision_id"
]


SHIP_PREFIXES = {
    "ms",
    "ss",
    "mv",
    "my",
    "ps",
    "mps"
}


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def clean_text(
    value: Any
) -> str:
    text = str(value or "")
    text = text.replace("\xa0", " ")

    text = re.sub(
        r"\[\s*\d+\s*\]",
        "",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def ascii_text(
    value: Any
) -> str:
    text = (
        clean_text(value)
        .casefold()
        .replace("ß", "ss")
    )

    text = unicodedata.normalize(
        "NFKD",
        text
    )

    return "".join(
        character
        for character in text
        if not unicodedata.combining(
            character
        )
    )


def normalize_name(
    value: Any
) -> str:
    tokens = re.findall(
        r"[a-z0-9]+",
        ascii_text(value)
    )

    if (
        len(tokens) >= 3
        and "".join(tokens[:3])
        in SHIP_PREFIXES
    ):
        tokens = [
            "".join(tokens[:3]),
            *tokens[3:]
        ]

    elif (
        len(tokens) >= 2
        and "".join(tokens[:2])
        in SHIP_PREFIXES
    ):
        tokens = [
            "".join(tokens[:2]),
            *tokens[2:]
        ]

    return " ".join(tokens)


def without_prefix(
    name_key: str
) -> str:
    tokens = name_key.split()

    if (
        tokens
        and tokens[0]
        in SHIP_PREFIXES
    ):
        tokens = tokens[1:]

    return " ".join(tokens)


def parse_decimal(
    value: Any
) -> float | None:
    match = re.search(
        (
            r"(?<!\d)"
            r"(\d{1,4}(?:[.,]\d{1,3})?)"
            r"(?!\d)"
        ),
        clean_text(value)
    )

    if not match:
        return None

    try:
        return float(
            match
            .group(1)
            .replace(",", ".")
        )
    except ValueError:
        return None


def parse_integer(
    value: Any,
    maximum: int = 10000
) -> int | None:
    match = re.search(
        r"(?<!\d)(\d{1,5})(?!\d)",
        clean_text(value)
    )

    if not match:
        return None

    number = int(
        match.group(1)
    )

    if 0 <= number <= maximum:
        return number

    return None


def parse_year(
    value: Any
) -> int | None:
    match = re.search(
        (
            r"\b("
            r"18\d{2}|"
            r"19\d{2}|"
            r"20\d{2}|"
            r"2100"
            r")\b"
        ),
        clean_text(value)
    )

    return (
        int(match.group(1))
        if match
        else None
    )


def identifier(
    value: Any,
    label: str,
    digits: int
) -> str:
    match = re.search(
        (
            rf"\b{label}"
            rf"\s*[:#-]?\s*"
            rf"(\d{{{digits}}})\b"
        ),
        clean_text(value),
        re.IGNORECASE
    )

    return (
        match.group(1)
        if match
        else ""
    )


def load_flag_map() -> dict[str, str]:
    if not FLAGS_PATH.exists():
        return {}

    document = json.loads(
        FLAGS_PATH.read_text(
            encoding="utf-8"
        )
    )

    result: dict[str, str] = {}

    for country in document.get(
        "countries",
        []
    ):
        code = clean_text(
            country.get("code")
        ).upper()

        if not re.fullmatch(
            r"[A-Z]{2}",
            code
        ):
            continue

        names = [
            country.get("name"),
            *(
                country.get("aliases")
                or []
            )
        ]

        for name in names:
            key = normalize_name(name)

            if key:
                result[key] = code

    return result


def current_flag_code(
    flag_text: str,
    flag_map: dict[str, str]
) -> str:
    normalized = normalize_name(
        flag_text
    )

    matches = [
        (
            normalized.rfind(
                country_name
            ),
            code
        )
        for country_name, code
        in flag_map.items()
        if normalized.rfind(
            country_name
        ) >= 0
    ]

    return max(
        matches,
        default=(-1, "")
    )[1]


def fetch_wikipedia() -> tuple[str, int]:
    url = (
        f"{API_URL}"
        f"?action=parse"
        f"&page={quote(PAGE_TITLE)}"
        f"&prop=text%7Crevid"
        f"&format=json"
        f"&formatversion=2"
    )

    request = Request(
        url,
        headers={
            "User-Agent":
                USER_AGENT,

            "Accept":
                "application/json"
        }
    )

    with urlopen(
        request,
        timeout=60
    ) as response:
        document = json.load(
            response
        )

    parsed = document.get("parse")

    if not isinstance(
        parsed,
        dict
    ):
        raise RuntimeError(
            "Die Wikipedia-API lieferte "
            "keinen parse-Block."
        )

    html = parsed.get("text")

    revision_id = parsed.get(
        "revid"
    )

    if (
        not isinstance(html, str)
        or not isinstance(
            revision_id,
            int
        )
    ):
        raise RuntimeError(
            "Die Wikipedia-API lieferte "
            "keine verwertbaren Seitendaten."
        )

    return html, revision_id


def find_table(
    soup: BeautifulSoup
) -> Tag:
    for table in soup.select(
        "table.wikitable"
    ):
        header = " ".join(
            clean_text(
                cell.get_text(
                    " ",
                    strip=True
                )
            )
            for cell in table.select(
                "th"
            )
        )

        normalized = (
            header.casefold()
        )

        if (
            "name" in normalized
            and "betreiber"
            in normalized
            and "heimat"
            in normalized
        ):
            return table

    raise RuntimeError(
        "Die erwartete Schiffstabelle "
        "wurde nicht gefunden."
    )


def article_url(
    cell: Tag
) -> str:
    for link in cell.find_all(
        "a",
        href=True
    ):
        href = clean_text(
            link.get("href")
        )

        if (
            href.startswith("/wiki/")
            and not href.startswith(
                "/wiki/Datei:"
            )
        ):
            return urljoin(
                PAGE_URL,
                href
            )

    return ""


def former_names(
    cell: Tag,
    current_name: str
) -> list[str]:
    current_key = normalize_name(
        current_name
    )

    result: list[str] = []

    for element in cell.find_all(
        ["i", "em"]
    ):
        name = clean_text(
            element.get_text(
                " ",
                strip=True
            )
        )

        if (
            name
            and normalize_name(name)
            != current_key
            and name not in result
        ):
            result.append(name)

    return result


def candidate_id(
    record: dict[str, Any]
) -> str:
    identity = record["identity"]
    matching = record["matching"]
    technical = record["technical"]

    if identity["eni"]:
        seed = (
            f"eni:{identity['eni']}"
            f"|name:{matching['name_key']}"
        )

    elif identity["imo"]:
        seed = (
            f"imo:{identity['imo']}"
            f"|name:{matching['name_key']}"
        )

    else:
        seed = (
            f"name:{matching['name_key']}"
            f"|year:"
            f"{technical['year_built'] or ''}"
            f"|length:"
            f"{technical['length_m'] or ''}"
            f"|width:"
            f"{technical['width_m'] or ''}"
        )

    digest = hashlib.sha256(
        seed.encode("utf-8")
    ).hexdigest()[:12].upper()

    return f"CAN-{digest}"


def parse_candidates(
    html: str,
    revision_id: int,
    flag_map: dict[str, str]
) -> list[dict[str, Any]]:
    soup = BeautifulSoup(
        html,
        "html.parser"
    )

    table = find_table(soup)

    result: list[
        dict[str, Any]
    ] = []

    for row_number, row in enumerate(
        table.find_all("tr"),
        start=1
    ):
        cells = row.find_all(
            "td",
            recursive=False
        )

        if len(cells) < 12:
            continue

        texts = [
            clean_text(
                cell.get_text(
                    " ",
                    strip=True
                )
            )
            for cell in cells
        ]

        name = texts[0]

        name_key = normalize_name(
            name
        )

        if not name_key:
            continue

        record: dict[str, Any] = {
            "identity": {
                "name":
                    name,

                "former_names":
                    former_names(
                        cells[11],
                        name
                    ),

                "eni":
                    identifier(
                        texts[1],
                        "ENI",
                        8
                    ),

                "imo":
                    identifier(
                        texts[1],
                        "IMO",
                        7
                    ),

                "identifiers_raw":
                    texts[1]
            },

            "matching": {
                "name_key":
                    name_key,

                "name_key_compact":
                    name_key.replace(
                        " ",
                        ""
                    ),

                "name_key_without_prefix":
                    without_prefix(
                        name_key
                    )
            },

            "classification": {
                "ship_type":
                    "PASSENGER",

                "ship_subtype":
                    "RIVER_CRUISE",

                "source_type_text":
                    "Flusskreuzfahrtschiff",

                "flag":
                    current_flag_code(
                        texts[10],
                        flag_map
                    ),

                "flag_text":
                    texts[10],

                "class_text":
                    texts[8]
            },

            "technical": {
                "year_built":
                    parse_year(
                        texts[3]
                    ),

                "length_m":
                    parse_decimal(
                        texts[4]
                    ),

                "width_m":
                    parse_decimal(
                        texts[5]
                    ),

                "passengers":
                    parse_integer(
                        texts[6]
                    )
            },

            "operations": {
                "operator":
                    texts[7],

                "home_port":
                    texts[9]
            },

            "source_observation": {
                "article_url":
                    article_url(
                        cells[0]
                    ),

                "remarks":
                    texts[11],

                "source_row_number":
                    row_number,

                "source_revision_id":
                    revision_id
            }
        }

        record["candidate_id"] = (
            candidate_id(record)
        )

        result.append(record)

    return result


def merge_duplicates(
    records: list[dict[str, Any]]
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]]
]:
    merged: dict[
        str,
        dict[str, Any]
    ] = {}

    conflicts: list[
        dict[str, Any]
    ] = []

    for record in records:
        candidate = record[
            "candidate_id"
        ]

        existing = merged.get(
            candidate
        )

        if existing is None:
            first_row = (
                record[
                    "source_observation"
                ].pop(
                    "source_row_number"
                )
            )

            record[
                "source_observation"
            ][
                "source_row_numbers"
            ] = [first_row]

            merged[candidate] = record
            continue

        existing[
            "source_observation"
        ][
            "source_row_numbers"
        ].append(
            record[
                "source_observation"
            ][
                "source_row_number"
            ]
        )

        sections = {
            "identity": [
                "former_names",
                "eni",
                "imo",
                "identifiers_raw"
            ],

            "classification": [
                "flag",
                "flag_text",
                "class_text"
            ],

            "technical": [
                "year_built",
                "length_m",
                "width_m",
                "passengers"
            ],

            "operations": [
                "operator",
                "home_port"
            ]
        }

        for section, fields in (
            sections.items()
        ):
            for field in fields:
                old = existing[
                    section
                ].get(field)

                new = record[
                    section
                ].get(field)

                if field == "former_names":
                    existing[
                        section
                    ][field] = list(
                        dict.fromkeys([
                            *(old or []),
                            *(new or [])
                        ])
                    )

                elif old in (
                    None,
                    "",
                    []
                ):
                    existing[
                        section
                    ][field] = new

                elif (
                    new not in (
                        None,
                        "",
                        []
                    )
                    and old != new
                ):
                    conflicts.append({
                        "candidate_id":
                            candidate,

                        "field":
                            (
                                f"{section}."
                                f"{field}"
                            ),

                        "first_value":
                            old,

                        "other_value":
                            new,

                        "source_row_number":
                            record[
                                "source_observation"
                            ][
                                "source_row_number"
                            ]
                    })

    ordered = sorted(
        merged.values(),
        key=lambda item: (
            item["matching"][
                "name_key"
            ],
            item["candidate_id"]
        )
    )

    return ordered, conflicts


def identifier_collisions(
    records: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    result: list[
        dict[str, Any]
    ] = []

    for identifier_name in (
        "eni",
        "imo"
    ):
        groups: dict[
            str,
            list[dict[str, str]]
        ] = {}

        for record in records:
            value = record[
                "identity"
            ][identifier_name]

            if not value:
                continue

            groups.setdefault(
                value,
                []
            ).append({
                "candidate_id":
                    record[
                        "candidate_id"
                    ],

                "name":
                    record[
                        "identity"
                    ][
                        "name"
                    ]
            })

        for value, candidates in (
            groups.items()
        ):
            unique_ids = {
                item["candidate_id"]
                for item in candidates
            }

            if len(unique_ids) > 1:
                result.append({
                    "identifier_type":
                        identifier_name,

                    "identifier":
                        value,

                    "candidates":
                        candidates
                })

    return result


def csv_value(
    value: Any
) -> str:
    if value is None:
        return ""

    return (
        clean_text(value)
        .replace(";", ",")
    )


def write_json(
    path: Path,
    document: Any
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    path.write_text(
        (
            json.dumps(
                document,
                ensure_ascii=False,
                indent=2
            )
            + "\n"
        ),
        encoding="utf-8"
    )


def write_index(
    records: list[dict[str, Any]],
    revision_id: int
) -> None:
    INDEX_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    buffer = StringIO(
        newline=""
    )

    writer = csv.DictWriter(
        buffer,
        fieldnames=INDEX_HEADERS,
        delimiter=";",
        lineterminator="\n"
    )

    writer.writeheader()

    for record in records:
        row = {
            "candidate_id":
                record[
                    "candidate_id"
                ],

            "name":
                record[
                    "identity"
                ][
                    "name"
                ],

            "former_names":
                "|".join(
                    record[
                        "identity"
                    ][
                        "former_names"
                    ]
                ),

            **record["matching"],

            "eni":
                record[
                    "identity"
                ][
                    "eni"
                ],

            "imo":
                record[
                    "identity"
                ][
                    "imo"
                ],

            **record["technical"],

            "operator":
                record[
                    "operations"
                ][
                    "operator"
                ],

            "home_port":
                record[
                    "operations"
                ][
                    "home_port"
                ],

            "flag":
                record[
                    "classification"
                ][
                    "flag"
                ],

            "flag_text":
                record[
                    "classification"
                ][
                    "flag_text"
                ],

            "article_url":
                record[
                    "source_observation"
                ][
                    "article_url"
                ],

            "source_revision_id":
                revision_id
        }

        writer.writerow({
            header:
                csv_value(
                    row.get(
                        header,
                        ""
                    )
                )
            for header
            in INDEX_HEADERS
        })

    INDEX_PATH.write_text(
        buffer.getvalue(),
        encoding="utf-8"
    )


def main() -> int:
    imported_at = now_iso()

    html, revision_id = (
        fetch_wikipedia()
    )

    parsed = parse_candidates(
        html,
        revision_id,
        load_flag_map()
    )

    candidates, conflicts = (
        merge_duplicates(parsed)
    )

    if not candidates:
        raise RuntimeError(
            "Der Wikipedia-Import "
            "ergab keine Kandidaten."
        )

    snapshot = {
        "schema_version":
            1,

        "importer_version":
            VERSION,

        "source": {
            "provider":
                "Wikipedia",

            "title":
                PAGE_TITLE,

            "url":
                PAGE_URL,

            "revision_id":
                revision_id,

            "retrieved_at":
                imported_at,

            "license":
                LICENSE,

            "modified":
                True
        },

        "candidate_count":
            len(candidates),

        "candidates":
            candidates
    }

    write_json(
        IMPORT_PATH,
        snapshot
    )

    write_index(
        candidates,
        revision_id
    )

    report = {
        "schema_version":
            1,

        "importer_version":
            VERSION,

        "generated_at":
            imported_at,

        "source_revision_id":
            revision_id,

        "source_row_count":
            len(parsed),

        "candidate_count":
            len(candidates),

        "merged_duplicate_row_count":
            (
                len(parsed)
                - len(candidates)
            ),

        "duplicate_field_conflicts":
            conflicts,

        "identifier_collisions":
            identifier_collisions(
                candidates
            )
    }

    write_json(
        REPORT_PATH,
        report
    )

    print(
        json.dumps(
            report,
            ensure_ascii=False,
            indent=2
        )
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(
            main()
        )

    except Exception as error:
        print(
            f"FEHLER: {error}",
            file=sys.stderr
        )

        raise
