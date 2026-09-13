# ARCHITECTURE — 创作罗盘

本文件描述技术方案、信息架构、数据模型与接口约定。**设计变更先改本文件再改代码。**

## 1. 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 14 App Router + TypeScript strict | 读取用 Server Components，写操作用 Route Handler |
| 样式 | Tailwind CSS 3 + 手写最小 UI 组件 | 不跑 shadcn CLI，避免 Tailwind v4 兼容问题 |
| 数据 | Prisma + SQLite（dev）/ Postgres（prod） | 生产用 Neon / Supabase 的连接池地址 |
| 校验 | Zod | 环境变量、请求入参、AI 输出、SSE 事件统一校验；前后端共享同一份 schema |
| 认证 | 自建 Session 表 + httpOnly Cookie | bcryptjs 哈希密码；Session 主键为 `HMAC-SHA256(token, SESSION_SECRET)` |
| 表单 | react-hook-form + @hookform/resolvers | 客户端校验复用 `src/lib/auth/schemas.ts` |
| AI | OpenAI 兼容接口 | `OPENAI_BASE_URL` + `/chat/completions`；统一走 `src/lib/ai/provider.ts` |
| 流式 | 原生 `ReadableStream` + 手写 SSE 解析 | 不用 `EventSource`（只支持 GET、无法带 POST body） |
| 测试 | Vitest | 单测聚焦纯逻辑（token 派生、密码哈希、Zod schema、响应封装、AI 网关重试、配额周期） |
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
  (app)/settings/page.tsx           /settings         账号 / 画像 / 用量 / 导出 / 注销
  (app)/(needs-profile)/layout.tsx  requireProfile()：无画像跳 /onboarding
    topics/page.tsx                 /topics           生成器 + 用量条 + 历史列表
    topics/[id]/page.tsx            /topics/:id       详情 + 生成信息（含画像快照）
    scripts/page.tsx                /scripts          历史脚本列表 + 用量条
    scripts/new/page.tsx            /scripts/new      生成页（?topicId=xxx 进入即自动生成）
    scripts/[id]/page.tsx           /scripts/:id      查看 / 编辑 / 复制 + 生成信息
    posts/page.tsx                  /posts            录入 / CSV 导入 / 作品列表 / 勾选生成复盘
    reviews/page.tsx                /reviews          复盘生成入口 + 历史报告列表
    reviews/[id]/page.tsx           /reviews/:id      报告详情（图表 + 诊断 + 建议 + 编辑）
  api/auth/{register,login,logout,me}/route.ts
  api/profiles/route.ts、api/profiles/[id]/route.ts
  api/topics/generate/route.ts      POST  SSE 流式生成
  api/topics/route.ts               GET 历史（游标分页）/ POST 人工保存
  api/topics/[id]/route.ts          GET / PATCH（收藏、忽略）
  api/scripts/generate/route.ts     POST  SSE 流式生成脚本
  api/scripts/route.ts              GET 历史（游标分页，可按 topicId 过滤）/ POST 人工保存
  api/scripts/[id]/route.ts         GET / PATCH（编辑、收藏、忽略）
  api/posts/route.ts                GET 作品列表 / POST 单条录入
  api/posts/[id]/route.ts          GET / PATCH（修正）/ DELETE（删除）
  api/posts/import/route.ts         POST CSV 预览（不写库）
  api/posts/import/commit/route.ts  POST 批量落库（整体事务）
  api/reviews/generate/route.ts     POST SSE 流式生成复盘
  api/reviews/route.ts              GET 历史（游标分页）/ POST 人工保存
  api/reviews/[id]/route.ts         GET / PATCH（编辑、收藏、忽略）
  api/usage/route.ts                GET 当前用量
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
| `CreatorProfile` | P1 ✅ | name、platform、niche、subNiche、positioning、targetAudience、tone、contentFormats(JSON)、followerCount、weeklyCapacity、goal、isDefault |
| `TopicIdea` | P2 ✅ | batchId、title、angle、reason、referenceDirection、keywords(JSON)、score、difficulty(low/medium/high)、source(ai/edited)、model、profileSnapshot(JSON, 只读)、isFavorite、isDiscarded |
| `UsageCounter` | P2 ✅ | period（月 `YYYY-MM` / 日 `YYYY-MM-DD`，Asia/Shanghai）、kind(topic/script/review/ai_daily)、used；`@@unique([userId, period, kind])` |
| `AiCallLog` | P2 ✅ | kind、model、status(ok/error/timeout/invalid_json/rate_limited)、attempt、httpStatus、latencyMs、promptChars、outputChars、totalTokens、errorCode、requestId |
| `Script` | P3 ✅ | batchId、topicId?、profileId?、titles(JSON)、hook、outline(JSON: [{section,seconds,content,visual}])、tags(JSON)、coverCopy、cta?、platform?、durationSec?、source(ai/edited)、model?、topicSnapshot(JSON, 只读)、profileSnapshot(JSON, 只读)、isFavorite、isDiscarded、editedAt?；**不落库 fullScript**，完整口播稿与总时长由 DTO 层从 outline 派生 |
| `PostRecord` | P4 ✅ | userId、profileId?、scriptId?、platform、title、publishedAt、impressions、views、likes、comments、saves、shares、followsGained、completionRate(0–1)、note?、source(manual/csv)；索引 `[userId, publishedAt]` / `[userId, createdAt]` |
| `ReviewReport` | P4 ✅ | batchId、scope(single/batch)、postIds(JSON)、postSnapshot(JSON 只读)、baselineSnapshot(JSON 只读)、sampleSize、periodStart?、periodEnd?、summary、diagnostics(JSON)、highlights/problems/suggestions/nextTopics(JSON)、baselineNote、promptVersion?、model?、source(ai/edited)、isFavorite、isDiscarded、editedAt?；索引 `[userId, createdAt]` / `[userId, batchId]` |

