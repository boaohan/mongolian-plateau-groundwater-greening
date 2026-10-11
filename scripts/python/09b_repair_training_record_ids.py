# -*- coding: utf-8 -*-

from pathlib import Path
from _project_config import get_work_dir

import numpy as np
import pandas as pd


# ============================================================
# 1. 修改路径
# ============================================================

WORK_DIR = get_work_dir()

RECORDS_PATH = (
    WORK_DIR /
    "MP_PGDE_pooled_training_records_v2_FIXED.csv"
)

ANCHORS_PATH = (
    WORK_DIR /
    "MP_PGDE_anchor_samples_pooled_v2.csv"
)

OUTPUT_PATH = (
    WORK_DIR /
    "MP_PGDE_pooled_training_records_v2_READY.csv"
)

CHECK_PATH = (
    WORK_DIR /
    "MP_PGDE_pooled_training_records_v2_READY_check.csv"
)


# ============================================================
# 2. 读取
# ============================================================

records = pd.read_csv(RECORDS_PATH)
anchors = pd.read_csv(ANCHORS_PATH)

print("Pooled records:", records.shape)
print("Anchors:", anchors.shape)


# ============================================================
# 3. 删除空sample_id，再从锚点表恢复
# ============================================================

if "sample_id" in records.columns:
    records = records.drop(
        columns=["sample_id"]
    )

anchor_lookup = anchors[
    [
        "sample_id",
        "lon",
        "lat"
    ]
].copy()

if anchor_lookup["sample_id"].isna().any():
    raise ValueError(
        "Anchor table contains missing sample_id."
    )

if anchor_lookup.duplicated(
    subset=["lon", "lat"]
).any():
    raise ValueError(
        "Duplicate lon-lat coordinates in anchor table."
    )

records = records.merge(
    anchor_lookup,
    on=["lon", "lat"],
    how="left",
    validate="many_to_one"
)


# 将sample_id移到第一列
columns = records.columns.tolist()

columns.remove("sample_id")

records = records[
    ["sample_id"] + columns
]


# ============================================================
# 4. 完整性检查
# ============================================================

if records["sample_id"].isna().any():
    unmatched = records[
        records["sample_id"].isna()
    ]

    unmatched.to_csv(
        WORK_DIR / "unmatched_records.csv",
        index=False
    )

    raise ValueError(
        f"Unmatched records: {len(unmatched)}"
    )


if len(records) != 14970:
    raise ValueError(
        f"Expected 14970 rows, found {len(records)}"
    )


period_counts = (
    records["period_id"]
    .value_counts()
    .sort_index()
)

expected_period_counts = {
    "P1": 2994,
    "P2": 2994,
    "P3": 2994,
    "P4": 2994,
    "P5": 2994
}

if period_counts.to_dict() != expected_period_counts:
    raise ValueError(
        f"Unexpected period counts:\n{period_counts}"
    )


records_per_anchor = (
    records
    .groupby("sample_id")
    .size()
)

if not (
    records_per_anchor.eq(5).all()
):
    raise ValueError(
        "Some anchors do not contain exactly five periods."
    )


periods_per_anchor = (
    records
    .groupby("sample_id")["period_id"]
    .nunique()
)

if not (
    periods_per_anchor.eq(5).all()
):
    raise ValueError(
        "Some anchors do not contain five unique periods."
    )


duplicate_count = records.duplicated(
    subset=[
        "sample_id",
        "period_id"
    ]
).sum()

if duplicate_count > 0:
    raise ValueError(
        f"Duplicate sample-period rows: {duplicate_count}"
    )


predictor_columns = [
    "NDVI_mean",
    "NDVI_max",
    "NDVI_min",
    "NDVI_CV",
    "NDVI_retention",
    "retention_valid",
    "ET_PET",
    "MNDWI_mean",
    "water_frequency",
    "dist_persistent_water",
    "dist_seasonal_water",
    "PDSI_mean",
    "precip_mean",
    "temp_mean",
    "Aridity_index",
    "elevation",
    "slope",
    "HAND",
    "forest_frac",
    "grass_shrub_frac",
    "cropland_frac",
    "built_frac",
    "bare_frac",
    "water_wetland_frac"
]

missing_predictor_count = int(
    records[predictor_columns]
    .isna()
    .sum()
    .sum()
)

infinite_predictor_count = int(
    np.isinf(
        records[predictor_columns]
        .to_numpy()
    ).sum()
)

if missing_predictor_count > 0:
    raise ValueError(
        f"Missing predictor values: {missing_predictor_count}"
    )

if infinite_predictor_count > 0:
    raise ValueError(
        f"Infinite predictor values: {infinite_predictor_count}"
    )


# ============================================================
# 5. 输出
# ============================================================

records.to_csv(
    OUTPUT_PATH,
    index=False,
    encoding="utf-8-sig"
)

check_table = pd.DataFrame({
    "item": [
        "total_records",
        "unique_anchors",
        "records_per_anchor_min",
        "records_per_anchor_max",
        "missing_predictor_count",
        "infinite_predictor_count",
        "duplicate_sample_period_count"
    ],
    "value": [
        len(records),
        records["sample_id"].nunique(),
        records_per_anchor.min(),
        records_per_anchor.max(),
        missing_predictor_count,
        infinite_predictor_count,
        duplicate_count
    ]
})

check_table.to_csv(
    CHECK_PATH,
    index=False,
    encoding="utf-8-sig"
)

print("\nPeriod counts:")
print(period_counts)

print("\nClass counts:")
print(records["class"].value_counts())

print("\nSample-type counts:")
print(records["sample_type"].value_counts())

print("\nSaved:")
print(OUTPUT_PATH)
print(CHECK_PATH)
