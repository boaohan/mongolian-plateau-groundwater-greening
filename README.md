# Mongolian Plateau groundwater greening and potential GDE analysis

Research-code archive for **Groundwater constraints on restoration-associated greening and spatial turnover of potential groundwater-dependent ecosystems across the Mongolian Plateau**.

This repository contains **18 research scripts: 11 Google Earth Engine JavaScript scripts and 7 Python scripts**, extracted from the author-supplied code document dated by packaging on 10 October 2026. It covers period-based predictors, pooled random-forest PGDE mapping, spatial validation, uncertainty and applicability domains, endpoint core turnover, groundwater-debt diagnosis, XGBoost–SHAP associations, and illustrative grid-cell selection.

**Archive status:** code organization and static syntax checks are provided. The complete scientific workflow has not been rerun during packaging. Research inputs, numerical results, and historical software versions were not supplied. The full GWSA preprocessing, environmental/human-pressure table generation, and GSFLOW model setup are not present in this archive. A code DOI does not certify the numerical results or constitute a journal article DOI.

[中文说明](README_zh.md) · [Execution order](docs/WORKFLOW.md) · [Inputs and outputs](docs/INPUTS_AND_OUTPUTS.md) · [Reproducibility scope](docs/REPRODUCIBILITY.md) · [GitHub and Zenodo instructions](docs/GITHUB_ZENODO_ZH.md)

## Repository contents

| Path | Purpose |
|---|---|
| `scripts/gee/` | Earth Engine scripts, with project-specific asset prefixes parameterized |
| `scripts/python/` | Seven original research stages plus a portable path helper |
| `tools/` | Local stage runner, static checker, Earth Engine configuration, citation preparation |
| `config/` | Editable example settings; no credentials |
| `data/work/` | Local CSV inputs and generated results; not part of the published code archive |
| `docs/` | Workflow, data dependencies, limitations, terminology, and publication instructions |
| `provenance/` | Source-document hash, extraction boundaries, script hashes and validation report |
| `requirements.txt` | Direct research dependencies; not a historical version lock |

## Start with the code archive

Use Python 3.10 or later for the packaging utilities. This requirement is for the provided utilities, not a statement about the original study's Python version.

```bash
python tools/check_repository.py
python tools/run_step.py --list
```

If Node.js is available, the checker also parses the Earth Engine JavaScript files without executing them. Syntax checks do not validate Earth Engine asset existence or server-side execution.

## Run the scientific workflow

The workflow alternates between Earth Engine and local Python. Read `docs/WORKFLOW.md` before running it; it is not a single-command pipeline.

```bash
python -m venv .venv
```

Activate the environment, then install the dependencies:

```bash
python -m pip install -r requirements.txt
```

Historical package versions were not supplied. Where possible, start from the actual original research environment rather than assuming these unpinned dependencies reproduce the submitted results.

For Earth Engine, copy `config/gee.example.json` to `config/gee.local.json`, replace its two asset paths with your own existing inputs/output folder, then run:

```bash
python tools/configure_gee.py
```

Open the generated scripts under `.local/gee/` in the Earth Engine Code Editor in the documented order. Creating export tasks is not the same as completing them. Wait for the upstream exports before running dependent stages. The asset folder must already exist and the required private assets must be accessible in your account.

For local stages, place the required CSV files in `data/work/` and run a specific stage, for example:

```bash
python tools/run_step.py 20 --check-inputs
python tools/run_step.py 20
```

The runner records input hashes, package versions, timestamps, the script hash and exit status under `data/work/run_records/`. Existing research output filenames are preserved, so use a separate `--work-dir` for reruns you want to keep separate.

## Scientific interpretation

- PGDE is a modeled potential-groundwater-dependence score. Core status uses an operational threshold, primarily PGDE ≥ 0.70.
- Endpoint stability means the threshold is met in P1 and P5; it does not establish continuous stability in the intermediate periods.
- Core loss/gain denote threshold transitions, not field-observed ecosystem disappearance/formation.
- GDRI is a relative composite index. Diagnostic states are assigned separately, using the supplied threshold rules.
- XGBoost metrics use held-out spatial predictions. SHAP explains separate final models refitted to all analysis cells, and does not establish causality.
- Legacy output keys named `PR_AUC` in these scripts are calculated with `average_precision_score`; manuscript reporting should call this metric **average precision (AP)**.

See `docs/TERMINOLOGY.md` for the correspondence between legacy output labels and current manuscript names.

## Citation and DOI

No DOI is included because none has been registered for this package. Before the first formal release, run:

```bash
python tools/prepare_release.py --interactive
```

Supply the confirmed code-author list, repository URL, release date and license. The utility creates an actual `CITATION.cff` after the missing metadata is supplied; it never fabricates authors or a DOI. A `.zenodo.json` file is unnecessary for this simple workflow and is not generated.

Then enable the repository in Zenodo and publish the corresponding GitHub release. Cite the Zenodo **version DOI** for the code version associated with the manuscript. See `docs/GITHUB_ZENODO_ZH.md` for the exact steps, including the separate manual-upload route if a DOI must be reserved before publication.

## License status

The supplied document did not identify an explicit code license. No reuse license has been selected on the authors' behalf. Confirm the license with the code's rights holders before the formal release. If they select MIT, the citation utility can write its full license text with the confirmed copyright holder; for another license, add the matching `LICENSE` text before running the utility. External datasets and dependencies retain their own terms.