外键与删除策略：`Session` / `CreatorProfile` / `TopicIdea` / `Script` / `PostRecord` / `ReviewReport` / `UsageCounter` / `AiCallLog` 对 `User` 一律 `onDelete: Cascade`（注销即彻底删除）；`TopicIdea.profileId` / `Script.topicId` / `Script.profileId` / `PostRecord.profileId` / `PostRecord.scriptId` / `ReviewReport.profileId` 用 `onDelete: SetNull`（画像 / 选题 / 脚本被删不连带删数据）。验收脚本已确认注销后各表残留为 0。

`ReviewReport` **不建指向 `PostRecord` 的外键**：报告只引用生成时的 `postIds` 与只读快照，用户删除或修改作品后历史报告依然完整可读。

`UsageCounter` 只存 `used`，**限额永远以环境变量为准**，避免调整 `QUOTA_*` 后出现脏快照。

`TopicIdea.profileSnapshot` 是生成时的画像快照（只读），用于 P3 生成脚本时锁定上下文，避免画像被修改后结果漂移。

派生指标（**不落库**，DTO 层用 `computePostMetrics` 计算，保留 4 位小数，分母缺失或为 0 时返回 `null`）：`likeRate`、`commentRate`、`saveRate`、`shareRate`、`interactionRate` = `(likes+comments+saves+shares)/views`、`followRate` = `followsGained/views`、`playRate` = `views/impressions`。

基线（`computeBaseline`）：对「账号全部历史作品」逐指标算均值 / 中位数 / 区间，**必须排除本次纳入的作品**，并在报告里标注样本数。

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
- 所有用户资源查询条件必须带 `userId`，查不到一律 404（不泄露资源是否存在）

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

已实现（P2）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/topics/generate` | 生成 5 条选题，**SSE 流式**；开流前预占配额 |
| GET | `/api/topics` | 历史列表，游标分页（`createdAt + id`，倒序），支持 `favorite=1`、`includeDiscarded=1` |
| POST | `/api/topics` | 人工保存选题（草稿落库 / 手动新增），不调用 AI、不消耗配额 |
| GET | `/api/topics/[id]` | 详情（条件带 userId） |
| PATCH | `/api/topics/[id]` | 更新 `isFavorite` / `isDiscarded`（P2 不做硬删除） |
| GET | `/api/usage` | 当前月额度 + 日额度用量 |

已实现（P3）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/scripts/generate` | 生成脚本，**SSE 流式**；`topicId` 与 `title` 至少一个；开流前预占配额 |
| GET | `/api/scripts` | 历史列表，游标分页（`createdAt + id`，倒序），支持 `topicId`、`favorite=1`、`includeDiscarded=1` |
| POST | `/api/scripts` | 人工保存脚本（草稿落库 / 手动新增），不调用 AI、不消耗配额 |
| GET | `/api/scripts/[id]` | 详情（条件带 userId） |
| PATCH | `/api/scripts/[id]` | 编辑内容 / 收藏 / 忽略；改内容会把 `source` 置为 `edited` 并写 `editedAt` |

