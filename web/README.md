# Angular 编辑器

当前正式前端，替代 `tools/editor` 的原生 JavaScript 页面。Angular 22.2.6、Angular CLI / build 22.2.7（2026-11-14 npm latest），使用 standalone 组件、signals、Angular Forms 和 HttpClient；Canvas 负责绘制节点图。精确依赖由 package-lock.json 锁定。

## 启动

Node.js `^22.22.3 || ^24.15.0 || >=26.0.0`，Python 3.11+。

```powershell
cd web
npm ci
npm run build
cd ..
python tools/singularity.py --project . serve --open
```

构建后也可双击根目录 `open-editor.pyw` 选择项目。Python 从本仓库 `web/dist/editor/browser` 提供页面，与所选项目的位置无关；不需要运行 Node 服务。未构建时页面返回 503 和构建提示，API 仍可使用。

开发时先启动 Python API（默认 8765），再在 `web` 执行 `npm start`。访问终端提示的 Angular 地址；`/api` 经开发代理转发，代理重写 Host 以通过本机校验。

## 验证与打包

```powershell
npm test
npm run build
npm run test:e2e
cd ..
python -m unittest discover -s tests -v
```

浏览器测试使用已安装的 Microsoft Edge，可通过 `PLAYWRIGHT_CHANNEL` 选择其他已安装通道，在临时 LittleLoop 项目上运行，不改实际模型。Windows 打包前必须构建前端；`tools/windows.spec` 收集 Angular 产物。

## 结构

- `src/app/app.component.*`：工作台、树交互、编辑与查询流程。
- `src/app/field.component.ts`、`fields.ts`：声明式动态字段及类型转换。
- `src/app/canvas.component.ts`：Canvas 绘制与生命周期、缩放和平移。
- `src/app/editor-api.service.ts`：revision 与编辑 token 随 API 请求提交。
- `src/app/model.ts`：协议类型、树投影及事务生成。

本次仅迁移前端和静态资源交付，不改变 format 3、API 事务语义或已有项目数据。旧原生页面退出运行入口；项目模型无需迁移或重置。
