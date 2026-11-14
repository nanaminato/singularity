# Singularity CLI 与本地编辑器

本工具用于 0.3 草案，使用 Python 3.11+ 标准库。CLI 和本地编辑器直接读写同一批 TOML 记录。

## 本地编辑器

Windows x64 压缩包内含 Python 和 Tk。完整解压后，双击 `Singularity Editor.exe`，点击「Browse…」选择项目根目录。命令行可直接运行 `singularity.exe --help`。请保留同目录下的 `_internal`，查询 Git 历史需要系统能找到 Git。

维护者可在编译 Angular 后，在 Windows x64 上用带 Tk 的 Python 和 PyInstaller 构建压缩包内容。运行 `python -m PyInstaller --distpath .windows-build/dist --workpath .windows-build/work tools/windows.spec`，再将输出的 `Singularity-Windows` 目录完整打包。

Windows 用户可双击 [open-editor.pyw](../open-editor.pyw)，用图形窗口选择项目根目录，浏览器会自动打开。关闭启动器窗口即可停止服务。需要安装带 Tk 和 `.pyw` 文件关联的 Python 3.11+。编辑器读写项目的 `.singularity/singularities`，首次新建候选时会创建目录。Git 历史读取项目已提交的记录。

分发时把 `open-editor.pyw` 和 `tools/` 一起复制并保留目录结构。Angular 编译结果已在 `tools/editor/`，用户端直接使用。维护网页时用 Node.js 26 在仓库根目录运行 `npm --prefix web ci`，再运行 `npm --prefix web run build` 更新编译结果。

```powershell
python tools/singularity.py --records examples/minimal/.singularity/singularities serve
```