### 4.1 SSE 事件协议（`/api/topics/generate`）

请求体（Zod strict）：

```ts
{ profileId?: string; extraNote?: string(≤200); excludeTitles?: string[](≤10) }
```

- **开流前**的错误走普通 JSON：401 `UNAUTHORIZED`、422 `VALIDATION_FAILED`、429 `QUOTA_EXCEEDED`（月）/ `RATE_LIMITED`（日）。此时不建立 SSE 连接。
- **开流后**（HTTP 恒为 200）事件顺序：

| 事件 | 负载 | 说明 |
| --- | --- | --- |
| `meta` | `{ batchId, model, count:5, usage }` | 首个事件，携带本次批次号与用量快照 |
| `progress` | `{ phase: calling\|parsing\|validating\|repairing, chars, attempt }` | **只报进度字符数，不透传模型原文** |
| `topic` | `{ index, topic: TopicDto }` | 逐条推送，共 5 条；`topic.id` 为落库主键 |
| `done` | `{ batchId, created:5, latencyMs, usage }` | 成功结束 |
| `error` | `{ code, message, details? }` | 失败结束；`AI_INVALID_OUTPUT` 时 `details.draft` 为 5 条可编辑草稿 |

- 响应头固定 `Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-store`、`X-Accel-Buffering: no`、`Connection: keep-alive`；每 15s 发 `: ping` 心跳。
- 客户端断开（`request.signal` 触发）会中止上游请求、回滚配额，并停止写 `AiCallLog`。

`/api/health` 分级：本地 / 预览返回 `{ status, db, ai, env, uptimeSec }`；生产只返回 `{ status }`。

### 4.2 SSE 事件协议（`/api/scripts/generate`）

请求体（Zod strict）：

```ts
{ topicId?: string; title?: string(≤60); extraNote?: string(≤200); durationSec?: number(15–600) }
```

- `topicId` 与 `title` 至少提供一个；带 `topicId` 时必须属于当前用户，否则 404；`durationSec` 缺省 60s。
- **开流前**的错误走普通 JSON：401 `UNAUTHORIZED`、422 `VALIDATION_FAILED`、404 `NOT_FOUND`、429 `QUOTA_EXCEEDED`（月脚本额度）/ `RATE_LIMITED`（日额度）。
- **开流后**（HTTP 恒为 200）事件顺序：

| 事件 | 负载 | 说明 |
| --- | --- | --- |
| `meta` | `{ batchId, model, topicId, durationSec, usage }` | `usage` 为 `{ script, aiDaily }` |
| `progress` | `{ phase: calling\|parsing\|validating\|repairing, chars, attempt }` | 与选题共用阶段枚举（`AI_PROGRESS_PHASES`），只报字符数 |
| `script` | `{ script: ScriptDto }` | 一次性推送已落库的脚本（含 id） |
| `done` | `{ batchId, scriptId, latencyMs, usage }` | 成功结束 |
| `error` | `{ code, message, details? }` | `AI_INVALID_OUTPUT` 时 `details.draft` 为可编辑草稿 |

- 脚本输出契约（`src/lib/ai/schemas/script.ts`）：`titles` 3–5 条（每条 ≤ 40 字）、`hook` ≤ 200 字、`outline` 3–8 段（`section` ≤ 40 / `seconds` 3–300 / `content` ≤ 800 / `visual` 可选 ≤ 300）、`tags` 3–10 个、`coverCopy` ≤ 40 字、`cta` 可选 ≤ 120 字。
- `ScriptDto.fullScript` 与 `totalSeconds` 是**派生字段**（由 `outline` 拼接与求和），数据库只存分段；编辑与降级草稿都写入同一份 `outline`，不会出现两处内容不一致。

