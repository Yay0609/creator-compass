# ARCHITECTURE — 创作罗盘

本文件描述技术方案、信息架构、数据模型与接口约定。**设计变更先改本文件再改代码。**

## 1. 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 14 App Router + TypeScript strict | 读取用 Server Components，写操作用 Route Handler |
| 样式 | Tailwind CSS 3 + 手写最小 UI 组件 | 不跑 shadcn CLI，避免 Tailwind v4 兼容问题 |
| 数据 | Prisma + SQLite（dev）/ Postgres（prod） | 生产用 Neon / Supabase 的连接池地址 |
| 校验 | Zod | 环境变量、请求入参、AI 输出统一校验；表单 schema 与服务端 schema 同源 |
| 认证 | 自建 Session 表 + httpOnly Cookie | bcryptjs 哈希密码；Session 主键为 `HMAC-SHA256(token, SESSION_SECRET)` |
| 表单 | react-hook-form + @hookform/resolvers | 客户端校验复用 `src/lib/auth/schemas.ts` |
| AI | OpenAI 兼容接口 | `OPENAI_BASE_URL` + `/chat/completions` |
| 测试 | Vitest | 单测聚焦纯逻辑（token 派生、密码哈希、Zod schema、响应封装） |
| 部署 | Vercel + Neon/Supabase | 生成类接口 `maxDuration = 60s` |

## 2. 信息架构与路由

```
src/app/
  page.tsx                          /                 公开区落地页
  (auth)/layout.tsx                 已登录则跳 /dashboard
  (auth)/login/page.tsx             /login
  (auth)/register/page.tsx          /register
  (app)/layout.tsx                  requireUser() + AppShell（侧边栏 + 移动底栏）
  (app)/dashboard/page.tsx          /dashboard        概览（无画像时引导去 onboarding）
  (app)/onboarding/page.tsx         /onboarding       账号画像表单
  (app)/settings/page.tsx           /settings         账号 / 画像 / 导出 / 注销
  (app)/(needs-profile)/layout.tsx  requireProfile()：无画像跳 /onboarding
    topics/   /topics、/topics/:id
    scripts/  /scripts、/scripts/:id
    posts/    /posts
    reviews/  /reviews、/reviews/:id
  api/auth/{register,login,logout,me}/route.ts
  api/profiles/route.ts、api/profiles/[id]/route.ts
  api/account/route.ts（注销）、api/account/export/route.ts（导出）
  api/health/route.ts               /api/health
  middleware.ts                     粗粒度未登录重定向（非安全边界）
```

导航：桌面为左侧固定侧边栏；移动为底部 Tab（概览 / 选题 / 脚本 / 数据）。导航配置唯一真源为 `src/components/nav-config.ts`。

路由组 `(needs-profile)` 不影响 URL，只用于集中「必须先完成账号画像」的守卫，新增选题 / 脚本 / 数据 / 复盘子路由时无需重复校验。

## 3. 数据模型

设计取舍：

- **不使用 `enum`**：SQLite 不支持，统一 `String` + TS 常量联合类型 + Zod 白名单校验
- **JSON 字段统一用 `String` 存 JSON 字符串**：避免 SQLite / Postgres 迁移时的类型漂移，读写两端都过 Zod
- 业务模型按阶段新增，禁止提前建表；`AppMeta` 保留为通用键值表

| 模型 | 状态 | 关键字段 |
| --- | --- | --- |
| `AppMeta` | P0 ✅ | key / value / updatedAt |
| `User` | P1 ✅ | email（唯一、小写存储）、passwordHash、nickname、status、lastLoginAt |
| `Session` | P1 ✅ | id = `HMAC-SHA256(token, SESSION_SECRET)`、userId、expiresAt、lastSeenAt、userAgent、ip |
| `CreatorProfile` | P1 ✅ | name、platform、niche、positioning、targetAudience、tone、contentFormats(JSON)、followerCount、weeklyCapacity、goal、isDefault |
| `TopicIdea` | P2 | batchId、title、angle、whyItWorks、referenceDirection、heatScore / fitScore / difficulty、status |
| `ScriptItem` | P3 | topicId、titles、hook、outline、fullScript、tags、coverCopy、cta |
| `PostRecord` | P4 | platform、title、impressions、views、likes、comments、saves、shares、followsGained、completionRate |
| `ReviewReport` | P4 | scope、postIds、highlights、problems、benchmark、nextActions、nextTopics |
| `AiCallLog` | P2 | kind、model、status、latencyMs、tokens |
| `UsageCounter` | P2 | period(YYYY-MM)、kind、used、limit，`@@unique([userId, period, kind])` |

外键一律 `onDelete: Cascade`，注销用户即彻底清理其会话与画像。

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
- 需要登录的端点使用 `withAuthedRoute()`：未登录返回 401，并把 `user` 注入处理器
- 生成类接口（P2 起）：SSE 流式返回，支持 `Idempotency-Key` 幂等，失败回滚配额

