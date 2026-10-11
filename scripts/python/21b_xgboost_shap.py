from __future__ import annotations

import json
import warnings
from pathlib import Path
from _project_config import get_work_dir
from typing import Optional

import numpy as np
import pandas as pd

import matplotlib

# 使用无窗口绘图后端，避免PyCharm绘图窗口导致程序卡住。
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import shap

from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

try:
    from sklearn.model_selection import (
        StratifiedGroupKFold,
    )

    HAS_STRATIFIED_GROUP_KFOLD = True

except ImportError:
    from sklearn.model_selection import GroupKFold

    HAS_STRATIFIED_GROUP_KFOLD = False

from xgboost import XGBClassifier


warnings.filterwarnings(
    "ignore",
    category=FutureWarning
)


# ============================================================
# 1. 基础参数
# ============================================================

RANDOM_SEED = 20260722

N_SPLITS = 5

N_ESTIMATORS = 500

MAX_DEPTH = 3

LEARNING_RATE = 0.03

SUBSAMPLE = 0.80

COLSAMPLE_BYTREE = 0.80

CLASSIFICATION_THRESHOLD = 0.50


# 默认使用可复现的文件路径；如需原有文件选择窗口，可改为 True。
USE_FILE_DIALOG = False


# 不使用文件选择窗口时，改为False并填写完整路径。
MANUAL_INPUT_PATH = get_work_dir() / "MP_GDRI_driver_dataset_POOLED_V2_READY.csv"


# ============================================================
# 2. 选择输入文件
# ============================================================

def choose_input_file() -> Path:
    """
    选择MP_GDRI_driver_dataset_POOLED_V2_READY.csv。
    """

    if not USE_FILE_DIALOG:

        if not MANUAL_INPUT_PATH.exists():
            raise FileNotFoundError(
                f"输入文件不存在：{MANUAL_INPUT_PATH}"
            )

        return MANUAL_INPUT_PATH


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


        selected_file = filedialog.askopenfilename(

            title=(
                "选择 "
                "MP_GDRI_driver_dataset_POOLED_V2_READY.csv"
            ),

            filetypes=[
                ("CSV文件", "*.csv"),
                ("所有文件", "*.*")
            ]
        )


        root.destroy()


        if not selected_file:
            raise FileNotFoundError(
                "未选择输入文件。"
            )


        return Path(selected_file)


    except ImportError as exc:

        raise RuntimeError(
            "当前Python环境无法使用tkinter。\n"
            "请将USE_FILE_DIALOG改为False，"
            "并填写MANUAL_INPUT_PATH。"
        ) from exc


# ============================================================
# 3. 安全读取CSV
# ============================================================

def read_csv_safely(
    path: Path
) -> pd.DataFrame:

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


    for encoding in encodings:

        try:
            dataframe = pd.read_csv(
                path,
                encoding=encoding,
                low_memory=False
            )

            print(
                f"读取成功：{path.name}"
            )

            print(
                f"编码：{encoding}"
            )

            print(
                f"shape：{dataframe.shape}"
            )

            return dataframe

        except UnicodeDecodeError:
            continue


    raise UnicodeError(
        f"无法识别CSV编码：{path}"
    )


# ============================================================
# 4. 字段工具
# ============================================================

def require_columns(
    dataframe: pd.DataFrame,
    columns: list[str]
) -> None:

    missing = [
        column
        for column in columns
        if column not in dataframe.columns
    ]

    if missing:
        raise ValueError(
            "输入文件缺少以下必需字段：\n"
            + "\n".join(missing)
        )


def find_column(
    dataframe: pd.DataFrame,
    candidates: list[str]
) -> Optional[str]:

    for candidate in candidates:

        if candidate in dataframe.columns:
            return candidate

    return None


def normalize_grid_id(
    value
) -> Optional[str]:

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

    text = str(value).strip()

    if text.endswith(".0"):

        numeric_text = text[:-2]

        if numeric_text.replace(
            "-",
            ""
        ).isdigit():
            return numeric_text

    return text


# ============================================================
# 5. 评价指标
# ============================================================

def safe_roc_auc(
    y_true: np.ndarray,
    probability: np.ndarray
) -> float:

    if len(np.unique(y_true)) < 2:
        return np.nan

    return float(
        roc_auc_score(
            y_true,
            probability
        )
    )


def safe_pr_auc(
    y_true: np.ndarray,
    probability: np.ndarray
) -> float:

    if len(np.unique(y_true)) < 2:
        return np.nan

    return float(
        average_precision_score(
            y_true,
            probability
        )
    )


