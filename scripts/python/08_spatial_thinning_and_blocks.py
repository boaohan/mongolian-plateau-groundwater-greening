from pathlib import Path
from _project_config import get_work_dir

import numpy as np
import pandas as pd

from pyproj import Transformer

WORK_DIR = get_work_dir()

INPUT_CSV = (
    WORK_DIR /
    "MP_PGDE_anchor_candidates_pooled_v2.csv"
)

OUTPUT_CSV = (
    WORK_DIR /
    "MP_PGDE_anchor_samples_pooled_v2.csv"
)

OUTPUT_SUMMARY = (
    WORK_DIR /
    "MP_PGDE_anchor_samples_summary_pooled_v2.csv"
)


WORK_DIR.mkdir(
    parents=True,
    exist_ok=True
)

SEED = 20260722

THIN_GRID_METERS = 10000


# 正样本总量约1500。
# 负样本总量约1500。
# hard negatives占负样本多数。
TARGETS = {

    "P_water_margin":
        900,

    "P_dryland_resilient_proxy":
        600,


    "N_desert_bare":
        250,

    "N_built":
        100,

    "N_cropland":
        200,

    "N_upland_grass_shrub":
        350,

    "N_mountain_forest":
        300,

    "N_wet_far_natural":
        300
}

# 3. 读取
# ============================================================

if not INPUT_CSV.exists():

    raise FileNotFoundError(
        f"Input file not found: {INPUT_CSV}"
    )


df = pd.read_csv(INPUT_CSV)


required_columns = [

    "sample_id",
    "sample_type_id",
    "sample_type",
    "class",
    "lon",
    "lat"
]


missing_columns = [

    column
    for column in required_columns
    if column not in df.columns
]


if missing_columns:

    raise ValueError(
        f"Missing columns: {missing_columns}"
    )


for column in [
    "sample_type_id",
    "class",
    "lon",
    "lat"
]:

    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )


df = df.dropna(
    subset=required_columns
).copy()


df["sample_type_id"] = (
    df["sample_type_id"].astype(int)
)

df["class"] = (
    df["class"].astype(int)
)


df = df.drop_duplicates(
    subset=["sample_id"]
).copy()


print("Raw candidate count:", len(df))

print(
    df["sample_type"]
    .value_counts()
)

# 4. 转换到米制坐标
# ============================================================

transformer = Transformer.from_crs(

    "EPSG:4326",

    "EPSG:6933",

    always_xy=True
)


x, y = transformer.transform(

    df["lon"].to_numpy(),

    df["lat"].to_numpy()
)


df["x_meter"] = x
df["y_meter"] = y


df["thin_x"] = np.floor(
    df["x_meter"] /
    THIN_GRID_METERS
).astype(np.int64)


df["thin_y"] = np.floor(
    df["y_meter"] /
    THIN_GRID_METERS
).astype(np.int64)

# 5. 10 km空间稀疏化
# ============================================================

rng = np.random.default_rng(SEED)

df["_random"] = rng.random(len(df))


thinned = (

    df
    .sort_values("_random")

    .drop_duplicates(

        subset=[

            "sample_type",
            "thin_x",
            "thin_y"
        ],

        keep="first"
    )

    .copy()
)


print("\nAfter thinning:")

print(
    thinned["sample_type"]
    .value_counts()
)

# 6. 控制各类型数量
# ============================================================

selected_parts = []


for index, (
    sample_type,
    target_number
) in enumerate(TARGETS.items()):

    group = thinned[
        thinned["sample_type"] ==
        sample_type
    ].copy()


    if group.empty:

        raise ValueError(
            f"No candidates for {sample_type}"
        )


    keep_number = min(
        target_number,
        len(group)
    )


    if keep_number < target_number:

        print(
            f"WARNING: {sample_type}: "
            f"target={target_number}, "
            f"available={len(group)}"
        )


    group = group.sample(

        n=keep_number,

        replace=False,

        random_state=
            SEED + index
    )


    selected_parts.append(group)


