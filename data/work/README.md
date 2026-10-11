# Local research files

Put the required CSV files exported from Earth Engine or retained from the original study in this directory. Stage outputs also go here, preserving the supplied workflow's filenames. `MP_WORK_DIR` or `tools/run_step.py --work-dir` can select a different directory.

Research inputs and results are not included in this code-only package. Their absence is intentional and does not imply they are unnecessary. See `docs/INPUTS_AND_OUTPUTS.md` for the exact file dependencies. Git ignores the contents of this directory apart from this README. For a browser upload, `.gitignore` does not filter files you manually select: do not select local research data accidentally.
