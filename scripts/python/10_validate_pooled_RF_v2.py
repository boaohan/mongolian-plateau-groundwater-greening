# -*- coding: utf-8 -*-

"""
10_validate_pooled_RF_v2.py

分析内容：
1. 固定空间块五折交叉验证；
2. 比较RF叶节点参数；
3. 生成空间OOF预测；
4. 按hard-negative类型计算误判率；
5. 按锚点计算任一时期误判率；
6. 空间阻断留一时期验证；
7. 输出模型验收结果。
"""

from pathlib import Path
from _project_config import get_work_dir
import json

import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score
)


# ============================================================
# 1. 路径
# ============================================================

WORK_DIR = get_work_dir()

INPUT_PATH = (
    WORK_DIR /
    "MP_PGDE_pooled_training_records_v2_READY.csv"
)

OUTPUT_DIR = (
    WORK_DIR /
    "RF_validation_v2"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# 2. 模型变量
# ============================================================

MODEL_BANDS = [
    "NDVI_mean",
    "NDVI_max",
    "NDVI_min",
    "NDVI_CV",
    "NDVI_retention",
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


PARAMETER_SETS = [
    {
        "name": "RF_leaf3",
        "n_estimators": 300,
        "min_samples_leaf": 3
    },
    {
        "name": "RF_leaf5",
        "n_estimators": 500,
        "min_samples_leaf": 5
    },
    {
        "name": "RF_leaf10",
        "n_estimators": 500,
        "min_samples_leaf": 10
    }
]


SEED = 20260722


# ============================================================
# 3. 读取和检查
# ============================================================

df = pd.read_csv(INPUT_PATH)

required_columns = (
    MODEL_BANDS
    + [
        "sample_id",
        "sample_type",
        "class",
        "period_id",
        "fold5",
        "block_2deg"
    ]
)

missing_columns = [
    column
    for column in required_columns
    if column not in df.columns
]

if missing_columns:
    raise ValueError(
        f"Missing columns: {missing_columns}"
    )


for column in MODEL_BANDS:
    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )

df["class"] = pd.to_numeric(
    df["class"],
    errors="coerce"
).astype(int)

df["fold5"] = pd.to_numeric(
    df["fold5"],
    errors="coerce"
).astype(int)


if df[required_columns].isna().any().any():
    missing = (
        df[required_columns]
        .isna()
        .sum()
    )

    raise ValueError(
        "Missing values detected:\n"
        + missing[missing > 0].to_string()
    )


print("Rows:", len(df))
print("Anchors:", df["sample_id"].nunique())
print("\nPeriods:")
print(df["period_id"].value_counts().sort_index())
print("\nClasses:")
print(df["class"].value_counts())


# ============================================================
# 4. 工具函数
# ============================================================

def make_model(
    n_estimators: int,
    min_samples_leaf: int
) -> RandomForestClassifier:

    return RandomForestClassifier(
        n_estimators=n_estimators,
        max_features="sqrt",
        min_samples_leaf=min_samples_leaf,
        class_weight="balanced_subsample",
        random_state=SEED,
        n_jobs=-1
    )


def probability_metrics(
    y_true: np.ndarray,
    probability: np.ndarray
) -> dict:

    return {
        "ROC_AUC": float(
            roc_auc_score(
                y_true,
                probability
            )
        ),
        "PR_AUC": float(
            average_precision_score(
                y_true,
                probability
            )
        ),
        "Brier": float(
            brier_score_loss(
                y_true,
                probability
            )
        )
    }


def threshold_metrics(
    y_true: np.ndarray,
    probability: np.ndarray,
    threshold: float = 0.5
) -> dict:

    prediction = (
        probability >= threshold
    ).astype(int)

    tn, fp, fn, tp = confusion_matrix(
        y_true,
        prediction,
        labels=[0, 1]
    ).ravel()

    specificity = (
        tn / (tn + fp)
        if (tn + fp) > 0
        else np.nan
    )

    return {
        "threshold": threshold,
        "accuracy": float(
            np.mean(
                prediction == y_true
            )
        ),
        "precision": float(
            precision_score(
                y_true,
                prediction,
                zero_division=0
            )
        ),
        "recall": float(
            recall_score(
                y_true,
                prediction,
                zero_division=0
            )
        ),
        "specificity": float(
            specificity
        ),
        "F1": float(
            f1_score(
                y_true,
                prediction,
                zero_division=0
            )
        ),
        "TN": int(tn),
        "FP": int(fp),
        "FN": int(fn),
        "TP": int(tp)
    }


# ============================================================
# 5. 固定空间块五折CV
# ============================================================

X = df[MODEL_BANDS]
y = df["class"].to_numpy()

model_summary_records = []
fold_metric_records = []

oof_by_model = {}


for parameter_set in PARAMETER_SETS:

    model_name = parameter_set["name"]

    print(f"\nRunning {model_name}")

    oof_probability = np.full(
        len(df),
        np.nan,
        dtype=float
    )

    for fold in sorted(
        df["fold5"].unique()
    ):

        train_mask = (
            df["fold5"] != fold
        )

        test_mask = (
            df["fold5"] == fold
        )

        model = make_model(
            n_estimators=parameter_set[
                "n_estimators"
            ],
            min_samples_leaf=parameter_set[
                "min_samples_leaf"
            ]
        )

        model.fit(
            X.loc[train_mask],
            y[train_mask]
        )

        probability = model.predict_proba(
            X.loc[test_mask]
        )[:, 1]

        oof_probability[
            test_mask.to_numpy()
        ] = probability

        fold_metric_records.append({
            "model": model_name,
            "fold": int(fold),
            "n_train": int(
                train_mask.sum()
            ),
            "n_test": int(
                test_mask.sum()
            ),
            **probability_metrics(
                y[test_mask],
                probability
            ),
            **threshold_metrics(
                y[test_mask],
                probability,
                threshold=0.5
            )
        })

    if np.isnan(
        oof_probability
    ).any():
        raise RuntimeError(
            f"Incomplete OOF predictions: {model_name}"
        )

    overall_probability = probability_metrics(
        y,
        oof_probability
    )

    overall_threshold = threshold_metrics(
        y,
        oof_probability,
        threshold=0.5
    )

    selection_score = (
        overall_probability["ROC_AUC"]
        + overall_probability["PR_AUC"]
        - overall_probability["Brier"]
    )

    model_summary_records.append({
        "model": model_name,
        "n_estimators":
            parameter_set["n_estimators"],
        "min_samples_leaf":
            parameter_set["min_samples_leaf"],
        **overall_probability,
        **overall_threshold,
        "selection_score":
            selection_score
    })

    oof_by_model[model_name] = (
        oof_probability
    )


model_summary = pd.DataFrame(
    model_summary_records
).sort_values(
    "selection_score",
    ascending=False
)

fold_metrics = pd.DataFrame(
    fold_metric_records
)

model_summary.to_csv(
    OUTPUT_DIR /
    "RF_spatial_CV_model_summary.csv",
    index=False
)

fold_metrics.to_csv(
    OUTPUT_DIR /
    "RF_spatial_CV_fold_metrics.csv",
    index=False
)

print("\nModel summary:")
print(model_summary)


# ============================================================
# 6. 保存最佳模型OOF预测
# ============================================================

best_model_name = str(
    model_summary.iloc[0]["model"]
)

best_parameters = next(
    item
    for item in PARAMETER_SETS
    if item["name"] == best_model_name
)

best_oof = oof_by_model[
    best_model_name
]

oof_table = df.copy()

oof_table["OOF_PGDE"] = best_oof

oof_table["OOF_class_0p5"] = (
    best_oof >= 0.5
).astype(int)

oof_table["OOF_core_0p7"] = (
    best_oof >= 0.7
).astype(int)

oof_table.to_csv(
    OUTPUT_DIR /
    "RF_spatial_OOF_predictions.csv",
    index=False,
    encoding="utf-8-sig"
)


# ============================================================
# 7. 按记录计算hard-negative压力
# ============================================================

stress_records = []

for sample_type, group in (
    oof_table.groupby("sample_type")
):

    class_value = int(
        group["class"].mode().iloc[0]
    )

    probability = (
        group["OOF_PGDE"]
        .to_numpy()
    )

    record = {
        "sample_type": sample_type,
        "class": class_value,
        "n_records": len(group),
        "n_anchors":
            group["sample_id"].nunique(),
        "PGDE_mean":
            float(probability.mean()),
        "PGDE_median":
            float(np.median(probability)),
        "PGDE_p90":
            float(
                np.quantile(
                    probability,
                    0.90
                )
            ),
        "PGDE_p95":
            float(
                np.quantile(
                    probability,
                    0.95
                )
            )
    }

    if class_value == 0:
        record["FPR_at_0p5"] = float(
            np.mean(
                probability >= 0.5
            )
        )

        record["FPR_at_0p7"] = float(
            np.mean(
                probability >= 0.7
            )
        )

    else:
        record["TPR_at_0p5"] = float(
            np.mean(
                probability >= 0.5
            )
        )

        record["TPR_at_0p7"] = float(
            np.mean(
                probability >= 0.7
            )
        )

    stress_records.append(record)


stress_by_type = pd.DataFrame(
    stress_records
)

stress_by_type.to_csv(
    OUTPUT_DIR /
    "RF_OOF_stress_test_by_type.csv",
    index=False
)

print("\nStress test by record:")
print(stress_by_type)


# ============================================================
# 8. 按锚点汇总五期压力
# ============================================================

anchor_predictions = (
    oof_table
    .groupby(
        [
            "sample_id",
            "sample_type",
            "class"
        ],
        as_index=False
    )
    .agg(
        mean_OOF_PGDE=(
            "OOF_PGDE",
            "mean"
        ),
        max_OOF_PGDE=(
            "OOF_PGDE",
            "max"
        ),
        min_OOF_PGDE=(
            "OOF_PGDE",
            "min"
        ),
        n_periods=(
            "period_id",
            "nunique"
        )
    )
)

anchor_stress_records = []

for sample_type, group in (
    anchor_predictions.groupby(
        "sample_type"
    )
):

    class_value = int(
        group["class"].mode().iloc[0]
    )

    record = {
        "sample_type": sample_type,
        "class": class_value,
        "n_anchors": len(group),
        "mean_anchor_PGDE": float(
            group["mean_OOF_PGDE"].mean()
        )
    }

    if class_value == 0:
        record[
            "anchor_mean_FPR_0p7"
        ] = float(
            np.mean(
                group["mean_OOF_PGDE"]
                >= 0.7
            )
        )

        record[
            "anchor_any_period_FPR_0p7"
        ] = float(
            np.mean(
                group["max_OOF_PGDE"]
                >= 0.7
            )
        )

    else:
        record[
            "anchor_mean_TPR_0p7"
        ] = float(
            np.mean(
                group["mean_OOF_PGDE"]
                >= 0.7
            )
        )

        record[
            "anchor_all_period_TPR_0p7"
        ] = float(
            np.mean(
                group["min_OOF_PGDE"]
                >= 0.7
            )
        )

    anchor_stress_records.append(
        record
    )


anchor_stress = pd.DataFrame(
    anchor_stress_records
)

anchor_stress.to_csv(
    OUTPUT_DIR /
    "RF_OOF_stress_test_by_anchor.csv",
    index=False
)

anchor_predictions.to_csv(
    OUTPUT_DIR /
    "RF_OOF_anchor_predictions.csv",
    index=False,
    encoding="utf-8-sig"
)

print("\nStress test by anchor:")
print(anchor_stress)


# ============================================================
# 9. 空间阻断留一时期验证
# ============================================================

blocked_lopo_records = []
blocked_lopo_predictions = []


for test_period in sorted(
    df["period_id"].unique()
):

    period_probability = np.full(
        len(df),
        np.nan,
        dtype=float
    )

    for fold in sorted(
        df["fold5"].unique()
    ):

        # 排除测试时期，并排除测试空间块。
        train_mask = (
            (df["period_id"] != test_period)
            &
            (df["fold5"] != fold)
        )

        # 只测试指定时期和指定空间块。
        test_mask = (
            (df["period_id"] == test_period)
            &
            (df["fold5"] == fold)
        )

        if test_mask.sum() == 0:
            continue

        model = make_model(
            n_estimators=
                best_parameters[
                    "n_estimators"
                ],
            min_samples_leaf=
                best_parameters[
                    "min_samples_leaf"
                ]
        )

        model.fit(
            df.loc[
                train_mask,
                MODEL_BANDS
            ],
            df.loc[
                train_mask,
                "class"
            ]
        )

        probability = model.predict_proba(
            df.loc[
                test_mask,
                MODEL_BANDS
            ]
        )[:, 1]

        period_probability[
            test_mask.to_numpy()
        ] = probability

    period_mask = (
        df["period_id"] == test_period
    ).to_numpy()

    valid_mask = (
        period_mask
        &
        ~np.isnan(period_probability)
    )

    y_period = y[valid_mask]
    p_period = period_probability[
        valid_mask
    ]

    blocked_lopo_records.append({
        "test_period": test_period,
        "n_test": int(
            valid_mask.sum()
        ),
        **probability_metrics(
            y_period,
            p_period
        ),
        **threshold_metrics(
            y_period,
            p_period,
            threshold=0.5
        )
    })

    period_output = df.loc[
        valid_mask
    ].copy()

    period_output[
        "blocked_LOPO_PGDE"
    ] = p_period

    blocked_lopo_predictions.append(
        period_output
    )


blocked_lopo_metrics = pd.DataFrame(
    blocked_lopo_records
)

blocked_lopo_metrics.to_csv(
    OUTPUT_DIR /
    "RF_blocked_leave_one_period_out_metrics.csv",
    index=False
)

pd.concat(
    blocked_lopo_predictions,
    ignore_index=True
).to_csv(
    OUTPUT_DIR /
    "RF_blocked_leave_one_period_out_predictions.csv",
    index=False,
    encoding="utf-8-sig"
)

print("\nBlocked leave-one-period-out:")
print(blocked_lopo_metrics)


# ============================================================
# 10. 验收标准
# ============================================================

best_summary = model_summary.iloc[0]

criteria = [
    {
        "criterion":
            "Spatial ROC-AUC >= 0.80",
        "observed":
            best_summary["ROC_AUC"],
        "limit": 0.80,
        "passed":
            best_summary["ROC_AUC"] >= 0.80
    },
    {
        "criterion":
            "Spatial PR-AUC >= 0.75",
        "observed":
            best_summary["PR_AUC"],
        "limit": 0.75,
        "passed":
            best_summary["PR_AUC"] >= 0.75
    },
    {
        "criterion":
            "Spatial Brier <= 0.20",
        "observed":
            best_summary["Brier"],
        "limit": 0.20,
        "passed":
            best_summary["Brier"] <= 0.20
    },
    {
        "criterion":
            "Minimum blocked LOPO ROC-AUC >= 0.70",
        "observed":
            blocked_lopo_metrics[
                "ROC_AUC"
            ].min(),
        "limit": 0.70,
        "passed":
            blocked_lopo_metrics[
                "ROC_AUC"
            ].min() >= 0.70
    }
]


hard_negative_limits = {
    "N_upland_grass_shrub": 0.10,
    "N_mountain_forest": 0.10,
    "N_wet_far_natural": 0.10,
    "N_cropland": 0.05,
    "N_built": 0.05
}


for sample_type, limit in (
    hard_negative_limits.items()
):

    row = stress_by_type[
        stress_by_type["sample_type"]
        == sample_type
    ]

    if row.empty:
        observed = np.nan
        passed = False
    else:
        observed = float(
            row.iloc[0]["FPR_at_0p7"]
        )

        passed = bool(
            observed <= limit
        )

    criteria.append({
        "criterion":
            f"{sample_type} record FPR@0.7 <= {limit}",
        "observed": observed,
        "limit": limit,
        "passed": passed
    })


acceptance = pd.DataFrame(
    criteria
)

acceptance.to_csv(
    OUTPUT_DIR /
    "RF_model_acceptance_check.csv",
    index=False
)

print("\nAcceptance check:")
print(acceptance)


recommended = {
    "model_name":
        best_model_name,
    "numberOfTrees":
        int(
            best_parameters[
                "n_estimators"
            ]
        ),
    "minLeafPopulation":
        int(
            best_parameters[
                "min_samples_leaf"
            ]
        ),
    "bagFraction": 0.7,
    "seed": SEED,
    "all_passed": bool(
        acceptance["passed"].all()
    )
}

with open(
    OUTPUT_DIR /
    "RF_recommended_parameters.json",
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        recommended,
        file,
        ensure_ascii=False,
        indent=2
    )

print("\nRecommended parameters:")
print(recommended)
