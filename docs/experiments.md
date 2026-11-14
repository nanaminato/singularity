# 实验与验证

核心回归运行 `python -m unittest discover -s tests -v`。测试范围是模型一致性、权限标记、事务安全和图查询，不是认知系统能力。

LittleLoop 的描述验证见 [报告](littleloop-validation.md)。后续真实开发应观察：Agent 是否能定位正确上下文、是否混淆确认与实现、契约变化是否发现必要消费者、结构化描述是否减少反复解释。记录失败案例与人工修正成本，不能仅用节点数量衡量效果。
