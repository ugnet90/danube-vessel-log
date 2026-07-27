#!/usr/bin/env python3
# Danube Vessel Log
# File: tools/audit_optimize_photos.py
# Version: 0.1.0
# Updated: 2026-07-27

"""Find oversized photos and optionally optimize them safely."""

from __future__ import annotations

import argparse
import csv
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps


IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp",
    ".gif", ".bmp", ".tif", ".tiff",
}

OPTIMIZABLE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp",
}


@dataclass
class Result:
    path: str
    format: str = ""
    original_bytes: int = 0
    original_kb: float = 0.0
    width: int = 0
    height: int = 0
    megapixels: float = 0.0
    exceeds_file_size: bool = False
    exceeds_dimensions: bool = False
    candidate: bool = False
    action: str = ""
    new_bytes: int = 0
    new_kb: float = 0.0
    new_width: int = 0
    new_height: int = 0
    savings_percent: float = 0.0
    error: str = ""


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--photos-dir", default="photos")
    parser.add_argument("--report-dir", default="photo-maintenance-report")
    parser.add_argument("--mode", choices=("report", "optimize"), default="report")
    parser.add_argument("--max-file-kb", type=int, default=1000)
    parser.add_argument("--max-dimension", type=int, default=1600)
    parser.add_argument("--jpeg-quality", type=int, default=82)
    parser.add_argument("--webp-quality", type=int, default=82)
    parser.add_argument("--min-savings-percent", type=float, default=5.0)
    parser.add_argument("--top", type=int, default=60)
    return parser.parse_args()


def image_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            yield path


def save_image(
    image: Image.Image,
    path: Path,
    suffix: str,
    args: argparse.Namespace,
) -> None:
    suffix = suffix.lower()

    if suffix in {".jpg", ".jpeg"}:
        if image.mode not in {"RGB", "L"}:
            image = image.convert("RGB")

        image.save(
            path,
            format="JPEG",
            quality=args.jpeg_quality,
            optimize=True,
            progressive=True,
        )
        return

    if suffix == ".png":
        image.save(
            path,
            format="PNG",
            optimize=True,
            compress_level=9,
        )
        return

    if suffix == ".webp":
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert(
                "RGBA" if "A" in image.getbands() else "RGB"
            )

        image.save(
            path,
            format="WEBP",
            quality=args.webp_quality,
            method=6,
        )
        return

    raise ValueError(
        f"Dateiformat {suffix} wird nicht optimiert."
    )


def optimize(path: Path, args: argparse.Namespace):
    original_stat = path.stat()
    original_bytes = original_stat.st_size
    temp_path: Path | None = None

    try:
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source)
            old_width, old_height = image.size

            if max(image.size) > args.max_dimension:
                image.thumbnail(
                    (
                        args.max_dimension,
                        args.max_dimension,
                    ),
                    Image.Resampling.LANCZOS,
                )

            new_width, new_height = image.size

            with tempfile.NamedTemporaryFile(
                prefix=f".{path.stem}.",
                suffix=path.suffix,
                dir=path.parent,
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)

            save_image(
                image,
                temp_path,
                path.suffix,
                args,
            )

        with Image.open(temp_path) as verification:
            verification.verify()

        new_bytes = temp_path.stat().st_size

        savings = (
            (original_bytes - new_bytes)
            / original_bytes
            * 100
            if original_bytes
            else 0.0
        )

        resized = (
            (new_width, new_height)
            !=
            (old_width, old_height)
        )

        if (
            new_bytes < original_bytes
            and (
                resized
                or
                savings >= args.min_savings_percent
            )
        ):
            os.replace(temp_path, path)
            os.chmod(path, original_stat.st_mode)

            return (
                "optimized",
                new_bytes,
                new_width,
                new_height,
                savings,
                "",
            )

        temp_path.unlink(missing_ok=True)

        return (
            "unchanged_no_useful_saving",
            original_bytes,
            old_width,
            old_height,
            0.0,
            "",
        )

    except Exception as exc:
        if temp_path:
            temp_path.unlink(missing_ok=True)

        return (
            "error",
            original_bytes,
            0,
            0,
            0.0,
            str(exc),
        )


def inspect(
    path: Path,
    repo_root: Path,
    args: argparse.Namespace,
) -> Result:
    path = path.resolve()
    repo_root = repo_root.resolve()
    original_bytes = path.stat().st_size

    result = Result(
        path=path.relative_to(repo_root).as_posix(),
        original_bytes=original_bytes,
        original_kb=round(original_bytes / 1024, 1),
    )

    try:
        with Image.open(path) as image:
            result.format = (
                image.format
                or
                path.suffix.lstrip(".").upper()
            )

            result.width, result.height = image.size

            result.megapixels = round(
                result.width
                * result.height
                / 1_000_000,
                2,
            )

    except Exception as exc:
        result.action = "error"
        result.error = str(exc)
        return result

    result.exceeds_file_size = (
        original_bytes
        >
        args.max_file_kb * 1024
    )

    result.exceeds_dimensions = (
        max(result.width, result.height)
        >
        args.max_dimension
    )

    result.candidate = (
        result.exceeds_file_size
        or
        result.exceeds_dimensions
    )

    if args.mode == "report" or not result.candidate:
        result.action = (
            "candidate"
            if result.candidate
            else "ok"
        )
        return result

    if path.suffix.lower() not in OPTIMIZABLE_EXTENSIONS:
        result.action = "unsupported_format"
        return result

    (
        result.action,
        result.new_bytes,
        result.new_width,
        result.new_height,
        result.savings_percent,
        result.error,
    ) = optimize(path, args)

    result.new_kb = (
        round(result.new_bytes / 1024, 1)
        if result.new_bytes
        else 0.0
    )

    result.savings_percent = round(
        result.savings_percent,
        1,
    )

    return result