anchors = pd.concat(

    selected_parts,

    ignore_index=True
)

# 7. 空间分块
# ============================================================

anchors["block_lon_1deg"] = np.floor(
    anchors["lon"]
).astype(int)


anchors["block_lat_1deg"] = np.floor(
    anchors["lat"]
).astype(int)


anchors["block_1deg"] = (

    anchors["block_lon_1deg"]
    .astype(str)

    + "_"

    + anchors["block_lat_1deg"]
    .astype(str)
)


anchors["block_lon_2deg"] = (

    np.floor(
        anchors["lon"] / 2
    ) * 2

).astype(int)


anchors["block_lat_2deg"] = (

    np.floor(
        anchors["lat"] / 2
    ) * 2

).astype(int)


anchors["block_2deg"] = (

    anchors["block_lon_2deg"]
    .astype(str)

    + "_"

    + anchors["block_lat_2deg"]
    .astype(str)
)


# 8. 平衡分配fold
# ============================================================

def assign_folds(
    dataframe: pd.DataFrame,
    n_folds: int
) -> dict[str, int]:

    block_sizes = (

        dataframe
        .groupby("block_2deg")
        .size()
        .sort_values(
            ascending=False
        )
    )


    fold_load = [
        0 for _ in range(n_folds)
    ]


    block_to_fold = {}


    for block_id, sample_number \
            in block_sizes.items():

        fold_id = int(
            np.argmin(fold_load)
        )


        block_to_fold[
            str(block_id)
        ] = fold_id


        fold_load[fold_id] += int(
            sample_number
        )


    return block_to_fold


block_to_fold5 = assign_folds(
    anchors,
    5
)


block_to_fold10 = assign_folds(
    anchors,
    10
)


anchors["fold5"] = (

    anchors["block_2deg"]
    .astype(str)
    .map(block_to_fold5)
    .astype(int)
)


anchors["fold10"] = (

    anchors["block_2deg"]
    .astype(str)
    .map(block_to_fold10)
    .astype(int)
)


anchors["anchor_version"] = (
    "pooled_v2"
)


# 9. 检查
# ============================================================

print("\nFinal sample type counts:")

print(
    anchors["sample_type"]
    .value_counts()
)


print("\nBinary class counts:")

print(
    anchors["class"]
    .value_counts()
)


print("\n2-degree block number:")

print(
    anchors["block_2deg"]
    .nunique()
)


print("\nFold5 loads:")

print(
    anchors["fold5"]
    .value_counts()
    .sort_index()
)


print("\nFold10 loads:")

print(
    anchors["fold10"]
    .value_counts()
    .sort_index()
)


if anchors["block_2deg"].nunique() < 10:

    raise ValueError(
        "Less than 10 spatial blocks."
    )

# 10. 输出
# ============================================================

output_columns = [

    "sample_id",
    "sample_type_id",
    "sample_type",
    "class",

    "lon",
    "lat",

    "block_1deg",
    "block_2deg",

    "fold5",
    "fold10",

    "anchor_version"
]


anchors[output_columns].to_csv(

    OUTPUT_CSV,

    index=False,

    encoding="utf-8-sig"
)


summary = (

    anchors

    .groupby(

        [
            "sample_type_id",
            "sample_type",
            "class"
        ],

        as_index=False
    )

    .agg(

        n_samples=(
            "sample_id",
            "count"
        ),

        n_blocks_1deg=(
            "block_1deg",
            "nunique"
        ),

        n_blocks_2deg=(
            "block_2deg",
            "nunique"
        ),

        lon_min=(
            "lon",
            "min"
        ),

        lon_max=(
            "lon",
            "max"
        ),

        lat_min=(
            "lat",
            "min"
        ),

        lat_max=(
            "lat",
            "max"
        )
    )
)


summary.to_csv(

    OUTPUT_SUMMARY,

    index=False,

    encoding="utf-8-sig"
)


print("\nSaved:")

print(OUTPUT_CSV)
print(OUTPUT_SUMMARY)
