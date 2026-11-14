# Singularity Project Model 0.4

Status: Implemented core, evolving specification. Storage format: 3.

本规范是项目构建描述模型。人类关键意图称为奇点；其他节点承载可推导、可验证、可重评的工程内容。结构化模型不能自动证明实现正确，也不能代替人类授权。

## 1. 项目快照

项目根目录的 `.singularity/model.json` 为单个 UTF-8 JSON 对象：

```json
{"format":3,"project":{"id":"PROJECT-EXAMPLE","name":"Example"},"types":{},"nodes":[],"relations":[],"references":[],"views":[]}
```

`format` 必须为整数 3。所有字段必需，未知字段拒绝。项目、节点、关系、引用、视图 ID 在快照内全局唯一，格式为大写字母开头的字母数字分段，以连字符连接。ID 是身份，名称与文件路径不是身份。未来格式变更必须提供明确迁移规则，不能静默解释未知版本。

快照是当前一致性和事务边界。数组顺序有意义：同一树下子节点按关系数组顺序展示，根按视图 roots 顺序展示。Git 可记录后续文件差异，本轮不实现旧记录历史查询。

## 2. Node

必需字段：`id, type, title, body, actor, authorization, delivery, verification, attributes`。

- title、body 是非空字符串；body 可写 Markdown，核心按文本保存，不执行内容。
- actor 是最后操作者角色 Human/AI，不是身份认证或授权凭证。
- references 是可选的 Reference ID 数组；悬空引用拒绝。
- authorization_basis 是确认、拒绝或退役的明确依据文本。
- verification_basis 是 passed/failed 所需的非空 evidence 节点 ID 数组。
- attributes 由节点类型定义，未知属性拒绝。

### 状态独立

| 维度 | 值 |
| --- | --- |
| authorization | candidate / confirmed / rejected / retired / not_applicable |
| delivery | planned / in_progress / implemented / abandoned / not_applicable |
| verification | unverified / passed / failed / stale / not_applicable |

intent、constraint、non_goal 不得用 not_applicable 授权状态。确认不意味着已实现；实现不意味着验证通过。passed/failed 只表示作者根据关联证据作出的声明，核心验证证据链接存在，不审核实验真实性。支持把过期结论标记为 stale；本轮影响分析输出重评线索，不自动改写下游状态。

AI 新建节点默认应使用 candidate 或 not_applicable，不得从文档或代码自动确认意图。服务对新确认、拒绝、退役，以及修改/删除已有 confirmed、retired 节点要求 Human 和非空 basis。一般工程节点可由 AI 更新。Human 角色标记由可信调用者根据实际会话授权填写；本地文件不是权限隔离系统。

### 内置类型与必需属性

| 类型 | attributes 必需字段 |
| --- | --- |
| goal, intent, constraint, non_goal | 无 |
| capability, scenario, requirement | 无 |
| acceptance | criterion: string |
| system, module, region | 无 |
| interface | inputs: array, outputs: array |
| data_contract | fields: object |
| workflow | steps: array |
| state_machine | states: array, transitions: array |
| decision | rationale: string |
| alternative, assumption, question | 无 |
| task, artifact, test | 无 |
| experiment | baseline: string, metrics: array |
| evidence | observation: string |
| conflict | issue: string |

类型特有字段的第一版校验覆盖必需字段和 JSON 类型，不是任意语言的接口编译器，也不解释流程执行语义。实现提案和规划产物应在 body 明确说明尚未创建。

### 自定义类型

`types` 中可声明 `x_` 前缀的类型，不允许覆盖内置类型。例如：

```json
{"x_budget":{"description":"资源预算","required":{"cpu":"number"},"optional":{"units":"string"}}}
```

字段类型支持 string、number、boolean、array、object。required 与 optional 不重叠；不支持任意代码、动态导入和自定义执行脚本。更新 schema 和受影响节点应放在同一事务；不满足新 schema 的快照不能保存。更深层 schema、继承和可扩展关系类型为后续版本能力。

