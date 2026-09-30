# Singularity Protocol 0.1.0

Status: Draft

Derived from: [MS-001–MS-010](protocol/meta-singularities.md), currently Candidate.

本规范描述可由现有 Agent 读取的数据语义，不规定具体 Agent、框架或存储引擎。**MUST / MUST NOT** 表示协议要求，**SHOULD** 表示允许有理由地偏离的默认行为，**MAY** 表示可选。确认元奇点之前，本文件是拟议规范。

## 六个概念

| 概念 | 含义 | 权威性 |
| --- | --- | --- |
| Singularity | 无法安全推导、需人控制的意图 | 只有 Confirmed 具有意图权威性 |
| Region | 可选的初始搜索边界与入口 | 不产生额外意图 |
| Derived Decision | 为满足上游意图而选择的实现或流程 | 可由 Agent 重评 |
| Evidence | 代码、测试、历史、文档、用户陈述等可定位事实 | 不是自动确认 |
| Relation | 记录之间、记录与证据之间的联系 | 不自动传递确认状态 |
| Conflict | 意图之间或意图与证据之间的不一致 | 需明确披露 |

Candidate、Boundary Observation 和影响分析是上述概念的状态或记录用途，不是额外的基础概念。

## Singularity

一个奇点 MUST 有三个字段：**稳定 ID、状态、意图陈述**。原因、确认依据、锚点与关系 MAY 按需补充，不强制大 Schema。

```markdown
## S-AUTH-001

Status: Candidate

Statement: Linux authentication uses the operating system PAM stack.

Reason: Avoid maintaining a duplicate operating-system password database.
```

- ID 在同一项目中 MUST 唯一，不随文字修订改变，也 MUST NOT 被回收给无关意图。
- 文件不是身份。一个文件 MAY 保存多个奇点，移动文件不改变 ID。
- 活跃状态为 `Candidate`、`Confirmed`；终态为 `Rejected`、`Retired`。
- 只有人的明确意图可以确认、改变或退役 Confirmed。Agent MUST NOT 从测试通过、代码存在、沉默或过去时间推断批准。
- 人在当前任务中明确给出的约束可以作为确认依据，无需机械地要求再次确认。
- Agent MUST 保存可定位的确认依据，例如日期与准确的用户陈述；不必复制完整聊天或个人信息。
- 已确认记录改变含义时 MUST 保留旧含义的可追溯历史，并记录影响重评。使用 Git 历史即可，不要求额外版本字段。
- 候选 MAY 被合并、改写、拒绝；其 ID 仍应保留处置记录。

现有证据与已确认意图不一致时，MUST 披露。证据可能是 Bug、旧行为或潜在意图，Agent 不能自行把它宣布为新奇点。

## Region 与边界

Region MAY 定义 Includes、Entry points、Related singularities。它只缩小初始搜索空间，MUST NOT 被解释为整目录读取任务。没有 Region 的小项目可以直接从相关奇点和任务入口开始。

未建模区域是预期状态，MUST NOT 被自动解释为没有约束或可以随意修改。跨边界时，只查看当前任务所需的接口、调用点及证据；发现事实可记录为 Evidence / Boundary Observation，需要人的选择才提出 Candidate。发现依赖不等于把整个模块纳入管理。

区域内的意图是否适用于外部代码由陈述本身决定，不能靠路径关系默默扩大或缩小其含义。

## Derived Decision

重要决策 SHOULD 有稳定 ID、上游引用、Decision、Reason。无需记录每个变量名或机械操作。

- 上游 SHOULD 引用奇点 ID；只有候选上游时，必须标明 `Proposed`，不得声称已经获准。
- 决策 MAY 调整，不需要为可安全推导的实现重复索取批准。
- 被替代的决策 SHOULD 标记 `Superseded` 并链接替代者，保留推导历史。
- 意图变更后，Agent MUST 重评受影响决策，不能沿用旧结论而不检查前提。

## Evidence、Relation 与 Conflict

证据 SHOULD 指向文件、符号、测试或可定位陈述，并区分观察事实与推测。过期锚点应刷新，不能视为当前事实。最小关系写法和冲突处理见 [relations](protocol/relations.md) 与 [lifecycle](protocol/lifecycle.md)。

Conflict SHOULD 包含相关 ID / 证据、具体矛盾、受阻部分和待决定问题。Agent MUST 暴露冲突，不得默默选择、删除约束或将实现当作更高权威。只暂停依赖该选择的工作，可继续独立且可逆的工作。

## 意图变更与影响分析

从改变的意图出发：

1. 找到引用它的决策、锚点、测试和区域。
2. 查看直接相关代码和边界接口。
3. 证据不足时扩展一跳，记录扩展理由；足够时停止。
4. 重评架构、实现、测试、文档和环境中的受影响部分。
5. 验证变更后的意图，并验证相关未改变意图仍成立。
6. 记录已验证的范围与未知部分；不能把局部通过称为全仓库证明。

影响分析是一次任务的必要上下文，不要求建立完整项目知识图谱。搜索不到引用也不能证明没有影响，仍须根据实际入口和依赖核查。

## 项目接入与版本

项目 SHOULD 保存短的 `AGENTS.md` 指令入口、`.singularity/README.md`、`config.md` 和必要的意图记录。空目录、Region、决策和冲突文档都可以按需创建。项目 MUST 明确使用的协议版本和可定位来源。

协议语义和项目意图 MUST 分开维护。目标项目不必复制完整 SPEC；离线需要时 MAY 缓存固定版本副本，并标明来源与版本。无法读取协议时只能依短入口执行明确可安全完成的工作，不得编造缺失规则。

不同协议版本、项目指令或已确认意图有冲突时，Agent MUST 披露并依据当前会话已有的人类授权处理；本协议不替代运行环境的系统规则或安全约束。

## 0.1 的限制

Markdown 不提供自动解析、权限强制、语义冲突检测或影响范围完整性保证。关系由 Agent 和人按需维护。实现协议不等于证明理论有效，实验方法见 [docs/experiments.md](docs/experiments.md)。
