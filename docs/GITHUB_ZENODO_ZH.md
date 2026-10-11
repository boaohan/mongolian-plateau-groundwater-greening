# GitHub 上传与 Zenodo DOI 操作指南

本指南针对这份蒙古高原研究代码包，依据 2026 年 10 月 10 日核查的 GitHub 和 Zenodo 官方说明整理。GitHub 用于管理和展示代码；Zenodo 用于归档一个固定版本并分配 DOI。这里生成的是**代码 DOI**，不是期刊分配给论文的 DOI，也不等于结果已经通过复现验证。

## 1 准备项目

解压下载的 ZIP。打开 `mongolian-plateau-groundwater-greening` 文件夹后，应能直接看到 `README.md`、`README_zh.md`、`scripts`、`tools`、`docs`、`config`、`provenance` 和 `requirements.txt`。

上传时选择这些内部文件和文件夹，不要只上传整个 ZIP，也不要让仓库根目录再套一层同名文件夹。根目录应直接显示 README。

本包没有代填你的代码作者名单、GitHub 用户名、ORCID 或 DOI。正式发行前需要补齐：代码作者的真实姓名与顺序、仓库网址、许可证、版本号和发布日期。ORCID、单位可以补充；没有 ORCID 就留空，不使用示例号码。

## 2 创建 GitHub 仓库