def calculate_metrics(
    y_true: np.ndarray,
    probability: np.ndarray,
    threshold: float
) -> dict:

    prediction = (
        probability >= threshold
    ).astype(int)


    matrix = confusion_matrix(
        y_true,
        prediction,
        labels=[0, 1]
    )


    tn, fp, fn, tp = matrix.ravel()


    specificity = (
        tn / (tn + fp)
        if (tn + fp) > 0
        else np.nan
    )


    return {

        "ROC_AUC":
            safe_roc_auc(
                y_true,
                probability
            ),

        "PR_AUC":
            safe_pr_auc(
                y_true,
                probability
            ),

        "Brier":
            float(
                brier_score_loss(
                    y_true,
                    probability
                )
            ),

        "Accuracy":
            float(
                accuracy_score(
                    y_true,
                    prediction
                )
            ),

        "Balanced_accuracy":
            float(
                balanced_accuracy_score(
                    y_true,
                    prediction
                )
            ),

        "Precision":
            float(
                precision_score(
                    y_true,
                    prediction,
                    zero_division=0
                )
            ),

        "Recall":
            float(
                recall_score(
                    y_true,
                    prediction,
                    zero_division=0
                )
            ),

        "Specificity":
            float(specificity),

        "F1":
            float(
                f1_score(
                    y_true,
                    prediction,
                    zero_division=0
                )
            ),

        "TN":
            int(tn),

        "FP":
            int(fp),

        "FN":
            int(fn),

        "TP":
            int(tp)
    }


# ============================================================
# 6. XGBoost模型
# ============================================================

def create_xgb_model(
    y_train: np.ndarray,
    seed: int
) -> XGBClassifier:

    positive_count = int(
        y_train.sum()
    )

    negative_count = int(
        len(y_train) - positive_count
    )


    scale_pos_weight = (
        negative_count / positive_count
        if positive_count > 0
        else 1.0
    )


    return XGBClassifier(

        n_estimators=
            N_ESTIMATORS,

        max_depth=
            MAX_DEPTH,

        learning_rate=
            LEARNING_RATE,

        subsample=
            SUBSAMPLE,

        colsample_bytree=
            COLSAMPLE_BYTREE,

        objective=
            "binary:logistic",

        eval_metric=
            "logloss",

        scale_pos_weight=
            scale_pos_weight,

        tree_method=
            "hist",

        random_state=
            seed,

        n_jobs=
            -1
    )


# ============================================================
# 7. 生成空间交叉验证拆分
# ============================================================

def make_cv_splits(
    X: pd.DataFrame,
    y: np.ndarray,
    groups: np.ndarray
):

    if HAS_STRATIFIED_GROUP_KFOLD:

        cv = StratifiedGroupKFold(

            n_splits=
                N_SPLITS,

            shuffle=
                True,

            random_state=
                RANDOM_SEED
        )


        return list(
            cv.split(
                X,
                y,
                groups
            )
        )


    print(
        "警告：当前scikit-learn版本没有"
        "StratifiedGroupKFold，改用GroupKFold。"
    )


    cv = GroupKFold(
        n_splits=N_SPLITS
    )


    return list(
        cv.split(
            X,
            y,
            groups
        )
    )


# ============================================================
# 8. 删除无效变量
# ============================================================

def clean_feature_list(
    dataframe: pd.DataFrame,
    candidates: list[str]
) -> tuple[list[str], pd.DataFrame]:

    records = []

    valid_features = []


    for variable in candidates:

        if variable not in dataframe.columns:

            records.append({
                "variable":
                    variable,
                "status":
                    "missing_column",
                "missing_fraction":
                    1.0,
                "unique_non_null":
                    0
            })

            continue


        values = pd.to_numeric(
            dataframe[variable],
            errors="coerce"
        )


        missing_fraction = float(
            values.isna().mean()
        )


        unique_count = int(
            values.nunique(
                dropna=True
            )
        )


        if values.notna().sum() == 0:

            status = "all_missing"


        elif unique_count <= 1:

            status = "constant"


        else:

            status = "included"

            valid_features.append(
                variable
            )


        records.append({

            "variable":
                variable,

            "status":
                status,

            "missing_fraction":
                missing_fraction,

            "unique_non_null":
                unique_count
        })


    report = pd.DataFrame(
        records
    )


    return valid_features, report


