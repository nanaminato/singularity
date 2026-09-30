# Minimal：Todo 意图变更演练

这是一个**虚构的文档项目**，用来演示如何记录和修改意图；没有可运行 Todo 应用，也没有声称测试已经执行。所有 Confirmed 及确认依据仅在教学场景中有效，不能复制到真实项目后继续视为已确认。

入口：[.singularity/README.md](.singularity/README.md)。

## 初始情况

人明确给出六条意图，保存在 [todo.md](.singularity/singularities/todo.md)：Todo 属于 Workspace、多用户、Owner 修改、Observer 只读、重启保留数据、临时断网保留编辑状态。

Agent 可自行选择持久化技术、接口、UI 和测试策略；重要选择记录在 [decisions/todo.md](.singularity/decisions/todo.md)。不要把数据库品牌或类结构升级为奇点。

## 第二轮：变更一个意图

场景中的人明确说：

> Observer 可以创建 Todo，但不能修改或删除已有 Todo。

预期 Agent：

1. 保持 `S-TODO-004` 身份，记录旧意图、修改依据与新陈述。
2. 重评 `D-TODO-001` 的“一刀切拒绝 Observer 写入”前提。
3. 将旧决策标记 Superseded，添加按动作区分权限的新决策。
4. 查找实际项目中的授权入口、UI、测试；不能只放开创建按钮。
5. 验证 Observer 创建成功、改删拒绝，以及 Owner 权限、隔离、持久化、编辑状态的相关回归。

这里已明确给出意图，不应再询问能否确认同一句话。下面只是预期的新记录片段，尚未应用到初始记录：

```markdown
## S-TODO-004

Status: Confirmed

Statement: Observer may create todos, but cannot modify or delete existing todos.

Confirmation basis: Fictional round 2 human instruction quoted in the example README.
Previous statement: Observer may view todos but may not create, modify, or delete them.
Impact: Reevaluate D-TODO-001, authorization, UI affordances, and related tests.
```

创建规则只放宽一个动作，并不自动授权访问其他 Workspace。如果实际项目需要额外的隐私或所有权选择，提出具体 Candidate；不要自行添加设定。

## 验证清单（待真实实现执行）

| 行为 | 初始预期 | 变更后预期 |
| --- | --- | --- |
| Owner 修改 Todo | 允许 | 允许 |
| Observer 读取 | 允许 | 允许 |
| Observer 创建 | 拒绝 | 允许 |
| Observer 修改 / 删除已有项 | 拒绝 | 拒绝 |
| 重启后的已保存数据 | 保留 | 保留 |
| 临时断网时未提交编辑 | 保留 | 保留 |

场景不规定框架或数据结构；这些由 Agent 根据实际项目推导。
