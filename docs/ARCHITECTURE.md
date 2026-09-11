# ARCHITECTURE — 创作罗盘

本文件描述技术方案、信息架构、数据模型与接口约定。**设计变更先改本文件再改代码。**

## 1. 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 14 App Router + TypeScript strict | 读取用 Server Components，生成类操作用 Route Handler |
| 样式 | Tailwind CSS 3 + 手写最小 UI 组件 | 不跑 shadcn CLI，避免 Tailwind v4 兼容问题 |
| 数据 | Prisma + SQLite（dev）/ Postgres（prod） | 生产用 Neon / Supabase 的连接池地址 |
| 校验 | Zod | 环境变量、请求入参、AI 输出统一校验 |
| 认证 | 自建 Session 表 + httpOnly Cookie | bcrypt 哈希密码；Session 存 sha256(token) |
| AI | OpenAI 兼容接口 | `OPENAI_BASE_URL` + `/chat/completions` |
| 测试 | Vitest | 单测聚焦纯逻辑 |
| 部署 | Vercel + Neon/Supabase | 生成类接口 `maxDuration = 60s` |

## 2. 信息架构与路由

```
src/app/
  page.tsx                     /                公开区落地页
  (auth)/login/page.tsx        /login
  (auth)/register/page.tsx     /register
  (app)/layout.tsx             AppShell（侧边栏 + 移动底栏）
  (app)/dashboard/page.tsx     /dashboard       概览
  (app)/onboarding/page.tsx    /onboarding      账号画像引导
  (app)/topics/page.tsx        /topics          选题生成 + 历史
  (app)/topics/[id]/page.tsx   /topics/:id      选题详情
  (app)/scripts/page.tsx       /scripts         脚本列表
  (app)/scripts/[id]/page.tsx  /scripts/:id     脚本详情
  (app)/posts/page.tsx         /posts           数据录入 + 作品列表
  (app)/reviews/page.tsx       /reviews         复盘列表
  (app)/reviews/[id]/page.tsx  /reviews/:id     复盘详情
  (app)/settings/page.tsx      /settings        账号 / 画像 / 用量
  api/health/route.ts          /api/health      健康检查
```

导航：桌面为左侧固定侧边栏；移动为底部 Tab（概览 / 选题 / 脚本 / 数据）。导航配置唯一真源为 `src/components/nav-config.ts`。

## 3. 数据模型

设计取舍：

- **不使用 `enum`**：SQLite 不支持，统一 `String` + TS 常量联合类型
- **JSON 字段统一用 `String` 存 JSON 字符串**：避免 SQLite / Postgres 迁移时的类型漂移，读写两端都过 Zod
- P0 只保留 `AppMeta`（验证 Prisma ↔ SQLite 通路 + 健康检查探活），业务模型按阶段新增

业务模型（P1 起逐步加入）：

| 模型 | 关键字段 | 阶段 |
| --- | --- | --- |
| `User` | email、passwordHash、status | P1 |
| `Session` | id=sha256(token)、expiresAt、userAgent | P1 |
| `CreatorProfile` | platform、niche、positioning、targetAudience、tone、contentFormats | P1 |
| `TopicIdea` | batchId、title、angle、whyItWorks、referenceDirection、heatScore / fitScore / difficulty、status | P2 |
| `ScriptItem` | topicId、titles、hook、outline、fullScript、tags、coverCopy、cta | P3 |
| `PostRecord` | platform、title、impressions、views、likes、comments、saves、shares、followsGained、completionRate | P4 |
| `ReviewReport` | scope、postIds、highlights、problems、benchmark、nextActions、nextTopics | P4 |
| `AiCallLog` | kind、model、status、latencyMs、tokens | P2 |
| `UsageCounter` | period(YYYY-MM)、kind、used、limit，`@@unique([userId, period, kind])` | P2 |

派生指标（不落库，查询时计算）：互动率 `(likes+comments+saves+shares)/views`、收藏率 `saves/views`、涨粉效率 `followsGained/views`。

## 4. API 约定

统一响应体：

```ts
{ ok: true,  data: T }
{ ok: false, error: { code: ErrorCode; message: string; details?: unknown } }
```

- 所有 API 响应默认 `Cache-Control: no-store`
- 错误码集中在 `src/lib/api/error-codes.ts`，与 HTTP 状态一一映射
- 路由处理器统一用 `withRoute()` 包装（错误归一化 + 日志 + 兜底）
- 生成类接口：SSE 流式返回，支持 `Idempotency-Key` 幂等，失败回滚配额
- 计划中的端点（P1–P4）：`/api/auth/*`、`/api/profiles/*`、`/api/topics/*`、`/api/scripts/*`、`/api/posts/*`、`/api/reviews/*`、`/api/usage`

`/api/health` 分级：本地 / 预览返回 `{ status, db, ai, env, uptimeSec }`；生产只返回 `{ status }`。

## 5. AI 网关约定（P2 实现）

- 位置：`src/lib/ai/provider.ts` + `src/lib/ai/prompts/{topic,script,review}.ts`
- 调用 OpenAI 兼容 `POST {OPENAI_BASE_URL}/chat/completions`，`response_format: json_object`
- 超时 45s；仅对 429 / 5xx 做指数退避重试；`max_tokens` 硬上限
- **所有 AI 输出必须过 Zod schema**：失败自动重试 1 次，再失败降级为可编辑草稿并标记 `degraded: true`
- Prompt 带 `PROMPT_VERSION`，便于回归与回滚
- 每次调用写 `AiCallLog`；失败不计费并回滚 `UsageCounter`

## 6. 安全基线

- 密钥仅服务端；`src/lib/env.ts` 带 `server-only`；禁止 `NEXT_PUBLIC_*` 泄漏
- 环境变量延迟校验：模块加载不抛错，`getEnv()` 首次调用时校验
- 密码 bcrypt；Session 明文不出服务端，落库为 sha256；Cookie `httpOnly` + `secure`(prod) + `sameSite: "lax"`
- 所有资源查询带 `userId`，防止越权
- 配额两层：每日 `AI_DAILY_LIMIT`（防刷）+ 每月 `QUOTA_*`（产品额度）

## 7. 环境变量

`DATABASE_URL`、`SESSION_SECRET`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`AI_DAILY_LIMIT`、`QUOTA_TOPIC`、`QUOTA_SCRIPT`、`QUOTA_REVIEW`、`APP_BASE_URL`

## 8. 生产迁移注意

- SQLite → Postgres 只需改 `datasource.provider` 与 `DATABASE_URL`；模型层已规避 enum / Json 差异
- Serverless 必须使用连接池地址，并限制连接数
- 上线前在空库跑一次 `prisma migrate deploy`