# -*- coding: utf-8 -*-

"""
20_rebuild_GDRI_pooled_v2.py

使用新的：
- pooled PGDE变化；
- 核心区丧失；
- 边缘比例变化；
- Broad/Relaxed/Strict AD；
- 共同可靠域；

重新构建GDRI和风险类别。
"""

from pathlib import Path
from _project_config import get_work_dir

import numpy as np
import pandas as pd
from scipy.stats import spearmanr


# ============================================================
# 1. 路径
# ============================================================

WORK_DIR = get_work_dir()

INPUT_CSV = (
    WORK_DIR /
    "MP_grid_core_turnover_POOLED_V2_READY_t07.csv"
)

OUTPUT_GRID = (
    WORK_DIR /
    "MP_GDRI_grid_POOLED_V2_READY.csv"
)

OUTPUT_CLASS = (
    WORK_DIR /
    "MP_GDRI_summary_by_class_POOLED_V2_READY.csv"
)

OUTPUT_RISK = (
    WORK_DIR /
    "MP_GDRI_risk_ratio_by_domain_POOLED_V2_READY.csv"
)

OUTPUT_WEIGHT = (
    WORK_DIR /
    "MP_GDRI_weight_sensitivity_POOLED_V2_READY.csv"
)

WORK_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# 2. 读取
# ============================================================

df = pd.read_csv(INPUT_CSV)

required = [
    "strict_cls",
    "ndvi_slope",
    "gwsa_slope",
    "PGDE_change",
    "core_loss_frac_of_P1core",
    "edge_frac_change",
    "valid_area_km2"
]

missing = [
    column
    for column in required
    if column not in df.columns
]

if missing:
    raise ValueError(
        f"Missing required fields: {missing}"
    )


numeric_columns = [
    "strict_cls",
    "ndvi_slope",
    "gwsa_slope",
    "PGDE_change",
    "core_loss_frac_of_P1core",
    "edge_frac_change",
    "valid_area_km2",
    "AD_broad_area_km2",
    "AD_relaxed_area_km2",
    "AD_strict_area_km2",
    "reliable_strict_area_km2",
    "reliable_noeco_area_km2"
]

for column in numeric_columns:
    if column in df.columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

df = df.dropna(
    subset=required
).copy()

df["strict_cls"] = (
    df["strict_cls"].astype(int)
)

print("Valid grids:", len(df))
print(df["strict_cls"].value_counts())


# ============================================================
# 3. 风险方向变量
# ============================================================

df["R_ndvi_greening_raw"] = (
    df["ndvi_slope"].clip(lower=0)
)

df["R_gwsa_decline_raw"] = (
    (-df["gwsa_slope"]).clip(lower=0)
)

df["R_pgde_loss_raw"] = (
    (-df["PGDE_change"]).clip(lower=0)
)

df["R_core_loss_raw"] = (
    df["core_loss_frac_of_P1core"]
    .clip(lower=0, upper=1)
)

df["R_edge_increase_raw"] = (
    df["edge_frac_change"]
    .clip(lower=0)
)


# ============================================================
# 4. 5%—95%稳健归一化
# ============================================================

def robust_scale(
    series: pd.Series
) -> pd.Series:

    values = pd.to_numeric(
        series,
        errors="coerce"
    )

    q05 = values.quantile(0.05)
    q95 = values.quantile(0.95)

    if (
        not np.isfinite(q05)
        or not np.isfinite(q95)
        or q95 <= q05
    ):
        return pd.Series(
            np.zeros(len(values)),
            index=values.index
        )

    scaled = (
        (values - q05) /
        (q95 - q05)
    )

    return scaled.clip(0, 1)


risk_components = {
    "ndvi": "R_ndvi_greening_raw",
    "gwsa": "R_gwsa_decline_raw",
    "pgde": "R_pgde_loss_raw",
    "core": "R_core_loss_raw",
    "edge": "R_edge_increase_raw"
}


for short_name, raw_name in (
    risk_components.items()
):
    df[f"R_{short_name}_01"] = (
        robust_scale(df[raw_name])
    )