## 3. Relation

必需字段：`id, type, source, target`，可选 `rationale`。端点必须为已有节点，不允许自连或重复的 type/source/target 三元组。

| 类型 | source → target 的语义 | 变更影响遍历 |
| --- | --- | --- |
| contains | 整体 → 部件 | 正向 |
| decomposes | 目标 → 子目标/能力 | 正向 |
| plans | 交付组织 → 工作项 | 正向 |
| depends_on | 使用者 → 依赖对象 | 反向 |
| derived_from | 推导结果 → 上游依据 | 反向 |
| constrains | 约束 → 被约束对象 | 正向 |
| implements | 实现/任务 → 设计或需求 | 反向 |
| verifies | 测试/实验/验收 → 验证对象 | 反向 |
| supports | 证据 → 支持对象 | 正向 |
| conflicts_with | 冲突双方 | 双向 |
| supersedes | 新方案 → 旧方案 | 不传播 |
| references | 一般语义关联 | 不传播 |

verifies 的起点限定 test/experiment/acceptance，supports 的起点限定 evidence。其他关系先执行结构约束，领域适用性由作者审阅。引用关系不会传递确认状态，也不会自动把关联材料提升为意图。

context 按关系双向取有限跳数；impact 按上表沿依赖方向取有限跳数并给出原因边。它们不检查代码实际调用，也不保证覆盖整个项目。文件变化检测、Git 基线差分和自动过期传播尚未实现。

## 4. Reference

必需字段：`id, kind, target, purpose, tracking`。可选 `locator, revision, digest`。

- project_file：项目内相对路径，用 `/`，不得绝对路径或包含 `..`。
- external_file：绝对路径；跨机器不可移植，优先考虑项目文件或 URL。
- url：HTTP(S) URL。
- purpose：引用用途，例如设计依据、实现入口、验证证据。
- locator：章节、符号等定位描述，当前保存但不解析。
- tracking=live：跟随当前材料；pinned：必须提供 revision 或 digest。
- digest：SHA-256 文件摘要。revision：外部材料版本或 Git 提交标识。

check-refs 默认只检查项目文件存在性，有 digest 时比较摘要；`--external` 才检查外部文件。检查不联网、不打开网页、不执行文件、不解析符号、不验证 revision。输出明确标记 locator_checked/revision_checked=false。存在的文件不等于固定版本已验证；模型内 target 的 project_file 解析结果越出项目时标记 outside_project。

## 5. View 与树

必需字段：`id, title, kind, roots`。kind 为 composition/objectives/delivery，分别投影 contains/decomposes/plans 关系。roots 为已有节点 ID 非空数组。

每种树关系单独保证无环、单父级；三种关系可以让相同节点参与不同组织方式。其他关系构成跨树图，依赖环不被自动视为非法。分组和移动不改变节点身份、确认状态或陈述含义。树不是额外复制的一份内容。

## 6. 事务与存储

apply 接受完整对象 put 和显式 delete 的操作数组，可同时增删节点、关系、引用、视图和类型。先在内存应用全部操作，再校验完整快照；删除有悬空关系的节点必须同步处理关系，不做隐式级联删除。dry-run 返回候选快照，不写入。

每次读取返回当前文件字节 SHA-256 revision；写入必须携带 expected。写入时独占创建 model.lock，重新核对 revision，将完整文件写到同目录临时文件、flush/fsync 后 os.replace。失败保留旧快照并清理临时文件。锁只协调遵守协议的写入者，直接修改文件的软件不受锁约束。残留锁需确认写入进程已退出再清理；不自动抢锁。

## 7. 演进边界

每次模型变化由真实项目表达困难驱动；先建立失败样例，再调整模型/工具和相应测试。新格式要明确兼容策略及迁移验收。未建模内容正常存在；不能把图上没有连线当作没有实际依赖。模型可以丰富，人工确认仍集中于关键意图。
