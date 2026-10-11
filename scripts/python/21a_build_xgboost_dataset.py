# -*- coding: utf-8 -*-

from pathlib import Path
from _project_config import get_work_dir

import pandas as pd


# ============================================================
# 1. 路径
# ============================================================

WORK_DIR = get_work_dir()

# 第20步新生成的结果表。
NEW_GDRI_PATH = (
    WORK_DIR /
    "MP_GDRI_grid_POOLED_V2_READY.csv"
)

# 旧环境驱动表。
ENV_DRIVER_PATH = (
    WORK_DIR /
    "MP_GDRI_driver_dataset_05deg(gy).csv"
)

# 旧人类活动驱动表。
HUMAN_DRIVER_PATH = (
    WORK_DIR /
    "MP_human_driver_dataset_05deg_v1.csv"
)

# 最终合并后的归因数据表。
MERGED_PATH = (
    WORK_DIR /
    "MP_GDRI_driver_dataset_POOLED_V2_READY.csv"
)


# ============================================================
# 2. 读取
# ============================================================

new_gdri = pd.read_csv(
    NEW_GDRI_PATH
)

env_old = pd.read_csv(
    ENV_DRIVER_PATH
)

human_old = pd.read_csv(
    HUMAN_DRIVER_PATH
)


for name, dataframe in {
    "new_gdri": new_gdri,
    "env_old": env_old,
    "human_old": human_old
}.items():

    if "grid_id" not in dataframe.columns:
        raise ValueError(
            f"{name} has no grid_id column."
        )

    if dataframe["grid_id"].duplicated().any():
        raise ValueError(
            f"{name} contains duplicated grid_id."
        )

    print(
        name,
        "rows:",
        len(dataframe),
        "unique grid_id:",
        dataframe["grid_id"].nunique()
    )


# ============================================================
# 3. 从旧环境表中仅保留外部驱动变量
# ============================================================

ENVIRONMENT_VARIABLES = [
    "grid_id",

    "ET_PET_mean",
    "ET_PET_slope",

    "aridity_index",
    "drought_frequency",

    "precip_mean",
    "precip_slope",

    "temp_mean",
    "temp_slope",

    "pdsi_mean",
    "pdsi_slope",

    "cropland_frac_2004",
    "cropland_frac_2022",
    "cropland_change",

    "forest_frac_2004",
    "forest_frac_2022",
    "forest_change",

    "grassland_frac_2004",
    "grassland_frac_2022",
    "grassland_change",

    "urban_frac_2004",
    "urban_frac_2022",
    "urban_change",

    "barren_frac_2004",
    "barren_frac_2022",
    "barren_change",

    "water_occurrence_mean",
    "persistent_water_frac",
    "seasonal_water_frac",

    "nightlight_mean",
    "nightlight_slope",

    "elevation_mean",
    "slope_mean"
]


missing_environment = [
    column
    for column in ENVIRONMENT_VARIABLES
    if column not in env_old.columns
]

if missing_environment:
    raise ValueError(
        "Missing environment variables:\n"
        + "\n".join(missing_environment)
    )


env_external = env_old[
    ENVIRONMENT_VARIABLES
].copy()


# ============================================================
# 4. 从人类活动表中仅保留人类驱动变量
# ============================================================

HUMAN_VARIABLES = [
    "grid_id",

    "builtup_frac_2005",
    "builtup_frac_2020",
    "builtup_frac_change",

    "dw_built_prob_mean",
    "dw_crops_prob_mean",

    "irrigation_area_frac",
    "rainfed_area_frac",

    "mining_area_frac",
    "mining_dist_min_km",

    "pop_density_2010",
    "pop_density_2020",
    "pop_density_change"
]


missing_human = [
    column
    for column in HUMAN_VARIABLES
    if column not in human_old.columns
]

if missing_human:
    raise ValueError(
        "Missing human variables:\n"
        + "\n".join(missing_human)
    )


human_external = human_old[
    HUMAN_VARIABLES
].copy()


# ============================================================
# 5. 检查三个表的grid_id覆盖情况
# ============================================================

new_ids = set(
    new_gdri["grid_id"]
)

env_ids = set(
    env_external["grid_id"]
)

human_ids = set(
    human_external["grid_id"]
)


print(
    "\nNew vs environment common IDs:",
    len(new_ids & env_ids)
)

print(
    "New IDs missing from environment:",
    len(new_ids - env_ids)
)

print(
    "New vs human common IDs:",
    len(new_ids & human_ids)
)

print(
    "New IDs missing from human:",
    len(new_ids - human_ids)
)


# ============================================================
# 6. 一对一合并
# ============================================================

merged = new_gdri.merge(
    env_external,
    on="grid_id",
    how="left",
    validate="one_to_one"
)


merged = merged.merge(
    human_external,
    on="grid_id",
    how="left",
    validate="one_to_one"
)


# ============================================================
# 7. 检查合并结果
# ============================================================

if len(merged) != len(new_gdri):
    raise ValueError(
        "Merged row count differs from new GDRI table."
    )


environment_missing_count = int(
    merged[
        ENVIRONMENT_VARIABLES[1:]
    ]
    .isna()
    .all(axis=1)
    .sum()
)


human_missing_count = int(
    merged[
        HUMAN_VARIABLES[1:]
    ]
    .isna()
    .all(axis=1)
    .sum()
)


print(
    "\nMerged rows:",
    len(merged)
)

print(
    "Merged columns:",
    len(merged.columns)
)

print(
    "Rows missing all environment variables:",
    environment_missing_count
)

print(
    "Rows missing all human variables:",
    human_missing_count
)


# ============================================================
# 8. 输出
# ============================================================

merged.to_csv(
    MERGED_PATH,
    index=False,
    encoding="utf-8-sig"
)


print(
    "\nSaved merged driver dataset:"
)

print(
    MERGED_PATH
)
