# ROADMAP — 创作罗盘

原则：**一次只做一个阶段，禁止跳阶段**；每阶段结束后必须通过 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`、`pnpm build`。

## 阶段总览

| 阶段 | 主题 | 状态 |
| --- | --- | --- |
| P0 | 项目骨架 | 已完成（tag `p0-skeleton`） |
| P1 | 认证与账号画像 | 已完成（tag `p1-auth`） |
| P2 | 热点选题推荐 | 已完成（待人工确认，tag `p2-topics`） |
| P3 | AI 标题与脚本 | 未开始 |
| P4 | 数据录入与复盘 | 未开始 |
| P5 | 打磨与配额 | 未开始 |
| P6 | 部署上线 | 未开始 |

## P0 项目骨架（已完成）

交付：Next.js 14 + TS strict + Tailwind + 手写最小 UI 组件；ESLint / Prettier / tsc；Prisma + SQLite + `AppMeta`；环境变量延迟校验；统一响应封装与 `/api/health`；AppShell 与占位路由；`docs/` 与 `AGENTS.md`；2 个单测。

验收：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm test` 全部通过；`/api/health` 返回 `db: "ok"`；移走 `.env` 后返回 500 且日志指明缺失变量；构建产物中无密钥。

## P1 认证与账号画像（已完成）

交付：

- `User` / `Session` / `CreatorProfile` 模型与迁移
- 邮箱密码注册、登录、登出（bcryptjs 哈希；自建 Session 表 + httpOnly Cookie）
- 三层守卫：middleware（粗粒度）/ 页面 `requireUser`、`requireProfile` / 接口 `withAuthedRoute`
- `(app)/(needs-profile)` 路由组集中画像守卫
- `/onboarding` 账号画像表单、`/settings` 账号与画像管理
- 数据导出（JSON 附件）与账号注销（级联删除）

**明确不做**：选题、脚本、复盘、AI 调用、SSE、配额。

验收结果（端到端脚本，41 项断言）：

- [x] `prisma migrate dev` 生成迁移 `20260911095710_add_auth_and_profile`，三张表创建成功
- [x] 未登录访问 `/dashboard` → 307 到 `/login?next=%2Fdashboard`
- [x] 注册后自动登录并跳 `/onboarding`；重复邮箱返回 409
- [x] Cookie 具备 `HttpOnly` / `SameSite=Lax` / `Path=/` / `Max-Age=2592000`
- [x] 会话主键为 64 位 hex，且不等于 Cookie 明文
- [x] 无画像访问 `/topics` → 跳 `/onboarding`；提交画像后可正常访问
- [x] 越权 PATCH 他人画像返回 404，且数据未被修改
- [x] 未登录访问 `/api/profiles` 返回 401
- [x] 密码错误与不存在的邮箱返回相同文案与 401
- [x] 登出后该会话行被删除；携带旧 Cookie 访问被重定向
- [x] 会话过期后访问被重定向，过期会话行被自动清理
- [x] 导出为 JSON 附件，内容不含 `passwordHash`
- [x] 注销：密码错误 422、确认文案不符 422、成功 200；级联删除，注销后无法登录
- [x] 四件套全部通过（42 项单测）
- [x] 客户端静态资源中不含 `SESSION_SECRET` / `passwordHash` / `cc_session` / `bcryptjs` / `OPENAI_API_KEY`
- [x] 375px / 1440px 下登录、注册、引导、设置四页布局（人工确认通过）

遗留说明：

- 已知缺口（推迟到 P5）：邮箱验证、找回密码、登录频率限制、修改昵称与密码

## P2 热点选题推荐（已完成）

交付：

- 数据模型：`TopicIdea`（含只读 `profileSnapshot`、`isFavorite`、`isDiscarded`）、`UsageCounter`、`AiCallLog`，迁移 `20260913065321_add_topics_quota_and_ai_log`
- AI 网关 `src/lib/ai/provider.ts`：45s 超时、429/5xx/网络指数退避重试（800ms/2400ms，最多 3 次）、`max_tokens` 上限 2000、`response_format: json_object`（上游 400 不支持时自动摘掉重试一次）
- 选题领域：prompt 构造、Zod 契约（恰好 5 条）、降级草稿构建、`src/lib/topics/service.ts` 编排
- `POST /api/topics/generate`：**SSE 流式**（`meta → progress* → topic×5 → done | error`），进度只回传字符数
- `/topics`：生成表单 + 卡片（评分、收藏、换一批）+ 游标分页历史；`/topics/[id]` 详情（含画像快照），「去生成脚本」置灰标注 P3 开放
- 配额：月额度（`QUOTA_TOPIC`）+ 全局日防刷（`AI_DAILY_LIMIT`），按 Asia/Shanghai 分周期；原子条件自增预占，失败一律回滚
- `AiCallLog` 记录每次尝试的元数据（含失败与重试），绝不存 prompt 原文与模型输出
- 本地 mock 上游 `scripts/mock-openai.mjs`（P3/P4 复用）

