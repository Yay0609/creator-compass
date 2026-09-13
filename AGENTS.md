# AGENTS.md — 创作罗盘（creator-compass）

本文件是本仓库内所有 AI 代理与协作者的强制约定，修改代码前必读。

## 1. 阶段宪法（最高优先级）

- 项目按 `docs/ROADMAP.md` 的 P0–P6 推进，**一次只做一个阶段，禁止跳阶段**。
- 当前阶段范围以 ROADMAP 为准；不在本阶段范围内的功能（包括“顺手加上”的小功能）一律不做。
- 每个阶段结束后产出可验收结果，并在 ROADMAP 中标记完成状态。
- 未经人类确认，不得开始下一阶段。

## 2. 每阶段完成定义（DoD）

以下命令必须全部通过，且零错误、零警告：

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

## 3. 安全红线

- `OPENAI_API_KEY` 等密钥**只能存在于服务端**：禁止写入 `NEXT_PUBLIC_*`、禁止传入客户端组件、禁止打进日志。
- 会话令牌只以哈希（sha256）形式落库，明文仅存在于 httpOnly Cookie。
- 密码使用 bcrypt 哈希，禁止明文或可逆加密存储。
- Cookie 必须带 `httpOnly`、`secure`（生产环境）、`sameSite: "lax"`。
- **所有资源查询必须带 `userId`**（形如 `where: { id, userId }`），禁止先按 id 查出再判断归属。
- 响应中禁止回显密钥、令牌、密码哈希；`/api/health` 只输出标记与长度。
- 禁止把 prompt 原文、模型原始输出写进数据库或日志（`AiCallLog` 只记元数据）。

## 4. 明确的非目标（不要实现）

- 不做爬虫、不抓取平台数据、不采集平台账号密码或 Cookie
- 不做自动发布、不接入平台 OAuth
- 不做社区、关注、私信、评论
- 不做小程序、不做原生 App

## 5. 代码约定

- TypeScript strict，不使用 `any`；必要时用 `@ts-expect-error` 并写明原因，禁止 `@ts-ignore`。
- 所有外部输入（请求体、查询参数、CSV、AI 返回、SSE 事件）必须经 Zod 校验后才能进入业务逻辑。
- 服务端统一响应体：`{ ok: true, data }` 或 `{ ok: false, error: { code, message, details? } }`；错误码集中在 `src/lib/api/error-codes.ts`。
- 路由处理器统一用 `withRoute()` / `withAuthedRoute()` 包装，禁止各写一套裸 `try/catch`。
- 环境变量只能通过 `src/lib/env.ts` 的 `getEnv()` 读取，禁止散落 `process.env.XXX`（`NODE_ENV` / `VERCEL_ENV` 除外）。
- 新增依赖前先说明理由，优先复用已有依赖；不引入 Tailwind v4、NextAuth、shadcn CLI 等与当前栈冲突的方案。
- 注释与面向用户的文案统一使用中文。

## 6. 目录约定

- 页面：`src/app/**`（公开区在根，认证在 `(auth)`，应用区在 `(app)`）
- 组件：`src/components/**`（`ui/` 通用原子组件，`layout/` 框架级组件，领域组件按模块分目录）
- 服务端能力：`src/lib/**`（`api/`、`db/`、`auth/`、`ai/`、`quota/`、`topics/`、`scripts/`、`posts/`、`reviews/`）
- 契约（前后端共享的类型 + Zod）：`src/lib/<domain>/schemas.ts`，禁止两端各写一份
- 数据模型：`prisma/schema.prisma`；业务模型按阶段新增，**禁止提前建表**
- 测试：`tests/**`；本地联调脚本：`scripts/**`（不进生产构建）

## 7. 禁止的操作

- 禁止执行 `git push`、`vercel deploy` 等对外发布动作（由人类执行）
- 禁止 `rm -rf`、`prisma migrate reset`、删除项目目录外的文件、修改系统目录
- 禁止提交 `.env` 与 `*.db`

## 8. 认证与会话约定（P1 起生效）

- 会话明文 token 只存在于 httpOnly Cookie；数据库主键是 `HMAC-SHA256(token, SESSION_SECRET)`，**禁止改变这一派生方式**。
- 禁止在 Client Component 中读取会话：`src/lib/auth/session.ts`、`password.ts`、`token.ts` 均带 `server-only`。客户端要拿当前用户只能走 `/api/auth/me`。
- 页面守卫：`requireUser()`（未登录跳登录）、`requireProfile()`（无画像跳 onboarding）。需要画像的分区统一放在 `(app)/(needs-profile)/` 路由组下。
- `src/middleware.ts` 只是粗粒度体验优化（edge runtime 无法查库），**不是安全边界**，不要在其中加入业务判断。
- API 一律使用 `withAuthedRoute()`；查询与更新用户资源时条件必须带 `userId`，查不到就返回 404。
- 每位用户只能有一个账号画像（P1 不变量）：创建第二个返回 409，删除最后一个返回 400。
- 注销账号是物理删除（密码 + 「注销账号」二次确认），依赖外键级联清理 sessions / profiles / topics / scripts / usageCounters / aiCallLogs。
- 任何密钥都不得暴露为 `NEXT_PUBLIC_*`。

## 9. AI 网关与配额约定（P2 起生效，P3 / P4 复用）