已实现（P1）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册并直接登录；重复邮箱 409 |
| POST | `/api/auth/login` | 登录；失败统一文案，不区分账号是否存在 |
| POST | `/api/auth/logout` | 幂等登出，删除会话行并清 Cookie |
| GET | `/api/auth/me` | 当前用户 + 画像 |
| GET/POST | `/api/profiles` | 画像列表 / 创建（已存在则 409） |
| PATCH/DELETE | `/api/profiles/[id]` | 更新 / 删除（条件带 userId，禁止删最后一个） |
| GET | `/api/account/export` | 导出 JSON 附件（不含密码哈希） |
| DELETE | `/api/account` | 注销账号（密码 + 确认文案） |

`/api/health` 分级：本地 / 预览返回 `{ status, db, ai, env, uptimeSec }`；生产只返回 `{ status }`。

## 5. 认证与会话（P1 实现）

三层守卫，职责不同：

| 层 | 位置 | 能力 | 定位 |
| --- | --- | --- | --- |
| 粗粒度重定向 | `src/middleware.ts` | 仅判断 Cookie 是否存在 | 体验优化，**不是安全边界** |
| 页面守卫 | `(app)/layout.tsx`、`(app)/(needs-profile)/layout.tsx` | `requireUser()` / `requireProfile()` | 决定用户看到什么 |
| 接口守卫 | `withAuthedRoute()` / `requireUserForApi()` | 查库校验会话，带 `userId` 查询 | **唯一可信的鉴权点** |

会话机制：

- 明文 token：32 字节随机数（base64url），只写入 httpOnly Cookie，不落库
- 主键派生：`HMAC-SHA256(token, SESSION_SECRET)` 的 hex —— 数据库泄露也无法在没有 `SESSION_SECRET` 时伪造会话
- 有效期：固定 30 天（不滑动续期）；`lastSeenAt` 写库节流 5 分钟；过期会话在读取时或登录时清理
- `SESSION_SECRET` 轮换会使所有会话立即失效
- 账号 `status !== "active"` 时视为未登录

Cookie 规格：名 `cc_session`，`httpOnly`、`secure`（`NODE_ENV === "production"`）、`sameSite: "lax"`、`path: "/"`、`maxAge` 30 天。

P1 不变量：每位用户至多一个账号画像（创建第二个返回 409，删除最后一个返回 400）。

## 6. AI 网关约定（P2 实现）

- 位置：`src/lib/ai/provider.ts` + `src/lib/ai/prompts/{topic,script,review}.ts`
- 调用 OpenAI 兼容 `POST {OPENAI_BASE_URL}/chat/completions`，`response_format: json_object`
- 超时 45s；仅对 429 / 5xx 做指数退避重试；`max_tokens` 硬上限
- **所有 AI 输出必须过 Zod schema**：失败自动重试 1 次，再失败降级为可编辑草稿并标记 `degraded: true`
- Prompt 带 `PROMPT_VERSION`，便于回归与回滚
- 每次调用写 `AiCallLog`；失败不计费并回滚 `UsageCounter`

## 7. 安全基线

- 密钥仅服务端；`src/lib/env.ts`、`src/lib/auth/*` 带 `server-only`；禁止 `NEXT_PUBLIC_*` 泄漏
- 环境变量延迟校验：模块加载不抛错，`getEnv()` 首次调用时校验
- 密码 bcryptjs 哈希（成本 10）；登录失败统一返回「邮箱或密码错误」，且账号不存在时也执行一次哈希比对，避免通过耗时枚举邮箱
- 会话明文不出服务端，落库为 HMAC 摘要；Cookie `httpOnly` + `secure`(prod) + `sameSite: "lax"`
- 所有资源查询带 `userId`，查不到一律 404（不泄露资源是否存在）
- 登录页 `next` 参数只接受站内相对路径，拒绝 `//`、`\`，防止开放重定向
- 配额两层（P2 起）：每日 `AI_DAILY_LIMIT`（防刷）+ 每月 `QUOTA_*`（产品额度）

已知缺口（记入风险清单）：无邮箱验证、无找回密码、无登录频率限制。

## 8. 环境变量

`DATABASE_URL`、`SESSION_SECRET`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`AI_DAILY_LIMIT`、`QUOTA_TOPIC`、`QUOTA_SCRIPT`、`QUOTA_REVIEW`、`APP_BASE_URL`

## 9. 生产迁移注意

- SQLite → Postgres 只需改 `datasource.provider` 与 `DATABASE_URL`；模型层已规避 enum / Json 差异
- Serverless 必须使用连接池地址，并限制连接数
- 上线前在空库跑一次 `prisma migrate deploy`