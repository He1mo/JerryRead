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

## 当前能力

- TXT 与 EPUB 上传；超过 50MB 的书籍自动拆成 8MB 私有分片。
- 正文和生成过的 MP3 缓存在 IndexedDB，重复朗读不再次调用 Fish。
- 当前段优先生成，并预生成后续 2 段；全局最多 3 个 TTS 并发，429/5xx 最多有限重试。
- 阅读与听书共用 `bookId + chapterIndex + paragraphIndex + textOffset` 进度，本地即时保存并同步 Supabase。
- 支持段落高亮、自动滚动、上一段/下一段、0.75～2 倍速、锁屏媒体控制和 30/60/90 分钟睡眠定时。
- 支持安装为 PWA；应用壳可离线打开，书籍正文依赖该设备已有的 IndexedDB 缓存。
