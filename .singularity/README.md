# 本仓库项目模型

使用 Singularity 0.4 / format 3。权威结构化入口为 [model.json](model.json)，规范为 [SPEC.md](../SPEC.md)。

INTENT-EVOLUTION 记录本次用户明确批准的架构升级方向。旧候选记录退出本轮模型；没有把旧公理批量确认。

查询：`python tools/singularity.py --project . list`。
修改：通过 apply 事务和 expected revision；已确认节点变更需要当前人类授权依据。
