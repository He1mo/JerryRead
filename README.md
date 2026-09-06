# JerryRead

JerryRead 是一个以高质量 AI 语音为核心、支持跨设备续读的个人 Web 阅读器。

## 本地开发

要求 Node.js 20.19 或更高版本。

```powershell
npm install
npm run dev
```

## 质量检查

```powershell
npm run lint
npm run test
npm run build
```

## 部署

生产环境由 Vercel 连接 GitHub `main` 分支自动部署。Vercel 使用默认 Vite 配置即可：

- Build Command：`npm run build`
- Output Directory：`dist`

产品需求见 [`doc/JerryreadPRD.md`](doc/JerryreadPRD.md)。
