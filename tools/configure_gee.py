#!/usr/bin/env python3
"""Write locally configured Earth Engine scripts without modifying the public templates."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "config/gee.local.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".local/gee")
    args = parser.parse_args()
    if not args.config.is_file():
        parser.error("Copy config/gee.example.json to config/gee.local.json and supply your existing Earth Engine asset paths.")
    config = json.loads(args.config.read_text(encoding="utf-8"))
    aoi = config.get("aoi_asset", "").strip()
    asset_root = config.get("asset_root", "").strip().rstrip("/")
    for name, value in [("aoi_asset", aoi), ("asset_root", asset_root)]:
        if "YOUR_" in value or not re.fullmatch(r"(?:projects/[A-Za-z0-9_-]+/assets|users/[A-Za-z0-9_.-]+)(?:/[A-Za-z0-9_.-]+)+", value):
            parser.error(f"Provide an actual {name} path; spaces and quote characters are not supported.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted((ROOT / "scripts/gee").glob("*.js")):
        text = path.read_text(encoding="utf-8")
        text = text.replace("projects/YOUR_GEE_PROJECT/assets/menggu", asset_root)
        text = text.replace("projects/YOUR_GEE_PROJECT/assets/MP", aoi)
        if "YOUR_GEE_PROJECT" in text:
            raise RuntimeError(f"Unresolved project placeholder in {path.name}")
        (args.output_dir / path.name).write_text(text, encoding="utf-8", newline="\n")
        count += 1
    print(f"Wrote {count} configured scripts to {args.output_dir.resolve()}")
    print("No Earth Engine task was submitted. Inspect the inputs and existing export asset IDs before running.")


if __name__ == "__main__":
    main()
