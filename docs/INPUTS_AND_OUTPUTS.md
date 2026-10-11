# Required inputs and expected outputs

This repository contains code, not the study's observations, derived asset rasters, input CSV tables or numerical result files. Empty placeholders or synthetic tables have not been substituted for missing research data.

## External inputs

| Input | How it is used | Availability in this package |
|---|---|---|
| Study-area polygon asset, configured as `aoi_asset` | Spatial boundary in Earth Engine stages | Not supplied |
| Existing Earth Engine asset folder, configured as `asset_root` | Intermediate/output asset namespace | Must be created and writable by the user |
| `MP_NDVI_GWSA_decoupling_grid_1deg` | Existing grid geometry, trend variables, strict class and cell IDs in stage 18 | Not supplied; geometry must be checked against 0.5° manuscript claims |
| `MP_GDRI_driver_dataset_05deg(gy).csv` | Environmental/land-cover predictor table for stage 21a | Not supplied; original generation code, units and time windows are needed |
| `MP_human_driver_dataset_05deg_v1.csv` | Human-pressure predictor table for stage 21a | Not supplied; original generation code, units and time windows are needed |

The collection identifiers below are taken directly from stage 04a, not inferred product versions:

| Earth Engine collection/image ID | Role in the supplied script |
|---|---|
| `MODIS/061/MOD13Q1` | NDVI predictors and related summaries |
| `MODIS/061/MOD09A1` | Surface-reflectance-derived water indicators |
| `MODIS/061/MOD16A2GF` | Alternative evapotranspiration QA/sensitivity variables |
| `MODIS/061/MCD12Q1` | Land-cover fractions |
| `IDAHO_EPSCOR/TERRACLIMATE` | Climate variables and actual/potential evapotranspiration ratio |
| `USGS/SRTMGL1_003` | Elevation and slope |
| `MERIT/Hydro/v1_0_1` | Height-above-drainage predictor |

The public collection identifiers do not provide access to the private study boundary or the previously generated diagnostic grid. Consult the providers' own documentation and terms for raw data reuse.

## Local stage handoffs

All filenames below are relative to `data/work/`, unless a different `--work-dir` is selected.

| Local stage | Required files | Principal outputs |
|---|---|---|
| 08 | `MP_PGDE_anchor_candidates_pooled_v2.csv` | `MP_PGDE_anchor_samples_pooled_v2.csv`; anchor summary |
| 09b | `MP_PGDE_pooled_training_records_v2_FIXED.csv`; anchor samples CSV | `MP_PGDE_pooled_training_records_v2_READY.csv`; record checks |
| 10 | READY training records CSV | `RF_validation_v2/`: CV, blocked leave-one-period-out, stress tests, OOF predictions and recommended parameters |
| 20 | `MP_grid_core_turnover_POOLED_V2_READY_t07.csv` | `MP_GDRI_grid_POOLED_V2_READY.csv`; class summary; risk fractions by domain; weight sensitivity |
| 21a | GDRI grid CSV; both external driver tables listed above | `MP_GDRI_driver_dataset_POOLED_V2_READY.csv` |
| 21b | Merged driver dataset CSV | `XGBoost_SHAP_POOLED_V2_READY/full_driver/` and `/non_overlap/` (the manuscript's reduced-overlap model) |
| 22 | GDRI grid CSV; `XGBoost_SHAP_POOLED_V2_READY/full_driver/XGB_OOF_predictions.csv` | `Step22_typical_grids/`: selected cells, candidate ranking, selection summary and Earth Engine IDs |

The actual XGBoost subdirectory names are defined in stage 21b; preserve them when passing outputs to stage 22. Intermediate names containing `typical` or `driver` are retained for compatibility and do not change the manuscript's intended interpretation.

## Minimum result files to retain with a reproducibility deposit

These are expected workflow outputs, **not included results**:

- `MP_GDE_core_turnover_full_model_POOLED_V2_READY.csv` and `MP_GDE_core_turnover_ensemble_mean_POOLED_V2_READY.csv`, exported by Earth Engine stage 17.
- `MP_GDE_core_turnover_vote_sensitivity_POOLED_V2_READY.csv`, for the distinct ≥8-of-10 agreement criterion.
- `MP_GDRI_weight_sensitivity_POOLED_V2_READY.csv`.
- `MP_GDRI_summary_by_class_POOLED_V2_READY.csv` and `MP_GDRI_risk_ratio_by_domain_POOLED_V2_READY.csv`, retaining unrounded areas.
- Each XGBoost model's `model_features.txt`, `feature_missingness.csv`, `spatial_CV_fold_metrics.csv`, `spatial_CV_overall_metrics.csv`, and `XGB_OOF_predictions.csv`.
- Original environment versions and run records; the local launcher records versions for new invocations only.

Do not place large rasters and model binaries in the GitHub code tree by default. If publishing them, give them a clearly described data deposit and link the exact data version to the code record. For small result tables, explicitly decide which files form part of the archived release rather than relying on the ignored local work directory.

## Schema notes

Stage 20 requires `strict_cls`, `ndvi_slope`, `gwsa_slope`, `PGDE_change`, `core_loss_frac_of_P1core`, `edge_frac_change`, and `valid_area_km2`. Area columns for restricted domains must be present to produce the corresponding domain-specific statistics. The two external tables in stage 21a are joined by unique `grid_id`; they are not regenerated by stage 21a.

Candidate XGBoost predictor sets contain 44 and 18 variables in the supplied script. The fitted feature set can be smaller because absent, entirely missing or constant columns are excluded. Cite each model's exported `model_features.txt`, not candidate counts alone, when describing the actual fit.