### 4.3 作品数据接口（P4）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/posts` | 单条录入；`publishedAt` 支持 `2026-09-01` / `2026/9/1` / 完整 ISO，按 Asia/Shanghai 解释 |
| GET | `/api/posts` | 游标分页（`createdAt + id` 倒序），支持 `platform`、`scriptId`、`from`、`to` 过滤（`to` 按当天结束处理） |
| GET | `/api/posts/[id]` | 详情（条件带 userId） |
| PATCH | `/api/posts/[id]` | 修正任意字段（至少一个）；不消耗配额 |
| DELETE | `/api/posts/[id]` | 删除作品（前端二次确认）；历史报告凭快照不受影响 |
| POST | `/api/posts/import` | CSV 粘贴预览：`{ csv, mapping? }` → `{ columns, mapping, unmatched, missingRequired, rows[], summary }`，**不写库** |
| POST | `/api/posts/import/commit` | `{ rows: PostInput[] (1–200), source: "csv" }` → 整体事务落库；任一行不合法整体回滚 |

CSV 预览约定：

- `mapping` 是「列下标 → 字段」的完整映射（`{"0":"title","2":"views"}`）；不传则按表头别名自动识别，传了就以传的为准。
- 未识别的列忽略并列进 `unmatched`；缺少必填列（`title` / `publishedAt`）时列进 `missingRequired`。
- 每行返回 `{ index, raw, data, errors[], duplicate }`：`index` 为含表头的行号；`data` 只在无错误时非空，可直接回传 commit；`duplicate` 为「标题 + 发布时间（北京时间日期）」一致（本批内或已录入过），**只标记不跳过**。
- 单元格归一化：计数支持 `1,234` / `1.2万` / `12k`；比率 `35%` / `35` / `0.35` 全部归一化到 0–1；空值与 `-` / `—` / `无` / `n/a` 一律视为「未提供」。

### 4.4 SSE 事件协议（`/api/reviews/generate`）

请求体（Zod strict）：

```ts
{ postIds: string[](1–50); focus?: string(≤200) }
```

- 作品必须全部属于当前用户：去重后按 id 查询，数量不一致一律 404（不泄露资源归属）。
- 基线取自「账号全部历史作品中排除本次纳入的作品」，最多取最近 500 条，保证统计口径稳定。
- **开流前**的错误走普通 JSON：401 `UNAUTHORIZED`、422 `VALIDATION_FAILED`、404 `NOT_FOUND`、429 `QUOTA_EXCEEDED`（月复盘额度）/ `RATE_LIMITED`（日额度）。
- **开流后**（HTTP 恒为 200）事件顺序：

| 事件 | 负载 | 说明 |
| --- | --- | --- |
| `meta` | `{ batchId, model, postCount, sampleSize, periodStart, periodEnd, usage }` | `usage` 为 `{ review, aiDaily }` |
| `progress` | `{ phase: calling\|parsing\|validating\|repairing, chars, attempt }` | 与选题 / 脚本共用阶段枚举，只报字符数 |
| `review` | `{ review: ReviewDto }` | 一次性推送已落库的报告（含 id 与快照） |
| `done` | `{ batchId, reviewId, latencyMs, usage }` | 成功结束 |
| `error` | `{ code, message, details? }` | `AI_INVALID_OUTPUT` 时 `details.draft` 为可编辑草稿 |

- 复盘输出契约（`src/lib/ai/schemas/review.ts`）：`summary` ≤ 300 字；`diagnostics` 3–5 条（`dimension` 固定六选一：选题 / 标题 / 开头 / 节奏 / 互动引导 / 发布节奏，`verdict` ≤ 80、`evidence` ≤ 120、`suggestion` ≤ 120）；`highlights` / `problems` 各 1–4 条（≤ 100）；`suggestions` 3–5 条（≤ 120）；`nextTopics` 固定 3 条（`title` ≤ 40、`reason` ≤ 120）；`baselineNote` ≤ 120。
- 二次校验失败 -> 422 + `details.draft` + 回滚配额；草稿补全后可由 `POST /api/reviews` 落库（不消耗配额，`source=edited`）。
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

## 6. AI 网关（P2 实现）

位置与职责：

