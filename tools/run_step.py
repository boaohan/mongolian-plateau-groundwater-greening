#!/usr/bin/env python3
"""Run one local stage, check its input files, and record the actual environment."""
import argparse
from datetime import datetime, timezone
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STEPS = {
    "08": ("08_spatial_thinning_and_blocks.py", ["MP_PGDE_anchor_candidates_pooled_v2.csv"]),
    "09b": ("09b_repair_training_record_ids.py", ["MP_PGDE_pooled_training_records_v2_FIXED.csv", "MP_PGDE_anchor_samples_pooled_v2.csv"]),
    "10": ("10_validate_pooled_RF_v2.py", ["MP_PGDE_pooled_training_records_v2_READY.csv"]),
    "20": ("20_rebuild_GDRI_pooled_v2.py", ["MP_grid_core_turnover_POOLED_V2_READY_t07.csv"]),
    "21a": ("21a_build_xgboost_dataset.py", ["MP_GDRI_grid_POOLED_V2_READY.csv", "MP_GDRI_driver_dataset_05deg(gy).csv", "MP_human_driver_dataset_05deg_v1.csv"]),
    "21b": ("21b_xgboost_shap.py", ["MP_GDRI_driver_dataset_POOLED_V2_READY.csv"]),
    "22": ("22_select_illustrative_grids.py", ["MP_GDRI_grid_POOLED_V2_READY.csv", "XGBoost_SHAP_POOLED_V2_READY/full_driver/XGB_OOF_predictions.csv"]),
}
PACKAGES = ["numpy", "pandas", "scipy", "scikit-learn", "pyproj", "matplotlib", "xgboost", "shap"]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("step", nargs="?", choices=STEPS)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--check-inputs", action="store_true", help="Check availability only; do not execute the research script.")
    args = parser.parse_args()
    if args.list or not args.step:
        for key, (name, _) in STEPS.items():
            print(f"{key:>3}  {name}")
        return 0
    work = args.work_dir or Path(os.environ.get("MP_WORK_DIR", str(ROOT / "data/work")))
    if not work.is_absolute():
        work = ROOT / work
    work = work.expanduser().resolve()
    script_name, required = STEPS[args.step]
    missing = [str(work / name) for name in required if not (work / name).is_file()]
    if missing:
        print("Missing research inputs; nothing was executed:", file=sys.stderr)
        for name in missing:
            print(f"  {name}", file=sys.stderr)
        return 2
    if args.check_inputs:
        print(f"Input files present for step {args.step}. Contents and scientific validity have not been checked.")
        return 0
    script = ROOT / "scripts/python" / script_name
    versions = {}
    for package in PACKAGES:
        try:
            versions[package] = metadata.version(package)
        except metadata.PackageNotFoundError:
            versions[package] = "not installed"
    started = datetime.now(timezone.utc)
    record = {
        "step": args.step, "started_at_utc": started.isoformat(),
        "python": sys.version, "platform": platform.platform(), "packages": versions,
        "script": str(script.relative_to(ROOT)), "script_sha256": sha256(script),
        "inputs": [{"name": name, "sha256": sha256(work / name)} for name in required],
        "status": "started",
        "note": "This describes this invocation, not the historical environment used for the manuscript."
    }
    log_dir = work / "run_records"
    log_dir.mkdir(parents=True, exist_ok=True)
    record_path = log_dir / f"{started.strftime('%Y%m%dT%H%M%S%fZ')}_step_{args.step}.json"
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    env = os.environ.copy()
    env["MP_WORK_DIR"] = str(work)
    env.setdefault("MPLBACKEND", "Agg")
    try:
        result = subprocess.run([sys.executable, str(script)], cwd=ROOT, env=env, check=False)
        record["return_code"] = result.returncode
        record["status"] = "completed" if result.returncode == 0 else "failed"
    except BaseException as exc:
        record["status"] = "interrupted or failed to start"
        record["error_type"] = type(exc).__name__
        raise
    finally:
        record["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Run record: {record_path}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
