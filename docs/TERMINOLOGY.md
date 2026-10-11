# Manuscript terminology and legacy output labels

Numeric diagnostic rules are retained from the supplied code. For paper figures and captions, map legacy labels to the names used in the revised manuscript.

| Numeric class | Legacy code/display name | Current manuscript name |
|---:|---|---|
| 0 | Other_or_uncertain | Other/uncertain |
| 1 | Water_secure_recovery | Greening without groundwater decline–GDE stable |
| 2 | Debt_greening_GDE_stable | Groundwater-debt greening–GDE comparatively stable |
| 3 | Debt_greening_GDE_risk | Potential GDE risk |
| 4 | Debt_greening_extreme_risk | Extreme potential GDE risk |
| 5 | Ecohydrological_degradation | Co-occurring vegetation and groundwater decline |

These class codes refer to the GDRI diagnostic-state output, not the separate four-class NDVI–GWSA trend scheme or the four-class core-turnover raster. Do not apply this mapping to those other variables.

- **Stable core**: PGDE meets the chosen threshold at both endpoints. Use this wording consistently with the main text; the term does not demonstrate continuous intermediate-period persistence.
- **PGDE**: modeled potential groundwater-dependent ecosystem probability/score, not an observed ecosystem boundary.
- **GDRI**: Groundwater Debt Risk Index; a calculated relative index, not a trained model or calibrated degradation probability.
- **AP**: average precision. The legacy `PR_AUC` output field uses `sklearn.metrics.average_precision_score`; keep its numeric value and report the correct name.
- **OOF**: out-of-fold. OOF results measure held-out discrimination; final fitted-model SHAP values are not OOF explanations.
- **AET/PET**: actual-to-potential evapotranspiration ratio. The main period-predictor field called `ET_PET` is built from TerraClimate `aet` and `pet`; do not infer the units or provenance of externally imported columns from a similar name alone.
- **Illustrative cells**: the output directory retains `typical_grids` for compatibility, but the selected trajectories are illustrative, not population-representative estimates.

Reference interpretation follows the author's updated Text S2 and Section 3.4. This repository does not replace them with an earlier manuscript draft. It does not assert that the reported area percentages or sensitivity results have been recalculated during packaging.