# ============================================================
# 5. GDRI权重情景
# ============================================================

WEIGHT_SCENARIOS = {
    "equal": {
        "ndvi": 0.20,
        "gwsa": 0.20,
        "pgde": 0.20,
        "core": 0.20,
        "edge": 0.20
    },

    "hydro_heavy": {
        "ndvi": 0.10,
        "gwsa": 0.30,
        "pgde": 0.25,
        "core": 0.25,
        "edge": 0.10
    },

    "structure_heavy": {
        "ndvi": 0.10,
        "gwsa": 0.20,
        "pgde": 0.20,
        "core": 0.35,
        "edge": 0.15
    },

    "no_edge": {
        "ndvi": 0.15,
        "gwsa": 0.30,
        "pgde": 0.25,
        "core": 0.30,
        "edge": 0.00
    }
}


for scenario, weights in (
    WEIGHT_SCENARIOS.items()
):

    score = np.zeros(len(df))

    for component, weight in (
        weights.items()
    ):
        score += (
            df[f"R_{component}_01"]
            .to_numpy()
            * weight
        )

    df[f"GDRI_{scenario}"] = score


df["GDRI_01"] = df[
    "GDRI_equal"
]


# ============================================================
# 6. 重新划分GDRI诊断类别
# ============================================================

strict_cls = df["strict_cls"]

pgde_change = df["PGDE_change"]

core_loss = (
    df["core_loss_frac_of_P1core"]
)


is_water_secure = strict_cls.eq(1)

is_debt_greening = strict_cls.eq(2)

is_ecohydro_degradation = (
    strict_cls.eq(3)
)


pgde_stable = pgde_change.ge(-0.10)

core_stable = core_loss.le(0.30)


gclass = np.zeros(
    len(df),
    dtype=int
)


# Class 1：水安全恢复。
condition = (
    is_water_secure
    & pgde_stable
    & core_stable
)

gclass[condition] = 1


# Class 2：地下水债务型增绿，但GDE暂稳。
condition = (
    is_debt_greening
    & pgde_stable
    & core_stable
)

gclass[condition] = 2


# Class 3：地下水债务型GDE风险。
condition = (
    is_debt_greening
    & (
        pgde_change.lt(-0.10)
        | core_loss.gt(0.30)
    )
)

gclass[condition] = 3


# Class 4：极高风险。
condition = (
    is_debt_greening
    & pgde_change.lt(-0.20)
    & core_loss.gt(0.50)
)

gclass[condition] = 4


# Class 5：生态—水文双退化。
gclass[
    is_ecohydro_degradation
] = 5


df["GDRI_class"] = gclass


class_labels = {
    0: "Other_or_uncertain",
    1: "Water_secure_recovery",
    2: "Debt_greening_GDE_stable",
    3: "Debt_greening_GDE_risk",
    4: "Debt_greening_extreme_risk",
    5: "Ecohydrological_degradation"
}

df["GDRI_class_label"] = (
    df["GDRI_class"]
    .map(class_labels)
)


# ============================================================
# 7. 适用域和可靠域风险比例
# ============================================================

domain_columns = {
    "all_common_valid":
        "valid_area_km2",

    "AD_broad":
        "AD_broad_area_km2",

    "AD_relaxed":
        "AD_relaxed_area_km2",

    "AD_strict_ultraconservative":
        "AD_strict_area_km2",

    "reliable_strict":
        "reliable_strict_area_km2",

    "reliable_noeco":
        "reliable_noeco_area_km2"
}


risk_records = []


