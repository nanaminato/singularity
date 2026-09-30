# Singularity Protocol · 奇点协议

让人维护少量不可安全推导的意图，让现有 Coding Agent 推导和维护实现。

**0.1.0 · Draft**。这一版是一套 Markdown 协议与项目导入模板，可以由 Codex、Claude Code 或其他能读取项目指令的 Agent 使用。它尚未验证长期效果；没有 CLI、数据库、Graph Engine 或自研 Agent。

## 核心思想

- **奇点**：Agent 无法安全推导、需要人长期控制的意图。
- **推导决策**：为满足奇点选择的实现，可以随证据改变。
- **现有代码**：证据，不能自动升级为人的意图。
- **局部接入**：只围绕当前任务理解必要代码，未建模区域是正常状态。

目标是覆盖必要的人类意图，而不是把全部代码转换为文档。

## 从哪里开始

| 目的 | 入口 |
| --- | --- |
| 在现有项目使用 | [导入指南](docs/adoption.md) |
| 了解协议数据语义 | [SPEC.md](SPEC.md) |
| 查看十条元奇点 | [Meta Singularities](protocol/meta-singularities.md) |
| 了解确认与变更 | [生命周期](protocol/lifecycle.md) |
| 了解追溯和影响范围 | [关系](protocol/relations.md) |
| 新项目示例 | [Minimal](examples/minimal/README.md) |
| 大型存量项目示例 | [Existing Project](examples/existing-project/README.md) |
| 用实际开发验证理论 | [实验指南](docs/experiments.md) |
| 未来扩展 | [路线图](docs/roadmap.md) |

## 五分钟导入

1. 将 [templates/project/.singularity](templates/project/.singularity/README.md) 目录复制到目标项目根目录。
2. 把 [Agent 指令片段](templates/AGENTS.fragment.md) **追加**到现有 `AGENTS.md`，保留原有规则；没有该文件时才创建。
3. 编辑 `.singularity/config.md`，记录协议版本、协议来源、目标项目的接入范围。
4. 给 Agent 一个具体任务，例如“将登录模块纳入奇点管理；先从登录入口查看必要证据，列出不能安全推导的候选意图”。
5. 审阅少量 Candidate，明确确认需要长期保留的意图。实现方式由 Agent 推导。

无需提前扫描全仓库。Region 可选，一个文档可以容纳多个稳定 ID。

## 本仓库如何使用自己的协议

[AGENTS.md](AGENTS.md) 约束本仓库的工作方式，[.singularity](.singularity/README.md) 记录本仓库的接入与推导决策。

对话提出的十条元奇点目前登记为 **Candidate**。建立仓库的请求并不等同于逐条确认公理。SPEC、模板和工作流程均是基于候选公理形成的可审阅草案；后续可以由人明确确认或修订公理，再重评下游文档。示例中的 Confirmed 是虚构场景设定，不代表实际项目的人工批准。

## 仓库结构

```text
AGENTS.md                    简短的 Agent 工作规则
SPEC.md                      六个概念和数据语义
protocol/                    元奇点、生命周期、关系
templates/                   记录模板和可复制的项目导入包
examples/minimal/            少量奇点管理一个 Todo 项目
examples/existing-project/   从存量项目的 Auth 区域开始
docs/                        导入、实验、来源与路线图
.singularity/                协议仓库自身的记录
```

## 版本与升级

项目固定使用 `0.1.0`，来源指向 `v0.1.0` Git 标签。升级时由人明确选择版本，Agent 比较协议变化、重评受影响记录。不要通过跟随 `main` 隐式更换协议。完整规范留在协议仓库，目标项目只维护短入口和自己的意图记录。

来源是用户提供的 [讨论对话](https://chatgpt.com/share/6abcc255-60d0-83e9-8752-e24bc93d1f52)，取其中最后一轮“Protocol 先行、可增量导入”的方案；[来源与取舍](docs/origin.md) 说明具体边界。