def reason(result: Result) -> str:
    values = []

    if result.exceeds_file_size:
        values.append("Dateigröße")

    if result.exceeds_dimensions:
        values.append("Abmessungen")

    return ", ".join(values) or "–"


def write_csv(
    results: list[Result],
    report_dir: Path,
) -> None:
    fieldnames = list(
        Result.__dataclass_fields__
    )

    with (
        report_dir / "photo_report.csv"
    ).open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            delimiter=";",
        )

        writer.writeheader()

        for result in results:
            writer.writerow(
                asdict(result)
            )


def write_markdown(
    results: list[Result],
    report_dir: Path,
    args: argparse.Namespace,
) -> None:
    candidates = sum(
        result.candidate
        for result in results
    )

    optimized = sum(
        result.action == "optimized"
        for result in results
    )

    errors = sum(
        bool(result.error)
        for result in results
    )

    saved = sum(
        result.original_bytes
        - result.new_bytes
        for result in results
        if result.action == "optimized"
    )

    selected = sorted(
        (
            result
            for result in results
            if result.candidate or result.error
        ),
        key=lambda result: result.original_bytes,
        reverse=True,
    )[:args.top]

    created_at = datetime.now(
        timezone.utc
    ).strftime(
        "%Y-%m-%d %H:%M UTC"
    )

    lines = [
        "# Foto-Wartungsbericht",
        "",
        f"Erstellt: {created_at}",
        "",
        f"- Modus: **{args.mode}**",
        f"- Geprüfte Bilddateien: **{len(results)}**",
        f"- Kandidaten: **{candidates}**",
        f"- Optimiert: **{optimized}**",
        f"- Fehler: **{errors}**",
        (
            f"- Grenze: **{args.max_file_kb} KB** "
            f"oder **mehr als {args.max_dimension} px**"
        ),
        (
            "- Eingesparter Speicher: "
            f"**{saved / 1024 / 1024:.2f} MB**"
        ),
        "",
        (
            "Die vollständige Liste steht in "
            "`photo_report.csv` und kann in "
            "Excel gefiltert werden."
        ),
        "",
        "## Größte Kandidaten",
        "",
    ]

    if not selected:
        lines.append(
            "Keine übergroßen oder "
            "fehlerhaften Bilder gefunden."
        )

    else:
        lines.extend([
            (
                "| Datei | Größe | Abmessungen | "
                "Grund | Ergebnis | Neu | Ersparnis |"
            ),
            "|---|---:|---:|---|---|---:|---:|",
        ])

        for result in selected:
            new_size = (
                f"{result.new_kb:.1f} KB"
                if result.new_kb
                else "–"
            )

            saving = (
                f"{result.savings_percent:.1f} %"
                if result.savings_percent
                else "–"
            )

            safe_path = result.path.replace(
                "|",
                "\\|",
            )

            lines.append(
                f"| `{safe_path}` | "
                f"{result.original_kb:.1f} KB | "
                f"{result.width} × {result.height} | "
                f"{reason(result)} | "
                f"{result.action} | "
                f"{new_size} | "
                f"{saving} |"
            )

            if result.error:
                lines.append(
                    f"\nFehler bei `{safe_path}`: "
                    f"{result.error}\n"
                )

    (
        report_dir / "photo_report.md"
    ).write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    args = arguments()
    repo_root = Path.cwd()
    photos_dir = Path(args.photos_dir)
    report_dir = Path(args.report_dir)

    if not photos_dir.is_dir():
        raise SystemExit(
            f"Fotoordner nicht gefunden: {photos_dir}"
        )

    if (
        args.max_file_kb < 1
        or
        args.max_dimension < 1
    ):
        raise SystemExit(
            "Die Grenzwerte müssen größer als 0 sein."
        )

    if not 1 <= args.jpeg_quality <= 95:
        raise SystemExit(
            "JPEG-Qualität muss zwischen 1 und 95 liegen."
        )

    report_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    results = [
        inspect(
            path,
            repo_root,
            args,
        )
        for path in image_files(photos_dir)
    ]

    write_csv(
        results,
        report_dir,
    )

    write_markdown(
        results,
        report_dir,
        args,
    )

    print(
        f"Geprüft: {len(results)} | "
        f"Kandidaten: "
        f"{sum(result.candidate for result in results)} | "
        f"Optimiert: "
        f"{sum(result.action == 'optimized' for result in results)} | "
        f"Fehler: "
        f"{sum(bool(result.error) for result in results)}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
