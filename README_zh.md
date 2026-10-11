# 蒙古高原地下水与增绿研究代码

这是根据《新蒙古高原研究思路（具体代码）(4).docx》整理的 GitHub 项目。包含 **11 个 Earth Engine 脚本和 7 个 Python 研究脚本**，以及运行配置、输入输出说明、引用信息生成工具和 GitHub–Zenodo 发布指南。

整理时保留研究阈值、随机种子、模型参数和分折选择逻辑；修改包括拆分脚本、本地路径配置、默认关闭文件选择窗口，以及修复第 09 步粘贴重复回调尾段造成的语法错误。代码整理版本不能代替原始运行记录。本包没有原始数据、模型结果或已生成的 DOI。

## 如果你只想先上传 GitHub

1. 解压项目，先阅读 `docs/GITHUB_ZENODO_ZH.md`。
2. 创建自己的 GitHub 仓库，把**项目目录里面的文件和文件夹**上传到仓库根目录，不要只上传 ZIP。
3. 正式发行前补齐代码作者顺序、仓库网址、许可证和日期。运行 `python tools/prepare_release.py --interactive` 可生成引用文件；不熟悉命令行时，指南里也提供了手工方式。
4. 在 Zenodo 中启用该仓库，再到 GitHub 发布 `v1.0.0`。Zenodo 归档后才会产生真实 DOI。

GitHub 的仓库地址用于查看代码；Zenodo 的 DOI 用于引用固定归档版本。它们不等于论文的期刊 DOI。

## 如果你需要运行代码

先看 `docs/WORKFLOW.md` 和 `docs/INPUTS_AND_OUTPUTS.md`。这套流程需要在 Earth Engine 与本地 Python 之间交接文件，不能从第一行到最后一行在同一个环境里运行。

- Earth Engine：把 `config/gee.example.json` 复制为 `config/gee.local.json`，填写自己的研究区资产和资产目录。运行 `python tools/configure_gee.py`，使用 `.local/gee/` 中生成的脚本。
- Python：把输入 CSV 放在 `data/work/`；先安装 `requirements.txt` 中的依赖，然后运行 `python tools/run_step.py 阶段编号`，如 `python tools/run_step.py 20`。
- `python tools/run_step.py --list` 显示七个本地阶段。
- `python tools/check_repository.py` 只做语法和文件完整性检查，不训练模型。
- 每次通过运行工具执行本地阶段，实际 Python/软件版本、输入文件哈希和退出状态会写入 `data/work/run_records/`。

## 当前还需要作者补充的研究材料

本次代码文档没有提供完整的 NDVI–GWSA 前处理/六套 GWSA 重建代码、旧环境变量及人类活动变量表的生成代码、GSFLOW 配置与输入文件，以及全部论文图件的绘图代码。原始运行软件版本也未提供。这些缺口已在 `docs/REPRODUCIBILITY.md` 列明，不能把本包表述为“已完整复现全部论文结果”。

原格网资产名称含 `1deg`，而论文描述使用 0.5° 分析单元。本包保留原资产名称；正式归档前应按格网几何核查实际分辨率，不能仅凭文件名改论文或资产名。

## 文件入口

| 需要做什么 | 打开哪个文件 |
|---|---|
| 上传 GitHub、生成 DOI | `docs/GITHUB_ZENODO_ZH.md` |
| 按顺序运行研究代码 | `docs/WORKFLOW.md` |
| 准备输入文件和检查输出 | `docs/INPUTS_AND_OUTPUTS.md` |
| 了解复现范围和缺失材料 | `docs/REPRODUCIBILITY.md` |
| 对照代码旧字段与论文新术语 | `docs/TERMINOLOGY.md` |
| 核对代码来源和整理改动 | `provenance/extraction_manifest.json` |
