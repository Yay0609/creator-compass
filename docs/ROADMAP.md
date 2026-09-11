# ROADMAP — 创作罗盘

原则：**一次只做一个阶段，禁止跳阶段**；每阶段结束后必须通过 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm test`。

## 阶段总览

| 阶段 | 主题 | 状态 |
| --- | --- | --- |
| P0 | 项目骨架 | 已完成（tag `p0-skeleton`） |
| P1 | 认证与账号画像 | 已完成（待人工确认响应式后提交） |
| P2 | 热点选题推荐 | 未开始 |
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
- [x] 密码错误与不存在的邮箱返回相同文案（「邮箱或密码错误」）与 401
- [x] 登出后该会话行被删除；携带旧 Cookie 访问被重定向
- [x] 会话过期后访问被重定向，过期会话行被自动清理
- [x] 导出为 JSON 附件，内容不含 `passwordHash`
- [x] 注销：密码错误 422、确认文案不符 422、成功 200；用户 / 画像 / 会话级联删除，注销后无法登录
- [x] `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm test`（42 项）全部通过
- [x] 客户端静态资源中不含 `SESSION_SECRET` / `passwordHash` / `cc_session` / `bcryptjs` / `OPENAI_API_KEY`
- [ ] 375px / 1440px 下登录、注册、引导、设置四页布局（需人工在浏览器确认）

遗留说明：

- `.env` 中 `OPENAI_API_KEY` 仍为占位值，P2 接入真实调用前必须替换
- 已知缺口（推迟到 P5）：邮箱验证、找回密码、登录频率限制、修改昵称与密码

## P2 热点选题推荐

- `TopicIdea` / `AiCallLog` / `UsageCounter` 模型
- AI 网关 + 选题 Prompt + Zod schema + SSE 流式
- `/topics` 生成 5 条、收藏、换一批、历史列表
- 配额（`QUOTA_TOPIC`）与每日防刷（`AI_DAILY_LIMIT`）生效，失败回滚
- 验收：生成 5 条含理由与参考方向；超额返回 `429 QUOTA_EXCEEDED`；AI 超时可重试；AI 输出校验失败重试 1 次后降级为草稿

## P3 AI 标题与脚本

- `ScriptItem` 模型 + 脚本 Prompt
- 由选题一键生成：5 个标题候选、开头钩子、分段脚本、标签、封面文案
- 脚本可编辑保存、可复制
- 验收：手改后刷新仍在；缺少 AI 配置时给出可读错误而非白屏

## P4 数据录入与复盘

- `PostRecord` / `ReviewReport` 模型
- 手动录入 + CSV 粘贴 + 列映射预览 + 批量落库（逐行报错）
- 单篇 / 批量复盘报告：结论、归因、基线对比、下一步动作、下一批选题
- 验收：10 行 CSV 可预览可修正；复盘含 ≥ 3 条带数据引用的建议

## P5 打磨与配额

- 加载 / 空 / 错误态完善，移动端适配
- 用量展示、修改昵称与密码、邮箱验证与找回密码、登录频率限制
- 账号注销（当前为立即物理删除，如需冷静期在此阶段评估）
- 埋点：生成次数、闭环完成率
- 验收：375px 全流程可用；配额提示清晰；注销后无残留数据

## P6 部署上线

- 切换 Postgres（Neon / Supabase）、连接池、`prisma migrate deploy`
- Vercel 部署、域名、环境变量、错误监控
- 隐私政策页
- 验收：生产环境跑通完整闭环