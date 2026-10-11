#!/usr/bin/env python3
"""Static checks only: do not import or execute the scientific pipeline."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default=shutil.which("node"), help="Optional Node executable for JavaScript syntax checking.")
    args = parser.parse_args()
    failures = []
    py_files = sorted((ROOT / "scripts/python").glob("*.py")) + sorted((ROOT / "tools").glob("*.py"))
    for path in py_files:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path.relative_to(ROOT)))
        except SyntaxError as exc:
            failures.append(f"Python syntax: {path.name}: {exc}")
    js_files = sorted((ROOT / "scripts/gee").glob("*.js"))
    if args.node:
        for path in js_files:
            check = subprocess.run([args.node, "--check", str(path)], capture_output=True, text=True)
            if check.returncode:
                failures.append(f"JavaScript syntax: {path.name}: {check.stderr}")
    manifest = json.loads((ROOT / "provenance/extraction_manifest.json").read_text(encoding="utf-8"))
    modified = []
    for item in manifest["scripts"]:
        path = ROOT / item["file"]
        if not path.is_file():
            failures.append(f"Missing research script: {item['file']}")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != item["packaged_sha256"]:
            modified.append(item["file"])
    for path in sorted((ROOT / "config").glob("*.example.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            failures.append(f"JSON: {path.name}: {exc}")
    report = {
        "python_files_parsed": len(py_files),
        "javascript_files_checked": len(js_files) if args.node else 0,
        "javascript_note": "Syntax only; Earth Engine execution requires assets and authorization." if args.node else "Skipped: Node executable not found.",
        "research_scripts_in_manifest": len(manifest["scripts"]),
        "research_scripts_modified_since_packaging": modified,
        "failures": failures,
        "scientific_pipeline_executed": False,
        "doi_registered": False,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