1. 登录 [GitHub](https://github.com/)，进入 [新建仓库页面](https://github.com/new)。
2. Repository name 建议填写：`mongolian-plateau-groundwater-greening`。
3. Description 可填写：`Research code for groundwater constraints on greening and potential GDE dynamics across the Mongolian Plateau.`
4. 正式使用 Zenodo–GitHub 自动归档时，仓库需可公开访问。若仍在内部整理，可以先建 Private 仓库，准备好后再转为 Public；Zenodo 的该集成不读取私人仓库。
5. 不需要让 GitHub 再初始化 README 或 `.gitignore`，包里已经提供。许可证在作者确认后另行添加，避免出现不一致的两份文件。
6. 点击 Create repository。

## 3 上传项目文件

空仓库页面点击 `uploading an existing file`；已有文件时选择 `Add file → Upload files`。把解压后项目里面的文件和文件夹拖入上传区域。

确认包括 `.gitignore` 和 `.gitattributes`。在浏览器中手动上传时，`.gitignore` 不会替你过滤已选中的文件：不要把后来放入 `data/work/` 的研究数据、运行结果或个人配置一并拖进去。

Commit message 可写 `Organize research code for archival release`，然后提交。上传后检查 `scripts/gee/` 中有 11 个研究脚本，`scripts/python/` 中有 7 个研究脚本和 1 个路径辅助文件。当前包中的文件数量和大小适合网页上传；GitHub 网页端单次最多上传 100 个文件、单文件最大 25 MiB。

仅上传代码不会生成 DOI。下一步要补齐引用元数据，再发布版本。

## 4 补齐作者、许可证和 CITATION.cff

在解压后的项目根目录打开终端。Windows 用户可以在资源管理器地址栏输入 `cmd` 并回车，在该目录打开命令提示符。已有 Python 环境时运行：

```bash
python tools/prepare_release.py --interactive
```

根据提示输入仓库真实网址、软件标题、版本、预计发布日期、作者顺序和已确认的许可证。该工具仅使用 Python 标准库，不需要先安装全部研究依赖。它不会连接 GitHub 或 Zenodo，也不会生成 DOI。

第一版建议使用版本号 `1.0.0`，GitHub 标签对应 `v1.0.0`。软件标题可用 `Mongolian Plateau groundwater greening and potential GDE analysis code`。作者应按代码贡献和团队确认的署名顺序填写；不要机械照搬论文名单，也不要填自动生成的占位姓名。

许可证必须由代码权利人确认。本包没有擅自赋予代码开源许可证。如果确认使用 MIT，工具会生成含实际权利人的完整 `LICENSE`。若选择其他许可证，请先在根目录放入对应的完整 `LICENSE`，再填相应 SPDX 标识。数据和第三方依赖的许可证不会因为代码采用某个许可证而改变。

首次走自动归档路线时，DOI 输入项**留空**。生成的 `CITATION.cff` 和 `LICENSE` 应再上传并提交到 GitHub。`config/release_metadata.json` 是本地工作配置，不需要上传。

如果不使用这个工具，可以复制根目录的 `CITATION.cff.template`，把所有 `REPLACE_...` 替换为实际信息，再另存为 `CITATION.cff`。这是模板，不能带着占位内容发布。你也可以使用 GitHub 的许可证选择器添加完整 LICENSE。有效的 CITATION 文件放在默认分支根目录后，GitHub 会显示“Cite this repository”。

这套简单流程只需 `CITATION.cff`，不需要 `.zenodo.json`。如以后同时添加两者，当前 Zenodo 文档规定 `.zenodo.json` 优先；应避免两份元数据的作者、版本或许可证发生分歧。

## 5 连接 Zenodo 并启用仓库

1. 登录正式的 [Zenodo](https://zenodo.org/)。正式 DOI 使用正式站点，不使用测试 sandbox 站点。
2. 在账户设置中关联你的 GitHub 账户；具体入口见官方 [关联账户说明](https://help.zenodo.org/docs/profile/linking-accounts/)。
3. 在 Zenodo 头像菜单中选择 GitHub，点击 `Sync now`。
4. 找到刚创建的仓库，把对应开关打开。
5. 确认仓库出现在已启用列表，再进行下一步。

应在发布 GitHub release **之前**启用归档。只提交代码、只创建标签或只保存 release 草稿，都不要当成 DOI 已生成。

## 6 发布 v1.0.0

回到 GitHub 仓库，依次选择 `Releases → Draft a new release`，按下表填写：

| 项目 | 建议内容 |
|---|---|
| Tag | `v1.0.0`，选择新建标签 |
| Target | 含完整代码、CITATION 和 LICENSE 的 `main` 分支 |
| Release title | `v1.0.0 Research code archive` |
| Description | 使用 `docs/RELEASE_NOTES_v1.0.0.md` 中的说明，按实际完成情况修改 |

检查作者、许可证、缺失数据说明与代码状态后点击 `Publish release`。不需要把源文件再次作为附件逐个上传，GitHub 会提供该标签对应的源码归档。

Zenodo 会处理这个新版本。返回 Zenodo 的 GitHub 页面，找到该 release；处理完成后点击 DOI 打开记录页，核对标题、代码作者顺序、版本、许可证、归档文件和访问状态。若失败，展开该 release 的 Errors 信息，按实际错误修正元数据或联系平台支持。不要用编造的 DOI 代替失败的归档。

## 7 将真实 DOI 用于论文和仓库

Zenodo 会区分某个具体版本的 DOI 与汇集所有版本的 concept DOI。论文应优先引用与结果对应的**具体版本 DOI**，便于审稿人定位固定代码。项目总览可以另外展示 concept DOI，但不要把二者当成两个独立研究成果。

获得真实代码 DOI 后，可以重新运行引用工具，把它写入当前分支的 CITATION：

```bash
python tools/prepare_release.py --doi YOUR_ACTUAL_VERSION_DOI
```

`YOUR_ACTUAL_VERSION_DOI` 必须替换为 Zenodo 实际分配的版本 DOI，不能照抄。工具仅检查基本格式，不验证 DOI 是否已公开注册。也可直接编辑 CITATION，新增 `doi:` 字段。将更新后的引用文件和 README 提交到默认分支即可；不要为回填 DOI 而移动已经归档的 `v1.0.0` 标签。

后续有实质代码修改时发布 `v1.0.1` 或 `v1.1.0`。更新版本号和发布日期，并避免让新版本 CITATION 继续声称上一版本 DOI；新版本归档后再补它自己的 DOI。

论文中的 Code availability 可按实际归档状态使用下面模板。方括号内容必须换成真实地址；只有在记录公开且链接可访问后，才能写 archived/available。

> The research scripts are available at [GitHub repository URL], and version [version] is archived in Zenodo at [version DOI URL]. The archive contains the Earth Engine and Python workflow documented in the repository. Required external inputs and components not included in the archive are identified in the repository documentation.

这句话没有宣称缺失的 GWSA 前处理、GSFLOW 工程或所有数据也已公开。如果后来补齐，应据实际存档内容更新说明。

## 8 如果投稿前必须提前知道 DOI

这是与自动集成不同的**手动归档路线**。Zenodo 官方说明：GitHub 自动集成不能提前预留 DOI；手动新建上传可以预留。

1. 在 Zenodo 新建上传记录，资源类型选 Software。
2. DOI 项回答没有已有 DOI，点击 `Get a DOI now!`。得到的是预留号码，未发布前不代表记录已公开可访问。
3. 保留该草稿，把预留代码 DOI 加入代码引用信息。不要填写未来论文的期刊 DOI。
4. 固定 GitHub 标签/版本，下载对应源码 ZIP，上传到这个已预留 DOI 的同一草稿；填写作者、版本、描述和许可证，在描述中注明对应 GitHub release URL 和提交号。
5. 确认后发布该 Zenodo 记录，检查 DOI 链接确实可访问。

同一版本采用一种归档路线即可。若选择手动预留，请避免再为同一版本触发一份重复的自动归档记录。不要删掉预留 DOI 的草稿后期望原号码仍保留给新记录。

## 9 归档前还需要补什么

这份包可以直接作为规范代码项目上传。要让审稿人复现原论文，仍需补充实际可获取的数据/资产说明、GWSA 和旧变量表的生成代码、GSFLOW 文件、关键数值输出、原始软件版本及分折记录。本包的语法检查不能代替这些材料。

原文中还存在格网资产名含 `1deg`、实际研究尺度描述为 0.5° 的待核查事项，以及通用可靠性分类使用 Strict 而某些图注写 Relaxed 的图源问题。这些在 `docs/REPRODUCIBILITY.md` 中已列出，未擅自修改研究定义。

## 官方操作依据

- [GitHub 上传文件及数量/大小限制](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [GitHub 管理 release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
- [GitHub CITATION 文件](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files)
- [GitHub 添加许可证](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-license-to-a-repository)
- [Zenodo 启用 GitHub 仓库](https://help.zenodo.org/docs/github/enable-repository/)
- [Zenodo 归档 GitHub release](https://help.zenodo.org/docs/github/archive-software/github-upload/)
- [Zenodo CITATION 和 JSON 元数据优先级](https://help.zenodo.org/docs/github/describe-software/citation-file/)
- [Zenodo DOI 版本区别](https://support.zenodo.org/help/en-gb/1-upload-deposit/97-what-is-doi-versioning)
- [GitHub 自动集成不支持预留 DOI](https://support.zenodo.org/help/en-gb/24-github-integration/73-can-i-pre-reserved-a-doi-before-a-github-release)
- [手动预留 DOI](https://help.zenodo.org/docs/deposit/describe-records/reserve-doi/)
- [Zenodo 手动归档软件](https://help.zenodo.org/docs/github/archive-software/manual-upload/)
