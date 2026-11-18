# Singularity 0.4 core CLI

Python 3.11+，只使用标准库。所有结果与错误均为 JSON。成功退出码 0，模型/文件错误 1，命令参数错误 2。

```powershell
python tools/singularity.py --project C:/path/to/project init --name "My project"
python tools/singularity.py --project C:/path/to/project schema
python tools/singularity.py --project C:/path/to/project list
python tools/singularity.py --project C:/path/to/project validate
```

init 创建空模型，不覆盖已有模型。schema 输出内置类型必需属性和关系影响方向；完整字段规范见 [SPEC](../SPEC.md)。

## 事务写入

将操作数组保存为 UTF-8 JSON 文件。例如 `operations.json`：

```json
[
  {"action":"put","collection":"nodes","value":{
    "id":"MOD-HOST","type":"module","title":"事件宿主",
    "body":"持有事件循环与状态，具体实现仍待验证。","actor":"AI",
    "authorization":"not_applicable","delivery":"planned",
    "verification":"unverified","attributes":{}
  }}
]
```

从 list、get 或 validate 结果取得 revision：

```powershell
python tools/singularity.py --project C:/path/to/project apply operations.json --expected REVISION --dry-run
python tools/singularity.py --project C:/path/to/project apply operations.json --expected REVISION
```

put 是完整对象替换，不是字段合并。collection 支持 nodes/relations/references/views/types。types 操作用 `id` 指定类型名、`value` 指定 schema。delete 用 `id` 指定对象，不支持隐式级联删除。多项操作在一个事务内一起通过校验再保存。

确认节点或修改已确认节点，使用 `--actor Human --basis "本次人的明确决定"`；只有实际授权存在时才能填写。调用者提供的 actor 不是真实身份认证。拒绝、退役同样要求明确依据。未经授权不能把现有文档自动升级为已确认意图。

## 查询

```powershell
python tools/singularity.py --project ../littleloop find "SQLite" --type module --limit 8
python tools/singularity.py --project ../littleloop context IFACE-EVENT --depth 2 --summary --max-nodes 12 --max-bytes 8192
python tools/singularity.py --project ../littleloop get IFACE-EVENT
python tools/singularity.py --project ../littleloop context IFACE-EVENT --depth 2
python tools/singularity.py --project ../littleloop impact IFACE-EVENT --depth 3
python tools/singularity.py --project ../littleloop tree VIEW-SYSTEM
python tools/singularity.py --project ../littleloop gaps
python tools/singularity.py --project ../littleloop check-refs
```

context 双向取邻域；impact 按依赖方向取重评线索，含原因边。depth 范围 0–100，默认 2。tree 返回展平行，每行带 ID、父级和深度。gaps 输出缺少验证关联、未决假设/问题/冲突及 stale 状态，不代表项目完整性证明。

给 Agent 的推荐顺序是 `find` → `context --summary` → 对少量 ID 执行 `get`。find 按 NFKC 和大小写归一后匹配每个空格分隔的词，检索 ID、标题、正文和附带引用的路径/用途，结果只返回 ID、标题、类型和状态。它不是语义翻译或全文档搜索；找不到结果时可换用术语、已知 ID 或阅读关联文档。`--type` 可重复，`--limit` 是 1–100。

不带新增参数的 context 保持原输出。使用 `--summary`、`--relation`（可重复）、`--max-nodes` 或 `--max-bytes` 任一参数启用精简查询格式，默认最多 16 个节点和 8192 字节。节点范围 1–250；字节范围 1024–1000000，按最终 UTF-8 JSON（含换行）计量。按根节点、关键节点、距离和 ID 稳定排序。显式 `verification_basis` 在关系过滤之外补入一次，不继续递归；摘要保留引用与验证依据的 ID，以及是否存在授权依据。可用 `get` 展开正文、引用、授权或验证依据。

`via` 是一个发现关系，不是全部路径。输出中的 `omissions` 区分节点总省略数、关键节点省略数、有限的关键 ID 示例及未列出的数量；输出太小也可能放不下根节点。遇到关键省略应扩大预算、沿 ID 追查或缩小范围，不应将省略解释为不存在。深度、关系滤镜之外的节点不计入预算省略数。

check-refs 返回 exists/missing/matched/changed/outside_project/unreadable/unchecked。默认不检查外部文件，`--external` 才启用。URL 不联网检查。存在性不意味着 revision 或 locator 已验证；结果明确显示检查边界。

## 浏览器和打包

先在 `web` 执行 `npm ci` 和 `npm run build` 构建 Angular 前端。前端开发、版本要求和浏览器测试见 [web/README.md](../web/README.md)。

```powershell
python tools/singularity.py --project ../littleloop serve --open
```

本机工作台支持节点、关系、文件引用和树视图的创建、修改和删除。选择组成、目标或交付视图浏览节点，通过对应关系和根节点维护树。节点类型决定属性表单，数组与对象在各自的 JSON 字段中编辑。外部引用记录路径或网址、用途和版本信息。

上下文查询可按深度、关系类型及结果节点类型筛选。网页保存使用当前 revision 并通过核心事务服务校验。已确认节点等受保护操作仍需填写人工决定依据。遇到版本冲突时可保留草稿内容，重新加载后再应用。

双击仓库根目录 open-editor.pyw 可选择项目。Windows PyInstaller 构建入口为 tools/windows.spec。

## 测试

```powershell
python -m unittest discover -s tests -v
```

测试包括图约束、引用、独立状态、扩展类型、授权、原子失败、两个写入者竞争、CLI dry-run 和 LittleLoop 描述链。

## 树形编辑

三种树均支持添加子节点、展开折叠和拖拽。拖到节点中部建立父子关系，拖到上边缘或下边缘调整同级顺序。新增节点和父子关系一次保存，移动及排序也以批量事务保存。后端继续校验无环、单父级和版本冲突。折叠状态保留于当前页面会话。