| 文件 | 职责 |
| --- | --- |
| `src/lib/ai/provider.ts` | **唯一出口**：超时、重试、退避、`response_format` 降级、token 上限、响应结构校验 |
| `src/lib/ai/errors.ts` | `AiError`（code / retryable / httpStatus / attempts）与 `AiCallLog.status` 映射 |
| `src/lib/ai/json.ts` | 从模型文本里提取 JSON（剥 ```json 围栏、括号配平、数组包装） |
| `src/lib/ai/prompts/topic.ts` | 选题提示词（system / user / 修复），带 `PROMPT_VERSION` |
| `src/lib/ai/schemas/topic.ts` | 选题输出的 Zod 契约 + 降级草稿构建（`buildTopicDraft`） |
| `src/lib/ai/schemas/script.ts` | 脚本输出的 Zod 契约 + 降级草稿构建（`buildScriptDraft`） |
| `src/lib/ai/prompts/review.ts` | 复盘提示词（system / user / 修复），`REVIEW_PROMPT_VERSION = review-v1` |
| `src/lib/ai/schemas/review.ts` | 复盘输出的 Zod 契约 + 降级草稿构建（`buildReviewDraft`）+ `REVIEW_DIMENSIONS` |
| `src/lib/ai/schemas/draft.ts` | 降级草稿的通用字段构造器（选题 / 脚本共用） |
| `src/lib/ai/validate.ts` | `describeIssues`：把 Zod 错误压成可读列表 |
| `src/lib/ai/attempt-log.ts` | `AiCallLog` 留痕（只写元数据，绝不写 prompt 原文） |
| `src/lib/ai/profile-snapshot.ts` | 画像快照构建（只读），选题 / 脚本共用 |
| `src/lib/topics/service.ts` | 选题编排：prompt → 网关 → 解析 → 校验 → 修复重试 → 落库 + 写日志 |
| `src/lib/scripts/service.ts` | 脚本编排：同上，落库到 `Script` 并写 `topicSnapshot` / `profileSnapshot` |
| `src/lib/posts/csv.ts` | CSV（RFC4180）解析、表头别名映射、数值 / 比率 / 日期归一化、逐行校验（纯函数） |
| `src/lib/posts/schemas.ts` | 作品契约 + 派生指标 `computePostMetrics` + 基线 `computeBaseline` |
| `src/lib/posts/service.ts` | 作品编排：写入归一化、CSV 预览（不写库）、批量导入（整体事务）、CRUD |
| `src/lib/reviews/service.ts` | 复盘编排：prompt → 网关 → 解析 → 校验 → 修复重试 → 落库快照；含人工保存与编辑 |
| `src/components/.../` + `src/lib/client/sse.ts` | 客户端流解析（逐个事件过 Zod）与降级草稿编辑 |

调用约定：

- `POST {OPENAI_BASE_URL}/chat/completions`，`response_format: { type: "json_object" }`，`max_tokens` 硬上限 **3000**（P2 / P3 为 2000，P4 因复盘输出更长而提升，靠 prompt 约束输出规模）
- 超时 **45s**：超时**不重试**（重试会让等待时间翻倍，且受 Vercel 执行时长限制）
- 仅 429 / 5xx / 网络错误做指数退避重试：800ms → 2400ms，最多 **3 次尝试**
- 上游返回 400 时自动摘掉 `response_format` 重试一次，不占用重试预算
- 每次尝试都写一条 `AiCallLog`（含失败与重试），**只记元数据，绝不记 prompt 原文与模型原始输出**

输出校验与降级：

- AI 输出必须过 Zod（选题 `topicListSchema`：恰好 5 条；脚本 `scriptOutputSchema`：titles 3–5 / outline 3–8 等；复盘 `reviewOutputSchema`：diagnostics 3–5 / nextTopics 恰好 3 等，字段与长度全部受约束）
- 校验失败 → 追加**一次**「修复调用」（把原输出与具体问题回传给模型）
- 二次失败 → 返回 **422 `AI_INVALID_OUTPUT`**，`details.draft` 为可编辑草稿（选题 5 条 / 脚本 1 份 / 复盘 1 份；缺失字段降级为空值），**并回滚配额**
- 明确没有 `degraded: true` 这类中间态：要么产出 5 条合法选题，要么 422 + 草稿

本地联调：`node scripts/mock-openai.mjs` 起一个只监听 `127.0.0.1:4010` 的 OpenAI 兼容上游，`POST /mock/mode` 可在 `ok / badjson / badcount / badscript / http500 / slow / nosupport_json_mode` 之间切换，`GET /mock/log` 可回看最近几次请求的 prompt（用于验证「换一批」是否带上了历史标题）。mock 会根据提示词里是否出现 `"titles"` 自动区分选题 / 脚本请求，`badscript` 专用于验证脚本的降级草稿链路。

## 7. 配额（P2 实现）

两层限制，周期按 **Asia/Shanghai** 计算：

| 层 | kind | 周期 | 限额 | 超限响应 |
| --- | --- | --- | --- | --- |
| 月额度 | `topic` / `script` / `review` | `YYYY-MM` | `QUOTA_TOPIC` / `QUOTA_SCRIPT` / `QUOTA_REVIEW` | 429 `QUOTA_EXCEEDED` |
| 日防刷 | `ai_daily`（全局计数） | `YYYY-MM-DD` | `AI_DAILY_LIMIT` | 429 `RATE_LIMITED` |

实现要点（`src/lib/quota/usage.ts`）：

- **原子预占**：先 `findUnique`，存在则条件自增 `updateMany({ where: { used: { lt: limit } }, data: { increment: 1 } })`；不存在则 `create`，撞唯一约束（P2002）时重试一轮。绝不 read-then-write。
- 日额度与月额度在**同一个交互式事务**内预占；任一步超限整事务回滚（已由验收用例验证：月额度超限时当日计数不会被消耗）。
- **AI 调用一律在事务之外**（事务只做两行配额读写，避免长时间持锁）。
- 回滚（`releaseQuota`）按「预占时的 period + kind」执行 `decrement`，并用 `used: { gt: 0 }` 兜底防负数；跨天/跨月不会误扣新周期。
- 脚本生成复用同一套：月额度 `kind=script`、日额度 `kind=ai_daily`、`AiCallLog.kind="script"`，降级与超时同样回滚。
- 开流前预占，任何未产出可用结果的失败（校验降级、超时、5xx、上游拒绝、客户端断开）都在回滚分支里回滚。

## 8. 安全基线

- 密钥仅服务端；`src/lib/env.ts`、`src/lib/auth/*`、`src/lib/ai/*`、`src/lib/quota/usage.ts`、`src/lib/topics/service.ts`、`src/lib/scripts/service.ts` 带 `server-only`；禁止 `NEXT_PUBLIC_*` 泄漏
- 环境变量延迟校验：模块加载不抛错，`getEnv()` 首次调用时校验
- 密码 bcryptjs 哈希（成本 10）；登录失败统一返回「邮箱或密码错误」，且账号不存在时也执行一次哈希比对，避免通过耗时枚举邮箱
- 会话明文不出服务端，落库为 HMAC 摘要；Cookie `httpOnly` + `secure`(prod) + `sameSite: "lax"`
- 所有资源查询带 `userId`，查不到一律 404（不泄露资源是否存在）
- 登录页 `next` 参数只接受站内相对路径，拒绝 `//`、`\`，防止开放重定向
- 向外暴露的错误信息不回显上游原文之外的敏感信息；SSE 错误负载只含 `code` / `message` / `details`
- 客户端静态资源已核对：不含 `OPENAI_API_KEY`、`SESSION_SECRET`、`passwordHash`、`cc_session`

已知缺口（记入风险清单）：无邮箱验证、无找回密码、无登录频率限制、`AiCallLog` 无自动清理。

## 9. 环境变量

`DATABASE_URL`、`SESSION_SECRET`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`AI_DAILY_LIMIT`、`QUOTA_TOPIC`、`QUOTA_SCRIPT`、`QUOTA_REVIEW`、`APP_BASE_URL`

## 10. 生产迁移注意

- SQLite → Postgres 只需改 `datasource.provider` 与 `DATABASE_URL`；模型层已规避 enum / Json 差异
- Serverless 必须使用连接池地址，并限制连接数
- SSE 生成接口需要确认平台执行时长（`maxDuration = 60s`），必要时评估降级为非流式
- 上线前在空库跑一次 `prisma migrate deploy`，并把 `OPENAI_BASE_URL` 从 mock 切回真实地址