# ============================================================
# 9. 运行单套模型
# ============================================================

def run_model(
    model_name: str,
    analysis_data: pd.DataFrame,
    candidate_features: list[str],
    output_root: Path
) -> None:

    print(
        "\n======================================"
    )

    print(
        f"开始模型：{model_name}"
    )

    print(
        "======================================"
    )


    model_dir = (
        output_root /
        model_name
    )


    model_dir.mkdir(
        parents=True,
        exist_ok=True
    )


    features, feature_report = (
        clean_feature_list(
            analysis_data,
            candidate_features
        )
    )


    feature_report.to_csv(

        model_dir /
        "feature_missingness.csv",

        index=False,

        encoding="utf-8-sig"
    )


    if len(features) < 3:

        raise ValueError(
            f"{model_name}可用变量少于3个。"
        )


    print(
        f"候选变量数：{len(candidate_features)}"
    )

    print(
        f"最终进入模型变量数：{len(features)}"
    )


    (
        model_dir /
        "model_features.txt"
    ).write_text(

        "\n".join(features),

        encoding="utf-8"
    )


    X_raw = analysis_data[
        features
    ].apply(
        pd.to_numeric,
        errors="coerce"
    )


    y = analysis_data[
        "Y_high_risk"
    ].to_numpy(
        dtype=int
    )


    groups = analysis_data[
        "block_2deg"
    ].astype(str).to_numpy()


    unique_groups = np.unique(
        groups
    )


    print(
        f"样本数：{len(y)}"
    )

    print(
        f"低风险样本数：{int((y == 0).sum())}"
    )

    print(
        f"高风险样本数：{int((y == 1).sum())}"
    )

    print(
        f"2°空间块数：{len(unique_groups)}"
    )


    if len(unique_groups) < N_SPLITS:

        raise ValueError(
            "空间块数量少于交叉验证折数。"
        )


    splits = make_cv_splits(
        X_raw,
        y,
        groups
    )


    oof_probability = np.full(
        len(analysis_data),
        np.nan,
        dtype=float
    )


    oof_fold = np.full(
        len(analysis_data),
        -1,
        dtype=int
    )


    fold_records = []


    for fold, (
        train_index,
        test_index
    ) in enumerate(
        splits,
        start=1
    ):

        y_train = y[
            train_index
        ]

        y_test = y[
            test_index
        ]


        if len(np.unique(y_train)) < 2:

            raise RuntimeError(
                f"第{fold}折训练集只有一个类别。"
            )


        if len(np.unique(y_test)) < 2:

            print(
                f"警告：第{fold}折测试集只有一个类别，"
                "该折ROC-AUC和PR-AUC将记为NaN。"
            )


        imputer = SimpleImputer(
            strategy="median"
        )


        X_train = imputer.fit_transform(
            X_raw.iloc[
                train_index
            ]
        )


        X_test = imputer.transform(
            X_raw.iloc[
                test_index
            ]
        )


        model = create_xgb_model(

            y_train=
                y_train,

            seed=
                RANDOM_SEED + fold
        )


        model.fit(
            X_train,
            y_train
        )


        probability = model.predict_proba(
            X_test
        )[:, 1]


        oof_probability[
            test_index
        ] = probability


        oof_fold[
            test_index
        ] = fold


        fold_metrics = calculate_metrics(

            y_true=
                y_test,

            probability=
                probability,

            threshold=
                CLASSIFICATION_THRESHOLD
        )


        fold_metrics.update({

            "model":
                model_name,

            "fold":
                fold,

            "n_train":
                len(train_index),

            "n_test":
                len(test_index),

            "n_train_positive":
                int(y_train.sum()),

            "n_test_positive":
                int(y_test.sum()),

            "n_train_groups":
                len(
                    np.unique(
                        groups[
                            train_index
                        ]
                    )
                ),

            "n_test_groups":
                len(
                    np.unique(
                        groups[
                            test_index
                        ]
                    )
                ),

            "classification_threshold":
                CLASSIFICATION_THRESHOLD
        })


        fold_records.append(
            fold_metrics
        )


        print(
            f"Fold {fold}: "
            f"ROC-AUC={fold_metrics['ROC_AUC']:.4f}, "
            f"PR-AUC={fold_metrics['PR_AUC']:.4f}, "
            f"F1={fold_metrics['F1']:.4f}"
        )


    if np.isnan(
        oof_probability
    ).any():

        missing_count = int(
            np.isnan(
                oof_probability
            ).sum()
        )

        raise RuntimeError(
            f"OOF预测不完整，缺少{missing_count}条。"
        )


    if (
        oof_fold < 1
    ).any():

        raise RuntimeError(
            "部分样本未分配空间CV fold。"
        )


    # --------------------------------------------------------
    # 总体OOF指标
    # --------------------------------------------------------

    overall_metrics = calculate_metrics(

        y_true=
            y,

        probability=
            oof_probability,

        threshold=
            CLASSIFICATION_THRESHOLD
    )


    overall_metrics.update({

        "model":
            model_name,

        "n_samples":
            len(y),

        "n_negative":
            int((y == 0).sum()),

        "n_positive":
            int((y == 1).sum()),

        "n_groups":
            len(unique_groups),

        "n_variables":
            len(features),

        "n_splits":
            N_SPLITS,

        "classification_threshold":
            CLASSIFICATION_THRESHOLD,

        "n_estimators":
            N_ESTIMATORS,

        "max_depth":
            MAX_DEPTH,

        "learning_rate":
            LEARNING_RATE,

        "subsample":
            SUBSAMPLE,

        "colsample_bytree":
            COLSAMPLE_BYTREE,

        "random_seed":
            RANDOM_SEED
    })


    fold_metrics_table = pd.DataFrame(
        fold_records
    )


    overall_metrics_table = pd.DataFrame([
        overall_metrics
    ])


    fold_metrics_table.to_csv(

        model_dir /
        "spatial_CV_fold_metrics.csv",

        index=False,

        encoding="utf-8-sig"
    )


    overall_metrics_table.to_csv(

        model_dir /
        "spatial_CV_overall_metrics.csv",

        index=False,

        encoding="utf-8-sig"
    )


    # --------------------------------------------------------
    # 保存OOF预测
    # --------------------------------------------------------

    output_columns = [
        "grid_id",
        "strict_cls",
        "GDRI_class",
        "GDRI_class_label",
        "GDRI_01",
        "PGDE_change",
        "core_loss_frac_of_P1core",
        "ndvi_slope",
        "gwsa_slope",
        "lon",
        "lat",
        "block_2deg",
        "reliable_strict_fraction",
        "AD_broad_fraction",
        "AD_relaxed_fraction"
    ]


    output_columns = [
        column
        for column in output_columns
        if column in analysis_data.columns
    ]


    oof_output = analysis_data[
        output_columns
    ].copy()


    oof_output[
        "Y_high_risk"
    ] = y


    oof_output[
        "spatial_CV_fold"
    ] = oof_fold


    oof_output[
        "XGB_OOF_risk_probability"
    ] = oof_probability


    oof_output[
        "XGB_OOF_prediction_0p5"
    ] = (
        oof_probability
        >= CLASSIFICATION_THRESHOLD
    ).astype(int)


    oof_output[
        "model_name"
    ] = model_name


    oof_output.to_csv(

        model_dir /
        "XGB_OOF_predictions.csv",

        index=False,

        encoding="utf-8-sig"
    )


    # --------------------------------------------------------
    # 全部816条样本拟合最终模型
    # 该模型只用于SHAP解释，不用于报告泛化性能。
    # --------------------------------------------------------

    final_imputer = SimpleImputer(
        strategy="median"
    )


    X_all_array = final_imputer.fit_transform(
        X_raw
    )


    X_all = pd.DataFrame(

        X_all_array,

        columns=
            features,

        index=
            analysis_data.index
    )


    final_model = create_xgb_model(

        y_train=
            y,

        seed=
            RANDOM_SEED
    )


    final_model.fit(
        X_all,
        y
    )


    final_model.save_model(

        model_dir /
        "final_XGBoost_model.json"
    )


    imputer_table = pd.DataFrame({

        "variable":
            features,

        "imputer_median":
            final_imputer.statistics_
    })


    imputer_table.to_csv(

        model_dir /
        "imputer_medians.csv",

        index=False,

        encoding="utf-8-sig"
    )


    # --------------------------------------------------------
    # SHAP
    # --------------------------------------------------------

    print(
        f"正在计算{model_name} SHAP值……"
    )


    explainer = shap.TreeExplainer(
        final_model
    )


    shap_values = explainer.shap_values(
        X_all
    )


    shap_array = np.asarray(
        shap_values
    )


    # 兼容部分SHAP版本的三维输出。
    if shap_array.ndim == 3:

        if shap_array.shape[-1] == 2:

            shap_array = shap_array[
                :, :, 1
            ]

        elif shap_array.shape[0] == 2:

            shap_array = shap_array[
                1
            ]


    if shap_array.ndim != 2:

        raise RuntimeError(
            "无法识别SHAP输出维度："
            f"{shap_array.shape}"
        )


    if shap_array.shape != X_all.shape:

        raise RuntimeError(
            "SHAP矩阵与特征矩阵形状不一致："
            f"SHAP={shap_array.shape}, "
            f"X={X_all.shape}"
        )


    shap_importance = pd.DataFrame({

        "variable":
            features,

        "mean_abs_SHAP":
            np.abs(
                shap_array
            ).mean(axis=0),

        "mean_SHAP":
            shap_array.mean(axis=0)
    })


    shap_importance = (
        shap_importance.sort_values(

            "mean_abs_SHAP",

            ascending=False
        )
        .reset_index(
            drop=True
        )
    )


    shap_importance[
        "importance_rank"
    ] = (
        np.arange(
            1,
            len(shap_importance) + 1
        )
    )


    shap_importance.to_csv(

        model_dir /
        "SHAP_importance.csv",

        index=False,

        encoding="utf-8-sig"
    )


    # 保存逐网格SHAP值。
    shap_output = pd.DataFrame(

        shap_array,

        columns=[
            f"SHAP_{feature}"
            for feature in features
        ]
    )


    shap_output.insert(

        0,

        "grid_id",

        analysis_data[
            "grid_id"
        ].to_numpy()
    )


    shap_output.insert(

        1,

        "Y_high_risk",

        y
    )


    shap_output.insert(

        2,

        "XGB_OOF_risk_probability",

        oof_probability
    )


    shap_output.to_csv(

        model_dir /
        "SHAP_values.csv",

        index=False,

        encoding="utf-8-sig"
    )


    # --------------------------------------------------------
    # SHAP蜂群图
    # --------------------------------------------------------

    plt.figure(
        figsize=(9, 7)
    )


    shap.summary_plot(

        shap_array,

        X_all,

        show=False,

        max_display=min(
            15,
            len(features)
        )
    )


    plt.tight_layout()


    plt.savefig(

        model_dir /
        "SHAP_summary.png",

        dpi=300,

        bbox_inches="tight"
    )


    plt.close(
        "all"
    )


    # --------------------------------------------------------
    # SHAP重要性条形图
    # --------------------------------------------------------

    plt.figure(
        figsize=(9, 7)
    )


    shap.summary_plot(

        shap_array,

        X_all,

        plot_type="bar",

        show=False,

        max_display=min(
            15,
            len(features)
        )
    )


    plt.tight_layout()


    plt.savefig(

        model_dir /
        "SHAP_bar.png",

        dpi=300,

        bbox_inches="tight"
    )


    plt.close(
        "all"
    )


    print(
        "\n总体空间CV指标："
    )

    print(
        overall_metrics_table.to_string(
            index=False
        )
    )


    print(
        "\n前15个SHAP变量："
    )

    print(
        shap_importance.head(
            15
        ).to_string(
            index=False
        )
    )


    print(
        f"\n{model_name}输出目录："
    )

    print(
        model_dir
    )