for domain_name, area_column in (
    domain_columns.items()
):

    if area_column not in df.columns:
        continue

    area = (
        df[area_column]
        .fillna(0)
        .clip(lower=0)
    )

    debt_mask = (
        df["strict_cls"].eq(2)
    )

    risk_mask = (
        df["GDRI_class"].isin([3, 4])
    )

    extreme_mask = (
        df["GDRI_class"].eq(4)
    )


    debt_area = area[
        debt_mask
    ].sum()

    risk_area = area[
        debt_mask & risk_mask
    ].sum()

    extreme_area = area[
        debt_mask & extreme_mask
    ].sum()


    risk_records.append({
        "domain": domain_name,
        "debt_greening_area_km2":
            debt_area,
        "risk_area_class3_4_km2":
            risk_area,
        "extreme_area_class4_km2":
            extreme_area,
        "risk_fraction":
            (
                risk_area / debt_area
                if debt_area > 0
                else np.nan
            ),
        "risk_percent":
            (
                risk_area / debt_area * 100
                if debt_area > 0
                else np.nan
            ),
        "extreme_fraction":
            (
                extreme_area / debt_area
                if debt_area > 0
                else np.nan
            )
    })


risk_summary = pd.DataFrame(
    risk_records
)


# ============================================================
# 8. 按类别汇总
# ============================================================

class_summary = (
    df.groupby(
        [
            "GDRI_class",
            "GDRI_class_label"
        ],
        as_index=False
    )
    .agg(
        grid_count=(
            "GDRI_class",
            "size"
        ),
        total_area_km2=(
            "valid_area_km2",
            "sum"
        ),
        mean_GDRI=(
            "GDRI_01",
            "mean"
        ),
        mean_ndvi_slope=(
            "ndvi_slope",
            "mean"
        ),
        mean_gwsa_slope=(
            "gwsa_slope",
            "mean"
        ),
        mean_PGDE_change=(
            "PGDE_change",
            "mean"
        ),
        mean_core_loss_fraction=(
            "core_loss_frac_of_P1core",
            "mean"
        ),
        mean_edge_change=(
            "edge_frac_change",
            "mean"
        ),
        P1_core_area_km2=(
            "core_area_P1_km2",
            "sum"
        ),
        P5_core_area_km2=(
            "core_area_P5_km2",
            "sum"
        ),
        core_loss_area_km2=(
            "core_loss_area_km2",
            "sum"
        ),
        core_gain_area_km2=(
            "core_gain_area_km2",
            "sum"
        )
    )
)


# ============================================================
# 9. GDRI权重敏感性
# ============================================================

weight_records = []

baseline = df["GDRI_equal"]


for scenario in WEIGHT_SCENARIOS:

    score = df[
        f"GDRI_{scenario}"
    ]

    rho, p_value = spearmanr(
        baseline,
        score,
        nan_policy="omit"
    )

    top20_baseline = baseline.ge(
        baseline.quantile(0.80)
    )

    top20_scenario = score.ge(
        score.quantile(0.80)
    )

    intersection = (
        top20_baseline
        & top20_scenario
    ).sum()

    union = (
        top20_baseline
        | top20_scenario
    ).sum()

    weight_records.append({
        "scenario": scenario,
        "spearman_vs_equal":
            rho,
        "spearman_p":
            p_value,
        "top20_jaccard":
            (
                intersection / union
                if union > 0
                else np.nan
            ),
        "mean_GDRI":
            score.mean(),
        "median_GDRI":
            score.median()
    })


weight_summary = pd.DataFrame(
    weight_records
)


# ============================================================
# 10. 输出
# ============================================================

df.to_csv(
    OUTPUT_GRID,
    index=False,
    encoding="utf-8-sig"
)

class_summary.to_csv(
    OUTPUT_CLASS,
    index=False,
    encoding="utf-8-sig"
)

risk_summary.to_csv(
    OUTPUT_RISK,
    index=False,
    encoding="utf-8-sig"
)

weight_summary.to_csv(
    OUTPUT_WEIGHT,
    index=False,
    encoding="utf-8-sig"
)


print("\nRisk ratio by domain:")
print(risk_summary)

print("\nSummary by class:")
print(class_summary)

print("\nWeight sensitivity:")
print(weight_summary)

print("\nSaved:")
print(OUTPUT_GRID)
print(OUTPUT_CLASS)
print(OUTPUT_RISK)
print(OUTPUT_WEIGHT)