**明确不做**：脚本生成、数据录入、复盘、爬虫、自动发布。

验收结果（端到端脚本 A/B 两阶段，40 + 6 项断言，另有 81 项单测）：

- [x] 迁移成功；`/api/usage` 初始 0/10（月选题）、0/20（日 AI）
- [x] 生成请求返回 `text/event-stream` + `Cache-Control: no-store` + `X-Accel-Buffering: no`
- [x] 事件顺序为 `meta → progress×3 → topic×5 → done`；进度事件字段仅 `phase/chars/attempt`（不透传模型原文）
- [x] 落库 5 条且共享同一 `batchId`，含只读 `profileSnapshot`
- [x] 生成后月用量 1/10、日用量 1/20
- [x] 历史列表、收藏、收藏筛选、详情均正常
- [x] 越权读取 / 更新他人选题返回 404；未登录生成返回 401 普通 JSON（不建 SSE）
- [x] 「换一批」prompt 带上历史标题与补充说明；携带 11 条标题被拒（422）
- [x] 校验失败（只返回 3 条）触发 1 次修复调用，二次失败返回 422 `AI_INVALID_OUTPUT` + 5 条可编辑草稿，配额已回滚
- [x] 非 JSON 输出同样降级为 5 条草稿
- [x] 上游 5xx 指数退避尝试 3 次后返回 `AI_UNAVAILABLE`，配额回滚，`AiCallLog` 落 3 条 `error`（含 httpStatus=500）
- [x] 上游不支持 `response_format` 时自动摘掉该参数重试成功
- [x] 45s 超时（实测 45.0s）返回错误事件、不重试、配额回滚、`AiCallLog` 落 `timeout`
- [x] 月额度用尽后返回 429 `QUOTA_EXCEEDED`（普通 JSON）；**事务原子性**：月额度失败时当日计数未被消耗
- [x] 日额度 `AI_DAILY_LIMIT=3` 时第 4 次返回 429 `RATE_LIMITED`，月额度只消耗 3 次
- [x] 注销级联删除：用户删除后 topics / counters / logs / sessions / profiles 残留均为 0
- [x] 四件套全部通过（`lint` / `tsc --noEmit` / `test` / `build`）
- [ ] 375px / 1440px 下 `/topics` 四种态（生成中、成功、失败、草稿降级）需人工在浏览器确认

遗留说明：

- `.env` 中 `OPENAI_API_KEY` 仍是占位值，本轮全部用本地 mock 验收；**真实上游冒烟推迟到 P6 部署前替换 Key 后执行**
- 新增 `POST /api/topics`（人工保存草稿/手动新增，不消耗配额）：若不提供，422 降级草稿将无法落库
- `AiCallLog` 无自动清理策略，量大后需在 P5 评估保留期
- SSE 在 Vercel Serverless 的执行时长限制需在 P6 验证

## P3 AI 标题与脚本

- `ScriptItem` 模型 + 脚本 Prompt
- 由选题一键生成：5 个标题候选、开头钩子、分段脚本、标签、封面文案
- 脚本可编辑保存、可复制；生成时复用 `TopicIdea.profileSnapshot` 锁定画像上下文
- 验收：手改后刷新仍在；缺少 AI 配置时给出可读错误而非白屏

## P4 数据录入与复盘

- `PostRecord` / `ReviewReport` 模型
- 手动录入 + CSV 粘贴 + 列映射预览 + 批量落库（逐行报错）
- 单篇 / 批量复盘报告：结论、归因、基线对比、下一步动作、下一批选题
- 验收：10 行 CSV 可预览可修正；复盘含 ≥ 3 条带数据引用的建议

## P5 打磨与配额

- 加载 / 空 / 错误态完善，移动端适配
- 用量展示、修改昵称与密码、邮箱验证与找回密码、登录频率限制
- `AiCallLog` 保留期与清理策略
- 埋点：生成次数、闭环完成率
- 验收：375px 全流程可用；配额提示清晰；注销后无残留数据

## P6 部署上线

- 切换 Postgres（Neon / Supabase）、连接池、`prisma migrate deploy`
- Vercel 部署、域名、环境变量、错误监控
- **替换真实 `OPENAI_API_KEY` 并跑一次真实上游冒烟**
- 隐私政策页
- 验收：生产环境跑通完整闭环