# ============================================================
# 10. 选择并读取合并数据集
# ============================================================

INPUT_PATH = choose_input_file()


print(
    "\n输入文件："
)

print(
    INPUT_PATH
)


data_all = read_csv_safely(
    INPUT_PATH
)


required_fields = [
    "grid_id",
    "strict_cls",
    "GDRI_class",
    "GDRI_01",
    "PGDE_change",
    "core_loss_frac_of_P1core",
    "lon",
    "lat"
]


require_columns(
    data_all,
    required_fields
)


if (
    data_all[
        "grid_id"
    ].duplicated().any()
):

    raise ValueError(
        "输入表存在重复grid_id。"
    )


data_all[
    "_grid_id_key"
] = data_all[
    "grid_id"
].map(
    normalize_grid_id
)


if data_all[
    "_grid_id_key"
].isna().any():

    raise ValueError(
        "输入表存在空grid_id。"
    )


# ============================================================
# 11. 构建建模子集
# ============================================================

data_all[
    "strict_cls"
] = pd.to_numeric(

    data_all[
        "strict_cls"
    ],

    errors="coerce"
)


data_all[
    "GDRI_class"
] = pd.to_numeric(

    data_all[
        "GDRI_class"
    ],

    errors="coerce"
)


analysis_data = data_all[

    data_all[
        "strict_cls"
    ].eq(2)

    &

    data_all[
        "GDRI_class"
    ].isin(
        [2, 3, 4]
    )

].copy()


