#!/usr/bin/env python3
"""
Danube Vessel Log
File: tools/find_version_suffixes.py
Version: 1.0.0

Listet Versionssuffixe wie ?v=0.14.2 oder &v=0.14.2
in src- und href-Attributen aller HTML-Dateien auf.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

VERSION_PATTERN = re.compile(
    r"""(?P<attribute>\b(?:src|href)\s*=\s*)
        (?P<quote>["'])
        (?P<reference>[^"']*?(?:\?|&)v=(?P<version>[^"'&\s<>]+)[^"']*)
        (?P=quote)
    """,
    re.IGNORECASE | re.VERBOSE,
)

EXCLUDED_DIRS = {
    ".git",
    ".github",
    "node_modules",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
}


@dataclass(frozen=True)
class Finding:
    file: str
    line: int
    reference: str
    version: str


def iter_html_files(root: Path) -> Iterable[Path]:
    for current_root, dir_names, file_names in os.walk(root):
        dir_names[:] = [
            name for name in dir_names
            if name not in EXCLUDED_DIRS
        ]

        current_path = Path(current_root)

        for file_name in file_names:
            if file_name.lower().endswith((".html", ".htm")):
                yield current_path / file_name


def scan_file(path: Path, root: Path) -> list[Finding]:
    try:
        content = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        content = path.read_text(encoding="latin-1")

    findings: list[Finding] = []

    for line_number, line in enumerate(content.splitlines(), start=1):
        for match in VERSION_PATTERN.finditer(line):
            findings.append(
                Finding(
                    file=path.relative_to(root).as_posix(),
                    line=line_number,
                    reference=match.group("reference"),
                    version=match.group("version"),
                )
            )

    return findings


def scan_repository(root: Path) -> tuple[int, list[Finding]]:
    html_count = 0
    findings: list[Finding] = []

    for path in sorted(iter_html_files(root)):
        html_count += 1
        findings.extend(scan_file(path, root))

    findings.sort(
        key=lambda item: (
            item.file.lower(),
            item.line,
            item.reference.lower(),
        )
    )
    return html_count, findings


def build_text_report(root: Path, html_count: int, findings: list[Finding]) -> str:
    lines = [
        "Versionssuffix-Prüfung",
        f"Repository: {root.resolve()}",
        f"Geprüfte HTML-Dateien: {html_count}",
        f"Gefundene Versionssuffixe: {len(findings)}",
        "",
    ]

    if not findings:
        lines.append(
            "Keine src-/href-Verweise mit ?v=... oder &v=... gefunden."
        )
        return "\n".join(lines) + "\n"

    for finding in findings:
        lines.append(
            f"{finding.file}:{finding.line} | "
            f"v={finding.version} | {finding.reference}"
        )

    return "\n".join(lines) + "\n"


def build_markdown_report(html_count: int, findings: list[Finding]) -> str:
    lines = [
        "## Versionssuffix-Prüfung",
        "",
        f"- Geprüfte HTML-Dateien: **{html_count}**",
        f"- Gefundene Versionssuffixe: **{len(findings)}**",
        "",
    ]

    if not findings:
        lines.append(
            "✅ Keine `?v=...`- oder `&v=...`-Suffixe "
            "in `src`/`href` gefunden."
        )
        return "\n".join(lines) + "\n"

    lines.extend([
        "| HTML-Datei | Zeile | Version | Verweis |",
        "|---|---:|---|---|",
    ])

    for finding in findings:
        file_cell = html.escape(finding.file).replace("|", r"\|")
        reference_cell = html.escape(finding.reference).replace("|", r"\|")
        version_cell = html.escape(finding.version).replace("|", r"\|")
        lines.append(
            f"| `{file_cell}` | {finding.line} | "
            f"`{version_cell}` | `{reference_cell}` |"
        )

    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Listet src-/href-Verweise mit Versionssuffixen "
            "wie ?v=0.14.2 in allen HTML-Dateien auf."
        )
    )
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--report",
        default="version_suffix_report.txt",
    )
    parser.add_argument(
        "--markdown-report",
        default="version_suffix_report.md",
    )
    parser.add_argument(
        "--fail-on-findings",
        action="store_true",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()

    if not root.is_dir():
        print(
            f"Fehler: Repository-Verzeichnis nicht gefunden: {root}",
            file=sys.stderr,
        )
        return 2

    html_count, findings = scan_repository(root)
    text_report = build_text_report(root, html_count, findings)
    markdown_report = build_markdown_report(html_count, findings)

    report_path = Path(args.report)
    markdown_path = Path(args.markdown_report)

    report_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)

    report_path.write_text(text_report, encoding="utf-8")
    markdown_path.write_text(markdown_report, encoding="utf-8")

    print(text_report, end="")

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write(markdown_report)

    if args.fail_on_findings and findings:
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
