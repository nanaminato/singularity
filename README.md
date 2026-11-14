# Singularity Protocol 0.4

奇点是关键人类意图；项目模型描述从意图到系统设计、实现和验证的完整链路。当前实现为 Python 标准库核心、JSON 事务 CLI 和本地编辑工作台。

本轮是破坏性架构升级：format 3，不兼容 format 1/2 TOML，不迁移旧记录和历史。Git 仓库历史不重写。详见 [迁移方案](docs/migration.md)。

## 入口

- [模型规范](SPEC.md)：节点、关系、引用、树视图、状态与权限。
- [核心架构](docs/architecture.md)：模型、存储、服务、查询与入口分层。
- [CLI 使用](tools/README.md)：初始化、事务预览、更新、上下文与影响分析。
- [LittleLoop 验证](docs/littleloop-validation.md)：真实项目描述链与验证边界。
- [后续演进](docs/roadmap.md)：编辑器、语义校验、引用监测与 Agent 集成。

```powershell
python tools/singularity.py --project . validate
python tools/singularity.py --project ../littleloop context IFACE-EVENT --depth 2
python tools/singularity.py --project ../littleloop impact IFACE-EVENT --depth 3
python -m unittest discover -s tests -v
```

每个项目使用 `.singularity/model.json` 保存类型定义、节点、关系、引用和视图。模型描述如何构建项目，不承担被描述系统的运行时数据存储。

网页前端位于 `web`，使用 Angular 22.2.6。首次运行先执行 `cd web`、`npm ci`、`npm run build`，再返回根目录双击 `open-editor.pyw` 选择项目，打开本地工作台。支持三种树视图、类型字段、关系与文件引用编辑，以及上下文筛选。CLI 与网页共用事务及校验规则。开发和打包详见 [前端说明](web/README.md)。