analysis_data[
    "Y_high_risk"
] = (

    analysis_data[
        "GDRI_class"
    ]

    .isin(
        [3, 4]
    )

    .astype(int)
)


print(
    "\n全部网格数：",
    len(data_all)
)


print(
    "地下水债务型增绿建模网格数：",
    len(analysis_data)
)


print(
    "\n目标类别数量："
)


print(
    analysis_data[
        "Y_high_risk"
    ].value_counts()
)


if analysis_data[
    "Y_high_risk"
].nunique() < 2:

    raise ValueError(
        "建模子集只有一个目标类别。"
    )


# ============================================================
# 12. 构建2°空间块
# ============================================================

analysis_data[
    "lon"
] = pd.to_numeric(

    analysis_data[
        "lon"
    ],

    errors="coerce"
)


analysis_data[
    "lat"
] = pd.to_numeric(

    analysis_data[
        "lat"
    ],

    errors="coerce"
)


if analysis_data[
    ["lon", "lat"]
].isna().any(axis=None):

    raise ValueError(
        "建模子集存在缺失经纬度。"
    )


analysis_data[
    "block_2deg"
] = (

    (
        np.floor(
            analysis_data[
                "lon"
            ] / 2
        ) * 2
    )
    .astype(int)
    .astype(str)

    + "_"

    +

    (
        np.floor(
            analysis_data[
                "lat"
            ] / 2
        ) * 2
    )
    .astype(int)
    .astype(str)
)


