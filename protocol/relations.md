# Relations & Impact

Status: Draft · Derived from MS-004, MS-008, MS-010.

关系是可读的引用，不要求数据库或统一复杂 Schema。

| 写法 | 含义 |
| --- | --- |
| Derived from: S-ID | 决策依赖的意图 |
| Anchors: path / Symbol | 必要上下文入口 |
| Evidence: path / test / statement | 推导的事实依据 |
| Related singularities: S-ID | Region 或冲突涉及的意图 |
| Supersedes: D-ID | 替代的旧决策 |
| Replaced by: D-ID | 指向新的决策 |

引用 SHOULD 同时提供 ID 和可用路径链接；ID 是身份，路径方便定位。移动文件后更新路径。缺失、重复或过期引用需要修正或明确标注，不能装作已验证。

## 一个例子

```text
S-WORKSPACE-004 (Observer read-only)
    ↓ Derived from
D-ACCESS-001 (Reject observer writes on server)
    ↓ Anchors
write endpoint, role check
    ↓ Evidence / Verification
observer rejection test, owner write regression test
```

意图改变时可以沿引用反向搜索，但这些引用不是完备图谱。Agent 仍需核查实际调用和行为。无需为了未来可能用到而提前登记所有符号。

## 跨边界记录

“Auth 调用 PrivilegeHelper.ExecuteAsUser”是一条 Boundary Observation，即 Evidence。它不确认“所有管理员都能执行特权操作”，也不自动扩大 Auth Region。先查看当前调用的必要约束，只有出现无法安全推导的选择才提出 Candidate。

## 一次影响报告只需回答

- 上游意图发生了什么变化？
- 哪些决策、入口和行为因此受影响，为什么扩展了边界？
- 哪些架构、实现、测试、文档或环境需要调整？
- 已验证什么，还不知道什么？

可以把报告放进决策文档或提交说明，不强制为每次变更新建文件。
