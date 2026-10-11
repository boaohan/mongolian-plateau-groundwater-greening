# Execution order and environment handoffs

The original stage numbering is retained, including its gaps and combined stages. The Word headings for stages 01–03 and 23 did not contain standalone implementation scripts. Stage 05 is represented within the period-predictor implementation. Do not interpret the numbering gaps as scripts that were silently omitted.

P1 = 2003–2007; P2 = 2008–2011; P3 = 2012–2015; P4 = 2016–2019; P5 = 2020–2024.

## Prepare existing inputs

You need an Earth Engine account with access to the study-area polygon, an existing asset folder, and the precomputed NDVI–GWSA diagnostic grid. The supplied code does not build that grid from original GRACE/GRACE-FO data. Its source name is `MP_NDVI_GWSA_decoupling_grid_1deg`; verify its geometry against the manuscript's 0.5° analysis unit before reusing it.

Copy `config/gee.example.json` to `config/gee.local.json`, fill its asset paths, and run `python tools/configure_gee.py`. Use the generated `.local/gee/` copies in the Earth Engine Code Editor. Asset subnames remain the same as in the research source. The scripts may submit many exports; dependent stages require the upstream exports to finish successfully.

## Ordered stages

| Order | Script or local command | Environment and handoff |
|---|---|---|
| 1 | `04a_build_period_predictors_pooled_v2.js` | Earth Engine; creates harmonized predictors and QA outputs for all five periods |
| Optional | `04b_export_pooled_v2_assets_to_drive.js` | Earth Engine; backs up already-created predictor/QA assets to Drive |
| 2 | `06_07_build_stable_anchor_candidates_pooled_v2.js` | Earth Engine; export candidate CSV to Drive, then download it to `data/work/` |
| 3 | `python tools/run_step.py 08` | Local spatial thinning and block allocation; upload the resulting anchor CSV to Earth Engine as `MP_PGDE_anchor_samples_pooled_v2` under the configured asset root |
| 4 | `09_extract_pooled_training_records_v2_FIXED.js` | Earth Engine; rebuild point geometry from lon/lat and extract period records; download its FIXED CSV to `data/work/` |
| 5 | `python tools/run_step.py 09b` | Repair identifiers and create READY training records; keeps the anchor-defined folds |
| 6 | `python tools/run_step.py 10` | RF validation and parameter comparison; review its outputs |
| Handoff | Upload `MP_PGDE_pooled_training_records_v2_READY.csv` | Upload as an Earth Engine table named `MP_PGDE_pooled_training_records_v2_READY`; the final model reads this asset |
| 7 | `12_13_FINAL_POOLED_RF_AND_PGDE_READY.js` | Earth Engine; pooled RF and five PGDE maps; creates the valid masks used downstream |
| 8 | `14_FOLD10_ENSEMBLE_UNCERTAINTY_READY.js` | Earth Engine; ten delete-one-spatial-fold models, ensemble statistics and core votes |
| 9 | `15_APPLICABILITY_DOMAIN_READY.js` | Earth Engine; period and common endpoint applicability domains |
| 10 | `16_RELIABILITY_AND_MISCLASSIFICATION_READY_FIXED_NOMAP.js` | Earth Engine; confidence/ecological-confusion flags and common reliable domains |
| 11 | `17_CORE_TURNOVER_WITH_AD_READY_FIXED.js` | Earth Engine; threshold 0.60/0.70/0.80 summaries, endpoint turnover maps and ensemble-agreement sensitivity |
| 12 | `18_AGGREGATE_CORE_TURNOVER_TO_GRID_READY.js` | Earth Engine; reads the existing diagnostic grid and exports `MP_grid_core_turnover_POOLED_V2_READY_t07.csv`; download it to `data/work/` |
| Optional | `19_CONSERVATIVE_POST_WEIGHT_SENSITIVITY.js` | Earth Engine; legacy conservative PGDE post-weighting sensitivity only, not the primary PGDE model or the GDRI component-weight test |
| 13 | `python tools/run_step.py 20` | Builds GDRI, diagnostic labels, domain-specific area fractions and GDRI weight sensitivity |
| 14 | `python tools/run_step.py 21a` | Joins step 20 output to the two externally supplied environmental/human-pressure CSV tables |
| 15 | `python tools/run_step.py 21b` | Runs the full and reduced-overlap XGBoost models; writes OOF evaluation, feature lists, final-model SHAP and its built-in plots |
| 16 | `python tools/run_step.py 22` | Uses the full-driver OOF table, as the supplied source does, to select illustrative cells and export their IDs |

These commands are examples for a prepared dataset, not a claim that the input CSV files are included. The launcher checks for missing files before executing a local stage.

## Parameter handling

The supplied final Earth Engine RF scripts freeze 500 trees, a minimum leaf population of 5, a bag fraction of 0.7 and seed 20260722. Stage 10 exports a parameter recommendation, but stage 12/13 does not read that JSON automatically. Check that the frozen settings correspond to the intended original run; do not silently retune them while packaging a manuscript code archive. Scikit-learn and Earth Engine RF implementations should not be described as byte-identical trained models.

The original XGBoost compatibility branch is retained: `StratifiedGroupKFold` is used if importable; otherwise `GroupKFold` is used. Archive the actual environment and OOF fold assignments for the run being cited. Do not infer the historical splitter from a fresh installation. The saved OOF table already includes `spatial_CV_fold` and, where present in inputs, `block_2deg` and `grid_id`.

Stage 22's use of `full_driver` for illustrative-cell selection is retained even though the reduced-overlap model is the manuscript's primary interpretive model. This choice must be reported as implemented, not silently changed to match the name of the primary interpretive model.

## Local environment

Windows PowerShell activation: `.venv\Scripts\Activate.ps1`. Windows Command Prompt activation: `.venv\Scripts\activate.bat`. macOS/Linux activation: `source .venv/bin/activate`. After activation, use `python -m pip install -r requirements.txt`.

The packaging utilities require Python 3.10 or later. The original runtime version is unknown. Use the actual study environment where available; otherwise record the new environment and treat new runs as reproductions to compare against the original outputs.

To record an actual working environment, run `python -m pip freeze > environment-lock.txt` after activating that environment. Before committing this file, check for local installation paths. Do not substitute the packaging environment's versions for the original manuscript environment.
