# Existing Project：只接入 Auth

这是一个**虚构存量项目的文档演练**。假设项目含 Auth、Billing、Frontend 和 Legacy，但本目录没有这些真实源文件。代码路径、符号和确认均为教学场景；真实接入必须用实际证据替换，不能声称已经核查 PAM 或特权逻辑。

入口：[.singularity/README.md](.singularity/README.md)。

## 人只要求接入 Auth

[Auth Region](.singularity/regions/auth.md) 限定初始搜索范围，提供少量入口。它不要求扫描所有 Auth 文件，更不要求导入其他模块。

[auth.md](.singularity/singularities/auth.md) 中的两条 Confirmed 假设是教学场景里人明确给出的登录意图。数据库、类结构与 API 不由这些记录指定。

## 当前任务跨越边界

假设当前任务要研究“管理员登录后执行特权操作”。从 Auth 调用点看到外部 PrivilegeHelper 后：

1. 把调用登记为 Boundary Observation，即 [evidence.md](.singularity/evidence.md) 中的证据。
2. 只看 ExecuteAsUser 的当前调用及限制，按需扩展一跳。
3. 不把整个 Legacy 自动纳入管理。
4. 发现服务账号限制与拟议行为不一致，提出 [Candidate](.singularity/singularities/auth.md) 和 [Conflict](.singularity/conflicts/auth-privilege.md)。
5. 人决定之前，继续独立的登录文档或调查工作；不实现依赖尚未确认权限选择的部分。

候选不是事实真理。人可能选择保留服务账号限制、明确扩大权限、认定旧实现是 Bug，或者推迟任务。已有明确授权时使用它，不能为了形式重复审批。

## 保持的边界

不扫描 Billing、Frontend 或全部 Legacy。不对未查看代码声称不存在约束。即使代码路径在 Region 外，明确意图的实际影响仍需逐跳核查。

预期证据路径是“任务 → 相关奇点 → 登录入口 → 特权调用 → 必要外部限制”，不是“全仓库 → 批量需求导入”。