- **所有模型调用必须走 `src/lib/ai/provider.ts`**：禁止任何地方直接 `fetch` 上游、禁止绕过网关做重试或解析。
- 网关参数：45s 超时、`max_tokens` 上限 3000（P4 起提升，复盘报告更长）、`response_format: json_object`；仅 429 / 5xx / 网络错误做指数退避重试（800ms、2400ms，最多 3 次尝试）；**超时不重试**（重试会让等待时间翻倍）。
- 上游返回 400 时自动摘掉 `response_format` 重试一次（不占用重试预算），以兼容不支持 JSON 模式的服务端。
- 所有 AI 输出必须过 Zod：校验失败自动追加**一次**「修复调用」；二次失败返回 **422 `AI_INVALID_OUTPUT`**，`details.draft` 携带可编辑草稿（选题 5 条 / 脚本 1 份 / 复盘 1 份），**并回滚配额**。不存在 `degraded: true` 之类的中间态标记。
- 脚本不落库 `fullScript`：完整口播稿与总时长由 DTO 层从 `outline` 派生；分段是唯一真源，编辑 / 降级草稿都必须写回 `outline`。
- 选题与脚本共用进度阶段枚举 `AI_PROGRESS_PHASES`（`src/lib/constants.ts`）与 SSE 事件名，禁止各写一份。
- 进度只回传字符数（`phase` / `chars` / `attempt`），**禁止把模型增量原文透传给客户端**。
- 每次尝试都写 `AiCallLog`（kind / model / status / attempt / httpStatus / latencyMs / tokens / promptChars / outputChars），**绝不写 prompt 原文与模型原始输出**。
- 配额两层：月额度（`QUOTA_TOPIC` / `QUOTA_SCRIPT` / `QUOTA_REVIEW`）+ 全局日额度（`AI_DAILY_LIMIT`，kind=`ai_daily`）；周期一律按 `Asia/Shanghai` 计算。
- 预占必须原子：条件自增（`used: { lt: limit }`）+ 唯一约束兜底；**严禁把 AI 调用放进数据库事务**。开流前预占，任何未产出可用结果的失败（校验降级、超时、5xx、客户端断开）一律回滚。
- 回滚必须按「预占时的 period + kind」回滚，避免跨天/跨月时误扣新周期。
- SSE 响应必须带 `text/event-stream`、`Cache-Control: no-store`、`X-Accel-Buffering: no`，并每 15s 发心跳；开流前的错误（401/422/429）走普通 JSON，开流后的错误走 `event: error`。
- `src/lib/ai/**`、`src/lib/quota/usage.ts`、`src/lib/topics/service.ts`、`src/lib/scripts/service.ts`、`src/lib/posts/service.ts`、`src/lib/reviews/service.ts`、`src/lib/api/sse.ts` 都是服务端模块（`server-only`），禁止被客户端组件引用。
- 本地联调可用 `scripts/mock-openai.mjs`（只监听 127.0.0.1）；禁止把它当成生产依赖，也不要在其中放置任何真实密钥。

## 10. 作品数据与复盘约定（P4 起生效）

- 数据只来自用户手动录入 / 粘贴 CSV，**禁止爬虫、禁止抓取平台数据、禁止采集平台账号密码或 Cookie**。
- CSV 解析是纯函数（`src/lib/posts/csv.ts`）：RFC4180 手写实现，不引入 papaparse；未识别的列忽略并列进 `unmatched`，不做猜测。
- 数值与时间必须归一化后再入库：计数支持 `1,234` / `1.2万` / `12k`；比率统一到 0–1（`35%` / `35` / `0.35` 等价）；日期支持 `2026-09-01` / `2026/9/1` / `9/1`（缺年份补当年），一律按 `Asia/Shanghai` 解释，日期型输入落在当天 12:00 避免串日。
- 互动率等派生指标**只在 DTO 层计算，不落库**（`computePostMetrics`），口径调整不会污染历史数据。
- 导入分两步：`/api/posts/import` 只预览不写库，`/api/posts/import/commit` 才落库（整体事务，≤ 200 行）。重复行只标记「疑似重复（标题 + 发布时间一致）」，**不自动跳过、不自动去重**。
- 基线口径：取「账号全部历史作品」的均值与中位数，**必须排除本次纳入的作品**，并在报告里标注样本数与区间（`computeBaseline`）。生成与人工保存共用 `baselineSourceOf()`，禁止两处各写一份。
- 复盘报告只引用 `postIds` 与生成时的只读快照（`postSnapshot` / `baselineSnapshot`），**不建指向 `PostRecord` 的外键**：作品被删除或修改后，历史报告仍然完整可读。
- 作品支持编辑与删除（删除需二次确认）；复盘报告与选题、脚本一致，只做「收藏 + 忽略」，**不做硬删除**。
- 复盘同样遵循 P2 的 AI 约定（网关、Zod 校验、422 + `details.draft`、配额预占与回滚、AiCallLog、SSE 三个响应头），配额 kind=`review` + 全局 `ai_daily`。

## 11. 文档

设计变更先改文档再改代码：

- `docs/PRD.md` —— 产品需求
- `docs/ARCHITECTURE.md` —— 技术方案
- `docs/ROADMAP.md` —— 阶段计划