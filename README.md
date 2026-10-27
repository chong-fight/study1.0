# 短词记 2.0

面向中国英语学习者的本地优先短语记忆工具。

学习流程：

- 第 0 天：含义回忆、主动产出、语境应用、出口测试。
- 第 1 天：英→中、形式选择、语境应用、中→英四轮验证。
- 长期：按到期日、等级风险和顺延次数进行间隔复习。

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## 数据

题库通过应用内 JSON 导入，不内嵌在源码中。`local-data/` 仅用于本地测试，不参与构建。

本地测试文件：

- `local-data/短词记_固定搭配.enhanced.json`
- `local-data/短词记_动词.enhanced.json`

检查内容完整性：

```bash
npm run audit:data
```

## GitHub Pages

默认按站点根路径构建。部署到项目子路径时：

```powershell
$env:NEXT_PUBLIC_BASE_PATH="/仓库名"
npm run build
```

构建完成后，`out/` 是可直接部署的静态目录。构建脚本会为 Next.js 静态 RSC 预取文件生成 GitHub Pages 兼容别名。

仓库内已包含 `.github/workflows/pages.yml`。在 GitHub 仓库的 Pages 设置中选择 GitHub Actions 后，推送到 `main` 即可自动部署。工作流会自动将仓库名作为子路径。
