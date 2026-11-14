# LittleLoop 构建描述验证

日期：2026-11-14。环境：Windows，Python 3.14。验证目标为奇点模型的工程表达和工具行为，不是 LittleLoop 认知能力。

## 输入与模型

使用 LittleLoop 的 README.md、docs/01-architecture.md、docs/02-memory.md、docs/05-development-roadmap.md。实际项目已建立 `.singularity/model.json` 和 Agent 入口；本仓库 examples/littleloop 保存同内容模型作为回归夹具。

模型包含 **26 个节点、32 条关系、4 个文件引用、3 个树视图**。覆盖研究目标、候选意图、约束、非目标、能力、模块、接口、数据契约、流程、状态机、决策、备选方案、假设、问题、任务、规划产物、验收条件、测试、实验与文档证据。

所有源自文档的意图仍为 candidate；没有确认任何 LittleLoop 意图，没有标记 C# 实现完成，也没有标记认知实验通过。

## 实际查询结果

| 检查 | 结果 |
| --- | --- |
| validate 实际 LittleLoop | 通过，26/32/4/3 |
| check-refs 实际 LittleLoop | 4 个项目文件均存在；章节与版本未检查 |
| context IFACE-EVENT --depth 2 | 20 个节点，包含上游意图、决策、数据契约、消费者、任务和测试 |
| impact IFACE-EVENT --depth 3 | 8 个节点，包含起点及 MOD-MEMORY、MOD-DIAGNOSTICS、TASK-CONTRACT、TASK-REPLAY、TEST-STALE、ARTIFACT-CORE、DATA-EVENT |
| tree VIEW-SYSTEM | 9 行组成树 |
| tree VIEW-GOALS | 3 行目标树 |
| tree VIEW-DELIVERY | 3 行实施树 |
| gaps | 暴露 ASSUME-DETERMINISM 与 QUESTION-EVENT 两项不确定性 |

impact 中 DATA-EVENT 由 contains 组成关系正向传播，是保守重评线索，不代表接口变更必然修改数据契约。每个发现节点带原因边，可检查传播依据。

## 回归验证

`python -m unittest discover -s tests -v`：20 项测试通过。

覆盖树循环与多父级、悬空与重复 ID、自定义类型、三维状态与证据、引用路径与摘要、非法 JSON 值、重复 JSON 字段、受保护节点操作、事务删除、过期 revision、原子替换失败、两个写入者竞争、CLI dry-run/写入、LittleLoop 上下文和影响链、只读 HTTP 预览。

沙箱内 19 项非网络测试通过，本机 HTTP 连接受 Windows 沙箱限制；在获准的沙箱外运行完整测试，20 项通过。HTTP 测试验证模型读取、首页响应、不可信 Host 拒绝和不提供 POST 写入。

## 暴露的下一轮问题

- 2 跳上下文已返回 20/26 个节点，后续需要关系筛选、任务预算与按需展开，减少无关内容。
- 接口输入输出、流程步骤和状态迁移目前只做基础结构校验；需增加领域 schema 与不变量。
- 文件引用存在性不能判断章节内容变化；后续需要符号/章节定位和版本解析。
- 问题与假设的关闭、替代和证据充分性需要更专门的生命周期。
- 当前只读预览能检查模型，完整树编辑与表单尚未实现。

这些结果验证了第一条工程描述链可用，不能证明模型能完整覆盖认知系统，也不能证明 Agent 已能根据它自动构建 LittleLoop。应继续用实际开发任务观察描述与执行之间的缺口。

## 多步目标增量暴露的事务归属问题

2026-11-14，LittleLoop 新增用户确认的目标规划意图，以及 AI 编写的实现和验证证据时，混合批次使用 `--actor Human` 会将实现、证据节点的 actor 也改为 Human，即使 put.value 原本为 AI。本次通过拆分 Human 意图事务和 AI 工程事务修正，并逐项回读；没有将工程选择解释为用户确认。

候选架构改进：区分事务操作主体、节点内容作者与授权依据，或在混合作者批次的 dry-run 中明确报告归属改写并要求拆分。当前仅记录实际建模反馈，尚未修改模型格式或授权规则，也未声称该改进已获用户确认或实现。
