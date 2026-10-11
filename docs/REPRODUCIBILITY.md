# Reproducibility scope and code provenance

## What was supplied

The source is the author-attached `新蒙古高原研究思路（具体代码）(4).docx`. Its SHA-256 and the 18 extracted script ranges are recorded in `provenance/extraction_manifest.json`. The original Word document is not redistributed as part of the code repository. Its instructional headings were excluded from executable scripts.

## Changes made for this repository

1. Split the mixed Earth Engine/Python document into individual UTF-8 scripts, keeping the original research order and naming where available.
2. Replaced the personal Earth Engine project prefix with `YOUR_GEE_PROJECT`; the configuration utility generates local copies with user-supplied asset paths.
3. Replaced five fixed Windows working-directory assignments with `data/work/` or `MP_WORK_DIR`.
4. Resolved the XGBoost and illustrative-cell selection input paths below the same work directory and disabled their optional file chooser by default. Their original selection logic is retained.
5. Repaired an actual syntax defect in stage 09: an already complete `anchorsRaw.map(...)` callback was followed by a duplicated orphan `return ee.Feature(...)` block and closing `});`. Removed that orphan tail and its repeated filter/print block. Retained the intact lon/lat point construction and `copyProperties(feature)` callback. This is a packaging repair, not evidence that the original model was rerun.
6. Added documentation, non-scientific helper tools, input checks, source hashes and citation preparation.

Research thresholds, random seeds, RF/XGBoost hyperparameters, masking logic, diagnostic criteria and original cross-validation compatibility branches were not intentionally retuned. The repository records actual modifications instead of describing the malformed Word extraction as byte-identical executable code.

## What the packaging validation establishes

Python syntax is parsed without importing or running the models. Earth Engine JavaScript is parsed with Node without submitting Earth Engine tasks. Script hashes are checked against the packaged manifest. The helper utilities are exercised for input detection, configuration and metadata preparation. The final validation report is in `provenance/validation_report.json`.

These checks do **not** establish model validity, successful Earth Engine execution, reproduction of published areas/metrics, or the availability of referenced assets. They also do not establish the historical software environment. No study outputs are invented in this archive.

## Material still needed for full-paper reproduction

- The original NDVI/GWSA trend-grid construction and six-product GWSA reconstruction workflow, including product versions, missing-month handling and spatial masks.
- The study-area polygon, actual grid geometry and required data/asset access information.
- Generation code and metadata for the external environmental and human-pressure tables, including units and time windows for trend predictors.
- Original Python/package versions and the actual cross-validation splitter/fold records. The XGBoost script contains a compatibility branch, and fresh environment records do not retrospectively establish which branch the original study used.
- The full GSFLOW project, model inputs, configuration and relevant outputs. No GSFLOW reconstruction was created from narrative descriptions.
- The plotting code/data for all manuscript figures. The built-in SHAP plots do not amount to a reconstruction of every paper figure.
- Numerical sensitivity outputs for thresholds 0.60/0.80 and GDRI weights. Implementation code alone does not demonstrate their results.

## Interpretation and reporting checks

The imported grid filename includes `1deg`. Its geometry has not been inspected here. Do not change the manuscript's 0.5° scale or rename the asset solely on that basis.

The generic `reliability_class` in stage 16 combines flags using the Strict applicability domain; its exported stack also includes separate Relaxed-domain and common-endpoint fields. A figure caption must identify the actual field plotted. The source name alone is insufficient to identify a final figure's masking choices.

The supplied code retains legacy labels and the metric key `PR_AUC` to avoid changing downstream joins and schemas. `PR_AUC` is computed by `average_precision_score` and should be reported as AP. Use the manuscript-compatible display names in `docs/TERMINOLOGY.md` without silently redefining numeric class membership.

GDRI weight changes affect continuous scores and rankings, not the independently assigned diagnostic states. Threshold sensitivity of core maps does not by itself test the reported diagnostic risk-area fraction under alternative core thresholds. Stable cores are defined by P1/P5 endpoints only.

The study's GSFLOW analysis is a separate process-consistency assessment. This code archive does not provide an independent observational validation of GWSA or potential GDE diagnoses.
