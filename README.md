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

## Fish Audio TTS 护栏

JerryRead 仅面向个人阅读。Fish Audio 的免费模型没有固定字符配额，但受 Fair Use Policy 约束；免费层没有 SLA，且请求可能被用于模型改进。因此不应把敏感私人文档发送到 TTS。

- 服务端模型必须且只能是 `s2.1-pro-free`；浏览器不能传入模型名。
- 每个请求都显式发送 `model: s2.1-pro-free`。空值、未知值或服务端配置错误均停止生成，绝不回退到收费模型。
- Free/Starter 全部 API Key 共用 5 个并发；播放器最多 3 个并发（当前段 1 个、后续预生成最多 2 个）。
- 429、5xx 和模型不可用时有限重试或停止并提示；不无限重试、不更换模型。
- Fish API Key 只保存为 Supabase Edge Function Secret，绝不进入浏览器、Git 或 Vercel 前端环境变量。
