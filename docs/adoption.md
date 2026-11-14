# 接入 Singularity 0.4

在项目根目录使用本协议工具执行 `python /path/to/singularity/tools/singularity.py --project . init --name "Project"`。

把 templates/AGENTS.fragment.md 的说明追加到已有 Agent 指令，保留原有规则。创建 `.singularity/README.md`，记录固定协议来源和版本。可复制 templates/project/.singularity 作为空项目模板。

围绕真实任务建立目标、模块、契约、设计决策和验证链；已有文档是证据，不能自动成为 confirmed 意图。使用同一批 apply 操作创建节点、关系、引用和视图，再做全图校验。详见 [CLI](../tools/README.md) 与 [模型规范](../SPEC.md)。

不用一次建模整个仓库。完整表达能力与渐进接入并不矛盾；发现描述缺口时逐步补充。
