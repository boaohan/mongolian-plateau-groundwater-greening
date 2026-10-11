# -*- coding: utf-8 -*-

"""
22_select_typical_grids_pooled_v2_FIXED.py

作用：
1. 读取第20步生成的新GDRI网格结果；
2. 读取第21步full_driver模型的空间交叉验证OOF预测；
3. 从GDRI Class 1—4中各选择3个典型网格；
4. 优先选择可靠域占比较高的网格；
5. 尽量保证典型网格来自不同2°空间块；
6. 输出典型网格表、候选网格排名和GEE所需grid_id列表。

需要选择的文件：

第一次：
MP_GDRI_grid_POOLED_V2_READY.csv

第二次：
XGBoost_SHAP_POOLED_V2_READY/full_driver/
XGB_OOF_predictions.csv
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from _project_config import get_work_dir
from typing import Optional

import numpy as np
import pandas as pd


# ============================================================
# 1. 基础参数
# ============================================================

N_PER_CLASS = 3

RANDOM_SEED = 20260722

np.random.seed(RANDOM_SEED)


# 是否使用文件选择窗口。
USE_FILE_DIALOG = False


# 不使用文件选择窗口时，在这里填写完整路径。
MANUAL_GDRI_PATH = get_work_dir() / "MP_GDRI_grid_POOLED_V2_READY.csv"

MANUAL_XGB_PATH = (get_work_dir() / "XGBoost_SHAP_POOLED_V2_READY" / "full_driver" / "XGB_OOF_predictions.csv")


# ============================================================
# 2. 文件选择
# ============================================================

def choose_input_files() -> tuple[Path, Path]:
    """
    选择GDRI网格表和XGBoost OOF预测表。
    """

    if not USE_FILE_DIALOG:
        return (
            MANUAL_GDRI_PATH,
            MANUAL_XGB_PATH
        )

    try:
        from tkinter import Tk, filedialog

        root = Tk()
        root.withdraw()

        try:
            root.attributes(
                "-topmost",
                True
            )
        except Exception:
            pass

        gdri_file = filedialog.askopenfilename(
            title=(
                "选择第20步生成的 "
                "MP_GDRI_grid_POOLED_V2_READY.csv"
            ),
            filetypes=[
                ("CSV文件", "*.csv"),
                ("所有文件", "*.*")
            ]
        )

        if not gdri_file:
            root.destroy()

            raise FileNotFoundError(
                "未选择GDRI网格结果表。"
            )

        gdri_path = Path(
            gdri_file
        )


        xgb_file = filedialog.askopenfilename(
            title=(
                "选择full_driver目录中的 "
                "XGB_OOF_predictions.csv"
            ),
            initialdir=str(
                gdri_path.parent
            ),
            filetypes=[
                ("CSV文件", "*.csv"),
                ("所有文件", "*.*")
            ]
        )

        root.destroy()

        if not xgb_file:
            raise FileNotFoundError(
                "未选择XGB_OOF_predictions.csv。"
            )

        xgb_path = Path(
            xgb_file
        )

        return gdri_path, xgb_path

    except ImportError as exc:
        raise RuntimeError(
            "当前Python环境无法调用tkinter文件选择窗口。"
            "请将USE_FILE_DIALOG改为False，"
            "并填写MANUAL_GDRI_PATH和MANUAL_XGB_PATH。"
        ) from exc


# ============================================================
# 3. 安全读取CSV
# ============================================================

def read_csv_safely(
    path: Path
) -> pd.DataFrame:
    """
    自动尝试常见CSV编码。
    """

    if not path.exists():
        raise FileNotFoundError(
            f"文件不存在：{path}"
        )

    encodings = [
        "utf-8-sig",
        "utf-8",
        "gb18030",
        "gbk"
    ]

    errors = []

    for encoding in encodings:

        try:
            dataframe = pd.read_csv(
                path,
                encoding=encoding,
                low_memory=False
            )

            print(
                f"读取成功：{path.name}，"
                f"编码={encoding}，"
                f"shape={dataframe.shape}"
            )

            return dataframe

        except UnicodeDecodeError as exc:
            errors.append(
                f"{encoding}: {exc}"
            )

    raise UnicodeError(
        f"无法读取文件：{path}\n"
        + "\n".join(errors)
    )


# ============================================================
# 4. 字段查找工具
# ============================================================

def find_column(
    dataframe: pd.DataFrame,
    candidates: list[str]
) -> Optional[str]:
    """
    从候选名称中寻找第一个存在的字段。
    """

    for candidate in candidates:

        if candidate in dataframe.columns:
            return candidate

    return None


def require_column(
    dataframe: pd.DataFrame,
    candidates: list[str],
    description: str
) -> str:
    """
    查找必需字段；不存在则报错。
    """

    column = find_column(
        dataframe,
        candidates
    )

    if column is None:
        raise ValueError(
            f"未找到{description}字段。\n"
            f"候选名称：{candidates}\n"
            f"实际字段：{dataframe.columns.tolist()}"
        )

    return column


# ============================================================
# 5. grid_id统一
# ============================================================

def normalize_grid_id(
    value
) -> Optional[str]:
    """
    将数值型、字符串型grid_id统一成字符串键。
    """

    if pd.isna(value):
        return None

    if isinstance(
        value,
        (int, np.integer)
    ):
        return str(int(value))

    if isinstance(
        value,
        (float, np.floating)
    ):

        if not np.isfinite(value):
            return None

        if float(value).is_integer():
            return str(int(value))

        return str(value).strip()

    text = str(value).strip()

    if text.endswith(".0"):

        numeric_part = text[:-2]

        if numeric_part.replace(
            "-",
            ""
        ).isdigit():
            return numeric_part

    return text


# ============================================================
# 6. 从.geo中提取近似中心坐标
# ============================================================

def collect_coordinate_pairs(
    coordinates
) -> list[tuple[float, float]]:
    """
    递归提取GeoJSON中的坐标对。
    """

    pairs = []

    if not isinstance(
        coordinates,
        list
    ):
        return pairs

    if (
        len(coordinates) >= 2
        and isinstance(
            coordinates[0],
            (int, float)
        )
        and isinstance(
            coordinates[1],
            (int, float)
        )
    ):

        lon = float(
            coordinates[0]
        )

        lat = float(
            coordinates[1]
        )

        if (
            np.isfinite(lon)
            and np.isfinite(lat)
        ):
            pairs.append(
                (lon, lat)
            )

        return pairs

    for item in coordinates:
        pairs.extend(
            collect_coordinate_pairs(
                item
            )
        )

    return pairs


def centroid_from_geo(
    geo_value
) -> tuple[float, float]:
    """
    使用GeoJSON坐标范围中心作为网格近似中心。
    """

    if pd.isna(geo_value):
        return np.nan, np.nan

    try:

        if isinstance(
            geo_value,
            str
        ):
            geometry = json.loads(
                geo_value
            )
        elif isinstance(
            geo_value,
            dict
        ):
            geometry = geo_value
        else:
            return np.nan, np.nan

        coordinates = geometry.get(
            "coordinates"
        )

        pairs = collect_coordinate_pairs(
            coordinates
        )

        if not pairs:
            return np.nan, np.nan

        longitudes = np.array(
            [pair[0] for pair in pairs],
            dtype=float
        )

        latitudes = np.array(
            [pair[1] for pair in pairs],
            dtype=float
        )

        centroid_lon = (
            float(longitudes.min())
            + float(longitudes.max())
        ) / 2

        centroid_lat = (
            float(latitudes.min())
            + float(latitudes.max())
        ) / 2

        return centroid_lon, centroid_lat

    except Exception:
        return np.nan, np.nan


# ============================================================
# 7. 数值转换工具
# ============================================================

def numeric_series(
    dataframe: pd.DataFrame,
    column: Optional[str],
    default: float = np.nan
) -> pd.Series:
    """
    安全读取数值字段。
    """

    if (
        column is None
        or column not in dataframe.columns
    ):
        return pd.Series(
            default,
            index=dataframe.index,
            dtype=float
        )

    return pd.to_numeric(
        dataframe[column],
        errors="coerce"
    )


def minmax_scale(
    series: pd.Series,
    neutral_value: float = 0.5
) -> pd.Series:
    """
    Min-Max归一化到0—1。
    """

    values = pd.to_numeric(
        series,
        errors="coerce"
    )

    finite = values[
        np.isfinite(values)
    ]

    if finite.empty:
        return pd.Series(
            neutral_value,
            index=values.index,
            dtype=float
        )

    minimum = finite.min()
    maximum = finite.max()

    if maximum <= minimum:
        scaled = pd.Series(
            neutral_value,
            index=values.index,
            dtype=float
        )

    else:
        scaled = (
            values - minimum
        ) / (
            maximum - minimum
        )

    return scaled.fillna(
        neutral_value
    ).clip(
        0,
        1
    )


# ============================================================
# 8. 选择输入文件
# ============================================================

GDRI_PATH, XGB_PATH = (
    choose_input_files()
)


print("\n选择的文件：")

print(
    "GDRI网格表：",
    GDRI_PATH
)

print(
    "XGB OOF表：",
    XGB_PATH
)


# 输出到GDRI结果表所在目录。
OUTPUT_DIR = (
    GDRI_PATH.parent /
    "Step22_typical_grids"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


OUTPUT_SELECTED = (
    OUTPUT_DIR /
    "MP_typical_grids_POOLED_V2_READY.csv"
)

OUTPUT_RANKING = (
    OUTPUT_DIR /
    "MP_typical_grid_candidate_ranking_POOLED_V2_READY.csv"
)

OUTPUT_SUMMARY = (
    OUTPUT_DIR /
    "MP_typical_grid_selection_summary_POOLED_V2_READY.csv"
)

OUTPUT_GEE_IDS = (
    OUTPUT_DIR /
    "MP_typical_grid_ids_for_GEE.txt"
)


# ============================================================
# 9. 读取输入数据
# ============================================================

grid = read_csv_safely(
    GDRI_PATH
)

xgb = read_csv_safely(
    XGB_PATH
)


# ============================================================
# 10. 检查grid_id
# ============================================================

grid_id_column = require_column(
    grid,
    [
        "grid_id",
        "GRID_ID",
        "gridID",
        "id"
    ],
    "GDRI表grid_id"
)


xgb_grid_id_column = require_column(
    xgb,
    [
        "grid_id",
        "GRID_ID",
        "gridID",
        "id"
    ],
    "XGB表grid_id"
)


grid["_grid_id_key"] = (
    grid[grid_id_column]
    .map(normalize_grid_id)
)


xgb["_grid_id_key"] = (
    xgb[xgb_grid_id_column]
    .map(normalize_grid_id)
)


if grid["_grid_id_key"].isna().any():
    raise ValueError(
        "GDRI表存在空grid_id。"
    )


if xgb["_grid_id_key"].isna().any():
    raise ValueError(
        "XGB表存在空grid_id。"
    )


if grid["_grid_id_key"].duplicated().any():

    duplicate_ids = (
        grid.loc[
            grid["_grid_id_key"].duplicated(
                keep=False
            ),
            "_grid_id_key"
        ]
        .unique()
        .tolist()
    )

    raise ValueError(
        "GDRI表存在重复grid_id："
        f"{duplicate_ids[:20]}"
    )


if xgb["_grid_id_key"].duplicated().any():

    duplicate_ids = (
        xgb.loc[
            xgb["_grid_id_key"].duplicated(
                keep=False
            ),
            "_grid_id_key"
        ]
        .unique()
        .tolist()
    )

    raise ValueError(
        "XGB OOF表存在重复grid_id："
        f"{duplicate_ids[:20]}"
    )


# ============================================================
# 11. 找到XGB风险概率字段
# ============================================================

xgb_probability_column = require_column(
    xgb,
    [
        "XGB_OOF_risk_probability",
        "OOF_risk_probability",
        "OOF_probability",
        "risk_probability",
        "predicted_probability",
        "probability"
    ],
    "XGBoost OOF风险概率"
)


xgb_for_merge = xgb[
    [
        "_grid_id_key",
        xgb_probability_column
    ]
].copy()


xgb_for_merge = xgb_for_merge.rename(
    columns={
        xgb_probability_column:
            "XGB_OOF_risk_probability"
    }
)


# ============================================================
# 12. 合并
# ============================================================

data = grid.merge(
    xgb_for_merge,
    on="_grid_id_key",
    how="left",
    validate="one_to_one"
)


print(
    "\nGDRI表网格数：",
    len(grid)
)

print(
    "XGB OOF记录数：",
    len(xgb)
)

print(
    "成功匹配XGB概率的网格数：",
    data[
        "XGB_OOF_risk_probability"
    ].notna().sum()
)


# XGB只对地下水债务型增绿网格建模，
# Class 1没有OOF风险概率是正常的。
# Class 2—4原则上应具有OOF概率。


# ============================================================
# 13. 检查GDRI类别
# ============================================================

gdri_class_column = require_column(
    data,
    [
        "GDRI_class",
        "gdri_class"
    ],
    "GDRI类别"
)


data["GDRI_class"] = pd.to_numeric(
    data[gdri_class_column],
    errors="coerce"
).astype(
    "Int64"
)


print(
    "\nGDRI类别数量："
)

print(
    data["GDRI_class"]
    .value_counts(
        dropna=False
    )
    .sort_index()
)


for class_id in [1, 2, 3, 4]:

    class_count = int(
        data[
            "GDRI_class"
        ]
        .eq(class_id)
        .sum()
    )

    if class_count == 0:
        raise ValueError(
            f"GDRI Class {class_id}没有网格，"
            "无法选择典型网格。"
        )


# ============================================================
# 14. 构建可靠域比例
# ============================================================

reliable_fraction_column = find_column(
    data,
    [
        "reliable_strict_fraction",
        "reliable_fraction"
    ]
)


if reliable_fraction_column is not None:

    data["reliable_fraction"] = (
        numeric_series(
            data,
            reliable_fraction_column,
            default=0
        )
    )

elif (
    "reliable_strict_area_km2"
    in data.columns
    and "valid_area_km2"
    in data.columns
):

    reliable_area = numeric_series(
        data,
        "reliable_strict_area_km2",
        default=0
    )

    valid_area = numeric_series(
        data,
        "valid_area_km2",
        default=np.nan
    ).replace(
        0,
        np.nan
    )

    data["reliable_fraction"] = (
        reliable_area / valid_area
    )

else:

    raise ValueError(
        "缺少可靠域比例字段。\n"
        "需要以下任一种情况：\n"
        "1. reliable_strict_fraction；\n"
        "2. reliable_strict_area_km2和valid_area_km2。"
    )


data["reliable_fraction"] = (
    pd.to_numeric(
        data["reliable_fraction"],
        errors="coerce"
    )
    .fillna(0)
    .clip(0, 1)
)


# ============================================================
# 15. 构建AD覆盖比例
# ============================================================

if "AD_relaxed_fraction" in data.columns:

    data["AD_relaxed_fraction"] = (
        numeric_series(
            data,
            "AD_relaxed_fraction",
            default=0
        )
        .fillna(0)
        .clip(0, 1)
    )

elif (
    "AD_relaxed_area_km2"
    in data.columns
    and "valid_area_km2"
    in data.columns
):

    ad_relaxed_area = numeric_series(
        data,
        "AD_relaxed_area_km2",
        default=0
    )

    valid_area = numeric_series(
        data,
        "valid_area_km2",
        default=np.nan
    ).replace(
        0,
        np.nan
    )

    data["AD_relaxed_fraction"] = (
        ad_relaxed_area / valid_area
    ).fillna(0).clip(0, 1)

else:

    data["AD_relaxed_fraction"] = (
        data["reliable_fraction"]
    )


if "AD_broad_fraction" in data.columns:

    data["AD_broad_fraction"] = (
        numeric_series(
            data,
            "AD_broad_fraction",
            default=0
        )
        .fillna(0)
        .clip(0, 1)
    )

elif (
    "AD_broad_area_km2"
    in data.columns
    and "valid_area_km2"
    in data.columns
):

    ad_broad_area = numeric_series(
        data,
        "AD_broad_area_km2",
        default=0
    )

    valid_area = numeric_series(
        data,
        "valid_area_km2",
        default=np.nan
    ).replace(
        0,
        np.nan
    )

    data["AD_broad_fraction"] = (
        ad_broad_area / valid_area
    ).fillna(0).clip(0, 1)

else:

    data["AD_broad_fraction"] = (
        data["AD_relaxed_fraction"]
    )


# ============================================================
# 16. 准备核心指标
# ============================================================

gdri_score_column = require_column(
    data,
    [
        "GDRI_01",
        "GDRI_equal",
        "GDRI"
    ],
    "GDRI连续得分"
)


data["GDRI_01"] = numeric_series(
    data,
    gdri_score_column,
    default=np.nan
)


# PGDE变化。
pgde_change_column = find_column(
    data,
    [
        "PGDE_change",
        "Delta_PGDE",
        "delta_PGDE"
    ]
)


if pgde_change_column is not None:

    data["PGDE_change"] = numeric_series(
        data,
        pgde_change_column,
        default=np.nan
    )

elif (
    "PGDE_P1_mean" in data.columns
    and "PGDE_P5_mean" in data.columns
):

    data["PGDE_change"] = (
        numeric_series(
            data,
            "PGDE_P5_mean"
        )
        -
        numeric_series(
            data,
            "PGDE_P1_mean"
        )
    )

else:

    raise ValueError(
        "缺少PGDE_change，且无法由"
        "PGDE_P5_mean-PGDE_P1_mean计算。"
    )


# 核心丧失比例。
core_loss_fraction_column = find_column(
    data,
    [
        "core_loss_frac_of_P1core",
        "P1_core_loss_fraction",
        "core_loss_fraction"
    ]
)


if core_loss_fraction_column is not None:

    data[
        "core_loss_frac_of_P1core"
    ] = numeric_series(
        data,
        core_loss_fraction_column,
        default=np.nan
    )

elif (
    "core_loss_area_km2"
    in data.columns
    and "core_area_P1_km2"
    in data.columns
):

    p1_core_area = numeric_series(
        data,
        "core_area_P1_km2",
        default=np.nan
    ).replace(
        0,
        np.nan
    )

    data[
        "core_loss_frac_of_P1core"
    ] = (
        numeric_series(
            data,
            "core_loss_area_km2",
            default=0
        )
        /
        p1_core_area
    )

else:

    raise ValueError(
        "缺少核心区丧失比例，且无法由"
        "core_loss_area_km2/core_area_P1_km2计算。"
    )


data[
    "core_loss_frac_of_P1core"
] = (
    data[
        "core_loss_frac_of_P1core"
    ]
    .fillna(0)
    .clip(0, 1)
)


# NDVI和GWSA趋势可选。
ndvi_slope_column = find_column(
    data,
    [
        "ndvi_slope",
        "NDVI_slope"
    ]
)

gwsa_slope_column = find_column(
    data,
    [
        "gwsa_slope",
        "GWSA_slope"
    ]
)


data["ndvi_slope"] = numeric_series(
    data,
    ndvi_slope_column,
    default=0
)


data["gwsa_slope"] = numeric_series(
    data,
    gwsa_slope_column,
    default=0
)


# XGB概率。
data[
    "XGB_OOF_risk_probability"
] = pd.to_numeric(
    data[
        "XGB_OOF_risk_probability"
    ],
    errors="coerce"
)


# ============================================================
# 17. 构建2°空间块
# ============================================================

block_column = find_column(
    data,
    [
        "block_2deg",
        "block2deg",
        "spatial_block_2deg"
    ]
)


if block_column is not None:

    data["block_2deg"] = (
        data[block_column]
        .astype(str)
        .str.strip()
    )

else:

    lon_column = find_column(
        data,
        [
            "lon",
            "longitude",
            "centroid_lon",
            "grid_lon",
            "center_lon"
        ]
    )

    lat_column = find_column(
        data,
        [
            "lat",
            "latitude",
            "centroid_lat",
            "grid_lat",
            "center_lat"
        ]
    )


    if (
        lon_column is not None
        and lat_column is not None
    ):

        data["_centroid_lon"] = numeric_series(
            data,
            lon_column
        )

        data["_centroid_lat"] = numeric_series(
            data,
            lat_column
        )

    else:

        geo_column = find_column(
            data,
            [
                ".geo",
                "geo",
                "geometry"
            ]
        )

        if geo_column is None:
            raise ValueError(
                "没有block_2deg、中心坐标或几何字段，"
                "无法保证典型网格来自不同空间块。"
            )

        centroids = data[
            geo_column
        ].map(
            centroid_from_geo
        )

        data["_centroid_lon"] = [
            value[0]
            for value in centroids
        ]

        data["_centroid_lat"] = [
            value[1]
            for value in centroids
        ]


    if (
        data["_centroid_lon"]
        .isna()
        .any()
        or data["_centroid_lat"]
        .isna()
        .any()
    ):

        missing_centroid_count = int(
            data[
                [
                    "_centroid_lon",
                    "_centroid_lat"
                ]
            ]
            .isna()
            .any(axis=1)
            .sum()
        )

        print(
            f"警告：{missing_centroid_count}个网格"
            "缺少中心坐标。"
        )


    lon_block = np.floor(
        data["_centroid_lon"] / 2
    ) * 2

    lat_block = np.floor(
        data["_centroid_lat"] / 2
    ) * 2


    data["block_2deg"] = (

        lon_block
        .fillna(-999)
        .astype(int)
        .astype(str)

        + "_"

        + lat_block
        .fillna(-999)
        .astype(int)
        .astype(str)
    )


# ============================================================
# 18. 计算用于排名的归一化指标
# ============================================================

data["GDRI_scaled"] = minmax_scale(
    data["GDRI_01"]
)


data["risk_scaled"] = minmax_scale(
    data[
        "XGB_OOF_risk_probability"
    ]
)


data["PGDE_decline_raw"] = (
    -data["PGDE_change"]
).clip(
    lower=0
)


data["PGDE_decline_scaled"] = (
    minmax_scale(
        data["PGDE_decline_raw"]
    )
)


data["abs_PGDE_change_scaled"] = (
    minmax_scale(
        data[
            "PGDE_change"
        ].abs()
    )
)


data["core_loss_scaled"] = (
    minmax_scale(
        data[
            "core_loss_frac_of_P1core"
        ]
    )
)


data["ndvi_scaled"] = minmax_scale(
    data["ndvi_slope"]
)


data["gwsa_scaled"] = minmax_scale(
    data["gwsa_slope"]
)


data["reliable_scaled"] = (
    data["reliable_fraction"]
)


data["AD_relaxed_scaled"] = (
    data["AD_relaxed_fraction"]
)


# ============================================================
# 19. 构建类别内选择分数
# ============================================================

# Class 1：水安全恢复。
# 优先低GDRI、较高GWSA趋势、高可靠性和较高AD覆盖。
data["score_class1"] = (

    0.35
    * (
        1 - data["GDRI_scaled"]
    )

    + 0.25
    * data["reliable_scaled"]

    + 0.20
    * data["AD_relaxed_scaled"]

    + 0.15
    * data["gwsa_scaled"]

    + 0.05
    * data["ndvi_scaled"]
)


# Class 2：地下水债务型增绿，但GDE暂稳。
# 优先低风险概率、PGDE变化小、核心丧失小、可靠性高。
data["score_class2"] = (

    0.30
    * (
        1 - data["risk_scaled"]
    )

    + 0.20
    * (
        1
        - data[
            "abs_PGDE_change_scaled"
        ]
    )

    + 0.20
    * (
        1
        - data["core_loss_scaled"]
    )

    + 0.20
    * data["reliable_scaled"]

    + 0.10
    * data["AD_relaxed_scaled"]
)


# Class 3：地下水债务型GDE风险。
# 优先高风险概率、PGDE下降、核心丧失和较高可靠性。
data["score_class3"] = (

    0.30
    * data["risk_scaled"]

    + 0.20
    * data["GDRI_scaled"]

    + 0.20
    * data["PGDE_decline_scaled"]

    + 0.15
    * data["core_loss_scaled"]

    + 0.10
    * data["reliable_scaled"]

    + 0.05
    * data["AD_relaxed_scaled"]
)


# Class 4：极高风险。
# 优先高GDRI、高风险概率、强PGDE下降、强核心损失。
data["score_class4"] = (

    0.25
    * data["GDRI_scaled"]

    + 0.25
    * data["risk_scaled"]

    + 0.20
    * data["PGDE_decline_scaled"]

    + 0.15
    * data["core_loss_scaled"]

    + 0.10
    * data["reliable_scaled"]

    + 0.05
    * data["AD_relaxed_scaled"]
)


# ============================================================
# 20. 可靠性分层候选选择
# ============================================================

def get_class_candidates(
    dataframe: pd.DataFrame,
    class_id: int
) -> tuple[pd.DataFrame, float]:
    """
    优先可靠域比例>=0.50；
    不足3个时放宽至>=0.30；
    仍不足时使用该类别全部网格。
    """

    class_data = dataframe[
        dataframe[
            "GDRI_class"
        ].eq(class_id)
    ].copy()


    for threshold in [
        0.50,
        0.30,
        0.00
    ]:

        candidates = class_data[
            class_data[
                "reliable_fraction"
            ].ge(threshold)
        ].copy()

        if len(candidates) >= N_PER_CLASS:
            return (
                candidates,
                threshold
            )


    return class_data, 0.00


# ============================================================
# 21. 保证不同空间块的选择函数
# ============================================================

def select_unique_blocks(
    subset: pd.DataFrame,
    score_column: str,
    n: int
) -> pd.DataFrame:
    """
    按分数从高到低选择，优先不同2°空间块。
    """

    subset = subset.copy()

    subset = subset.sort_values(
        by=[
            score_column,
            "reliable_fraction",
            "AD_relaxed_fraction",
            "_grid_id_key"
        ],
        ascending=[
            False,
            False,
            False,
            True
        ]
    )


    selected_indices = []

    used_blocks = set()


    # 第一轮：不同空间块。
    for index, row in subset.iterrows():

        block = str(
            row["block_2deg"]
        )

        if block in used_blocks:
            continue

        selected_indices.append(
            index
        )

        used_blocks.add(
            block
        )

        if len(selected_indices) >= n:
            break


    # 第二轮：空间块不足时按排名补足。
    if len(selected_indices) < n:

        for index, row in subset.iterrows():

            if index in selected_indices:
                continue

            selected_indices.append(
                index
            )

            if len(selected_indices) >= n:
                break


    selected = subset.loc[
        selected_indices
    ].copy()


    selected["selection_rank"] = (
        np.arange(
            1,
            len(selected) + 1
        )
    )


    return selected


# ============================================================
# 22. 每类选择3个网格
# ============================================================

class_configuration = {

    1: {
        "score_column":
            "score_class1",
        "case_type":
            "Class1_water_secure_recovery"
    },

    2: {
        "score_column":
            "score_class2",
        "case_type":
            "Class2_debt_greening_GDE_stable"
    },

    3: {
        "score_column":
            "score_class3",
        "case_type":
            "Class3_debt_greening_GDE_risk"
    },

    4: {
        "score_column":
            "score_class4",
        "case_type":
            "Class4_extreme_risk"
    }
}


selected_groups = []

summary_records = []


for class_id, config in (
    class_configuration.items()
):

    candidates, reliability_threshold = (
        get_class_candidates(
            data,
            class_id
        )
    )


    score_column = config[
        "score_column"
    ]


    candidates = candidates.copy()

    candidates[
        "selection_score"
    ] = candidates[
        score_column
    ]


    chosen = select_unique_blocks(
        candidates,
        score_column,
        N_PER_CLASS
    )


    chosen[
        "selection_score"
    ] = chosen[
        score_column
    ]


    chosen[
        "case_type"
    ] = config[
        "case_type"
    ]


    chosen[
        "reliability_filter_used"
    ] = reliability_threshold


    selected_groups.append(
        chosen
    )


    summary_records.append({

        "GDRI_class":
            class_id,

        "case_type":
            config[
                "case_type"
            ],

        "total_class_grids":
            int(
                data[
                    "GDRI_class"
                ]
                .eq(class_id)
                .sum()
            ),

        "candidate_grids_after_reliability_filter":
            len(candidates),

        "reliability_threshold_used":
            reliability_threshold,

        "selected_grid_count":
            len(chosen),

        "selected_unique_block_count":
            chosen[
                "block_2deg"
            ].nunique()
    })


typical = pd.concat(
    selected_groups,
    ignore_index=True
)


selection_summary = pd.DataFrame(
    summary_records
)


# ============================================================
# 23. 候选网格完整排名
# ============================================================

ranking_frames = []


for class_id, config in (
    class_configuration.items()
):

    score_column = config[
        "score_column"
    ]

    subset = data[
        data["GDRI_class"]
        .eq(class_id)
    ].copy()


    subset[
        "selection_score"
    ] = subset[
        score_column
    ]


    subset[
        "candidate_rank_within_class"
    ] = (

        subset[
            "selection_score"
        ]

        .rank(
            method="first",
            ascending=False
        )

        .astype(int)
    )


    subset[
        "case_type"
    ] = config[
        "case_type"
    ]


    ranking_frames.append(
        subset
    )


candidate_ranking = pd.concat(
    ranking_frames,
    ignore_index=True
)


candidate_ranking = (
    candidate_ranking.sort_values(
        by=[
            "GDRI_class",
            "candidate_rank_within_class"
        ]
    )
)


# ============================================================
# 24. 输出字段
# ============================================================

preferred_output_columns = [

    grid_id_column,

    "_grid_id_key",

    "case_type",

    "GDRI_class",

    "GDRI_01",

    "XGB_OOF_risk_probability",

    "PGDE_P1_mean",

    "PGDE_P5_mean",

    "PGDE_change",

    "core_loss_frac_of_P1core",

    "core_area_P1_km2",

    "core_area_P5_km2",

    "core_loss_area_km2",

    "core_gain_area_km2",

    "ndvi_slope",

    "gwsa_slope",

    "reliable_fraction",

    "AD_broad_fraction",

    "AD_relaxed_fraction",

    "block_2deg",

    "selection_score",

    "selection_rank",

    "reliability_filter_used"
]


selected_output_columns = [

    column

    for column in preferred_output_columns

    if column in typical.columns
]


typical_output = typical[
    selected_output_columns
].copy()


# ============================================================
# 25. 保存结果
# ============================================================

typical_output.to_csv(
    OUTPUT_SELECTED,
    index=False,
    encoding="utf-8-sig"
)


ranking_output_columns = [

    column

    for column in (
        preferred_output_columns
        + [
            "candidate_rank_within_class"
        ]
    )

    if column in candidate_ranking.columns
]


candidate_ranking[
    ranking_output_columns
].to_csv(
    OUTPUT_RANKING,
    index=False,
    encoding="utf-8-sig"
)


selection_summary.to_csv(
    OUTPUT_SUMMARY,
    index=False,
    encoding="utf-8-sig"
)


# ============================================================
# 26. 生成GEE grid_id代码
# ============================================================

def convert_id_for_json(
    value
):
    """
    尽量保留数值型grid_id；
    非数值ID保留为字符串。
    """

    if pd.isna(value):
        return None

    if isinstance(
        value,
        (int, np.integer)
    ):
        return int(value)

    if isinstance(
        value,
        (float, np.floating)
    ):

        if np.isfinite(value):

            if float(value).is_integer():
                return int(value)

            return float(value)

    text = str(value).strip()

    try:
        numeric_value = float(text)

        if math.isfinite(
            numeric_value
        ):

            if numeric_value.is_integer():
                return int(
                    numeric_value
                )

            return numeric_value

    except ValueError:
        pass

    return text


selected_ids = [

    convert_id_for_json(value)

    for value in typical[
        grid_id_column
    ].tolist()
]


gee_code = (
    "var selectedIds = "
    + json.dumps(
        selected_ids,
        ensure_ascii=False,
        indent=2
    )
    + ";\n"
)


OUTPUT_GEE_IDS.write_text(
    gee_code,
    encoding="utf-8"
)


# ============================================================
# 27. 最终检查
# ============================================================

if len(typical_output) != (
    N_PER_CLASS * 4
):

    print(
        "\n警告：预期选择12个网格，"
        f"实际选择{len(typical_output)}个。"
    )


duplicate_selected_ids = (
    typical_output[
        "_grid_id_key"
    ].duplicated().sum()
)


if duplicate_selected_ids > 0:
    raise RuntimeError(
        "最终选择结果存在重复grid_id。"
    )


print(
    "\n=============================="
)

print(
    "典型网格选择结果"
)

print(
    "==============================\n"
)


display_columns = [

    column

    for column in [

        grid_id_column,

        "case_type",

        "GDRI_class",

        "GDRI_01",

        "XGB_OOF_risk_probability",

        "PGDE_change",

        "core_loss_frac_of_P1core",

        "reliable_fraction",

        "AD_relaxed_fraction",

        "block_2deg",

        "selection_score"

    ]

    if column in typical_output.columns
]


print(
    typical_output[
        display_columns
    ].to_string(
        index=False
    )
)


print(
    "\n选择摘要："
)

print(
    selection_summary.to_string(
        index=False
    )
)


print(
    "\n供GEE使用的grid_id："
)

print(
    gee_code
)


print(
    "\n输出目录："
)

print(
    OUTPUT_DIR
)


print(
    "\n生成文件："
)

print(
    OUTPUT_SELECTED.name
)

print(
    OUTPUT_RANKING.name
)

print(
    OUTPUT_SUMMARY.name
)

print(
    OUTPUT_GEE_IDS.name
)