在浏览器打开命令输出的地址，默认是 [127.0.0.1:8765](http://127.0.0.1:8765/)。可搜索 ID 和陈述、查看关联、保存陈述和确认候选。网页操作标记为 Human。如果 Agent 已修改当前打开的记录，网页会要求重新加载。服务仅监听本机，按 Ctrl+C 停止，可用 `serve --port 8766` 改端口。

Agent 可用 `list`、`get` 和 `context` 取得 JSON，用 `create`、`links`、`update` 和 `confirm` 修改记录，再用 `validate` 和 `impact` 校验与查看影响。

## 新建和编辑关联

网页点击「新建候选」，填写稳定 ID 和陈述。路径和决策 ID 各占一行。创建后选中该记录，使用「保存关联」更新两组关联。

```powershell
python tools/singularity.py create S-EXAMPLE-001 --statement "A fictional requirement." --paths src/
python tools/singularity.py links S-EXAMPLE-001 --paths src/ tests/ --decisions D-EXAMPLE-001
```

`create` 写入 `<ID>.toml`，新记录状态为 `Candidate`，重复 ID 会报错。`links` 仅替换显式传入的列表，单独传入 `--paths` 或 `--decisions` 可清空对应列表。决策 ID 按格式校验，实际引用关系仍需核对。

在仓库根目录运行以下命令。两个示例各提供一条 TOML 记录。省略 `--records` 时，使用当前工作目录下的 `.singularity/singularities`。

```powershell
python tools/singularity.py --records examples/minimal/.singularity/singularities validate
python tools/singularity.py --records examples/minimal/.singularity/singularities get S-TODO-001
python tools/singularity.py --records examples/minimal/.singularity/singularities context --path README.md
python tools/singularity.py --records examples/existing-project/.singularity/singularities validate
python tools/singularity.py --records examples/existing-project/.singularity/singularities get S-AUTH-001
python tools/singularity.py --records examples/existing-project/.singularity/singularities context --path src/Auth/AuthService.cs
```

创建自己的记录时，在记录目录直接放置 UTF-8 的 `.toml` 文件，每个文件保存一条记录。以下是一条候选记录。

```toml
format = 2
actor = "AI"
id = "S-TODO-001"
status = "Candidate"
statement = "删除待办事项前需要用户确认。"
reason = "避免误删。"
```

`format = 2` 使用 `actor = "Human"` 或 `actor = "AI"`。工具可读取格式 1 的旧记录，编辑时转为格式 2。

- `id` 使用大写字母、数字和连字符，首段以字母开头，至少有两段。所有文件中的 ID 必须唯一，文件名可独立修改。
- `status` 接受 `Candidate`、`Confirmed`、`Rejected`、`Retired`。`statement` 和可选的 `reason` 使用非空字符串，支持 TOML 多行字符串。
- `paths` 是可选的项目相对路径数组。文件路径按全名匹配，尾部带 `/` 的目录匹配其下各级文件。TOML 里使用 `/`，查询可使用 Windows 反斜杠，匹配区分大小写。

所有命令都检查记录目录的直接子文件。语法错误、未知字段、重复 ID、无效字段或没有 TOML 记录都会导致失败。`get` 先通过整库校验，再向标准输出写入单条 JSON。`context` 同样先校验，再按 ID 顺序输出匹配记录的 JSON 数组，无匹配时输出 `[]`。错误写入标准错误，退出码为 `1`；参数错误由 Python 的参数解析器返回 `2`。

`--path` 相对于记录所属项目的根目录。认证示例中的源码路径取自虚构场景，查询只比较路径文本。路径命中表示该记录值得查看，意图的适用范围仍由陈述决定。

## 查看变更影响

在 Git 工作树内运行，`--records` 指向该仓库内的记录目录。

```powershell
python tools/singularity.py --records examples/minimal/.singularity/singularities impact --base HEAD
python tools/singularity.py --records examples/existing-project/.singularity/singularities impact --base HEAD
```

`impact` 比较基准提交和当前磁盘内容，包含尚未跟踪的 TOML 文件。两侧均按稳定 ID 校验。结果按 ID 输出 JSON 数组，每项包括变更类型（`added`、`modified` 或 `removed`）、变动字段，以及两侧声明的决策 ID 和路径的并集。只改文件名、注释或字段顺序时，记录内容仍相等。没有变更时返回 `[]`。

可选的 `decisions = ["D-AUTH-001"]` 声明直接关联的决策 ID。认证示例引用现有决策 `D-AUTH-001`。待办示例的 `S-TODO-001` 在现有决策中没有显式引用，结果中的决策列表为空。决策和路径是已记录的重评线索，仍需结合实际依赖核查。

## 修改、确认和移除

```powershell
python tools/singularity.py update S-EXAMPLE-001 --statement "Revised statement."
python tools/singularity.py confirm S-EXAMPLE-001 --actor Human
python tools/singularity.py reject S-EXAMPLE-002 --reason "已合并至 S-EXAMPLE-001"
python tools/singularity.py retire S-EXAMPLE-001 --actor Human
python tools/singularity.py retire S-EXAMPLE-003 --actor Human --remove
```

CLI 默认标记 AI。确认、修改已确认陈述和退役时使用 `--actor Human`，由人明确决定后执行。网页按 Human 标记操作。退役默认保留 `Retired` 记录，网页显示「已移除」。直接删除可通过网页按钮或 CLI 的 `--remove` 完成，已提交的版本仍可在 Git 中查看。

## 按稳定 ID 查看 Git 历史

网页「Git 历史」可查当前选中的记录，也可输入已移除记录的 ID。CLI 可运行：

```powershell
python tools/singularity.py --records examples/minimal/.singularity/singularities history S-TODO-001
```

历史沿当前分支的第一父提交链读取指定记录目录，按 ID 比较每个相关提交中的记录，显示字段旧值、新值及文件路径变化。目录内文件改名仍可追溯。合并纳入的变化归入合并提交。未提交的编辑可用 `impact --base HEAD` 查看。迁移前的 Markdown 示例保存在 `v0.1.0`，TOML 历史从首次提交 TOML 记录开始。