print(
    "2°空间块数：",
    analysis_data[
        "block_2deg"
    ].nunique()
)


# ============================================================
# 13. 完整驱动模型变量
# ============================================================

FULL_DRIVER_CANDIDATES = [

    # 水热与干旱背景。
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


    # 土地覆盖状态和变化。
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


    # 地表水。
    "water_occurrence_mean",
    "persistent_water_frac",
    "seasonal_water_frac",


    # 人类活动。
    "nightlight_mean",
    "nightlight_slope",

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
    "pop_density_change",


    # 地形。
    "elevation_mean",
    "slope_mean"
]


# ============================================================
# 14. 减少变量重叠的敏感性模型
# ============================================================
#
# 主要使用趋势、变化和独立人类压力变量，
# 尽量减少与PGDE时期状态变量的直接重叠。

NON_OVERLAP_CANDIDATES = [

    # 气候变化趋势。
    "ET_PET_slope",
    "precip_slope",
    "temp_slope",
    "pdsi_slope",

    # 土地覆盖变化。
    "cropland_change",
    "forest_change",
    "grassland_change",
    "urban_change",
    "barren_change",

    # 人类活动变化与压力。
    "nightlight_slope",
    "builtup_frac_change",

    "irrigation_area_frac",
    "rainfed_area_frac",

    "mining_area_frac",
    "mining_dist_min_km",

    "pop_density_2010",
    "pop_density_2020",
    "pop_density_change"
]


# ============================================================
# 15. 输出目录
# ============================================================

OUTPUT_ROOT = (

    INPUT_PATH.parent /

    "XGBoost_SHAP_POOLED_V2_READY"
)


OUTPUT_ROOT.mkdir(

    parents=True,

    exist_ok=True
)


# ============================================================
# 16. 运行完整变量模型
# ============================================================

run_model(

    model_name=
        "full_driver",

    analysis_data=
        analysis_data,

    candidate_features=
        FULL_DRIVER_CANDIDATES,

    output_root=
        OUTPUT_ROOT
)


# ============================================================
# 17. 运行低重叠变量模型
# ============================================================

run_model(

    model_name=
        "non_overlap",

    analysis_data=
        analysis_data,

    candidate_features=
        NON_OVERLAP_CANDIDATES,

    output_root=
        OUTPUT_ROOT
)


# ============================================================
# 18. 完成提示
# ============================================================

print(
    "\n======================================"
)

print(
    "第21B步运行完成"
)

print(
    "======================================"
)


print(
    "\n总输出目录："
)

print(
    OUTPUT_ROOT
)


print(
    "\n第22步请选择："
)


print(

    OUTPUT_ROOT /

    "full_driver" /

    "XGB_OOF_predictions.csv"
)
