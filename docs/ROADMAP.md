# ROADMAP — 创作罗盘

原则：**一次只做一个阶段，禁止跳阶段**；每阶段结束后必须通过 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm test`。

## 阶段总览

| 阶段 | 主题 | 状态 |
| --- | --- | --- |
| P0 | 项目骨架 | 已完成（待人工确认响应式后提交） |
| P1 | 认证与账号画像 | 未开始 |
| P2 | 热点选题推荐 | 未开始 |
| P3 | AI 标题与脚本 | 未开始 |
| P4 | 数据录入与复盘 | 未开始 |
| P5 | 打磨与配额 | 未开始 |
| P6 | 部署上线 | 未开始 |

## P0 项目骨架（已完成）

范围：

- Next.js 14 App Router + TypeScript strict + Tailwind CSS 3 + 手写最小 UI 组件
- ESLint / Prettier / tsc 配置
- Prisma 初始化 + SQLite + 最小 `AppMeta` 模型（仅用于连通性验证）
- 环境变量延迟校验（10 个变量）
- 统一响应封装、错误码、`/api/health`
- AppShell、侧边导航、公开区 / 应用区路由占位页
- `.env.example`、`README.md`、`AGENTS.md`、`docs/*`
- 2 个单测：env 延迟校验、统一响应封装

**明确不做**：认证、Session、User、AI 调用、选题、脚本、复盘、SSE。

验收结果：

- [x] `pnpm lint` 零错误零警告
- [x] `pnpm exec tsc --noEmit` 通过
- [x] `pnpm build` 通过，路由表包含全部占位页（14 条路由 + `/_not-found`）
- [x] `pnpm test` 通过（2 个测试文件 / 13 个用例）
- [x] `pnpm exec prisma migrate dev --name init` 生成 `prisma/dev.db`（迁移 `20260911041257_init`）
- [x] `/api/health` 返回 `db: "ok"`
- [ ] 375px 显示底部 Tab、1440px 显示侧边栏（需在浏览器人工确认）
- [x] 移走 `.env` 后 `/api/health` 返回 500，服务端日志出现 `SESSION_SECRET: Required`
- [x] `.next` 产物中检索不到密钥值，客户端静态资源中无 `OPENAI_API_KEY` / `SESSION_SECRET`

P0 遗留说明：

- `.env` 中的 `OPENAI_API_KEY` 为占位值 `sk-placeholder-replace-me`，接入真实 AI 调用（P2）前必须替换
- 本机安装依赖使用镜像 `registry.npmmirror.com`；默认 registry 下载 tarball 会卡住，详见 README 常见问题

## P1 认证与账号画像

- `User` / `Session` 模型，注册 / 登录 / 登出 / 会话中间件
- `(app)` 路由守卫 + `(auth)` 页面
- `/onboarding` 账号画像表单（`CreatorProfile` 模型）
- `/settings` 画像查看与修改
- 验收：未登录访问 `/dashboard` 跳转登录；未建画像访问 `/topics` 跳转 onboarding；会话刷新后保持

## P2 热点选题推荐

- `TopicIdea` / `AiCallLog` / `UsageCounter` 模型
- AI 网关 + 选题 Prompt + Zod schema + SSE 流式
- `/topics` 生成 5 条、收藏、换一批、历史列表
- 配额与每日防刷生效，失败回滚
- 验收：生成 5 条含理由与参考方向；超额返回 `429 QUOTA_EXCEEDED`；AI 超时可重试

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
- 用量展示、退出登录、账号注销（级联删除）
- 埋点：生成次数、闭环完成率
- 验收：375px 全流程可用；配额提示清晰；注销后无残留数据

## P6 部署上线

- 切换 Postgres（Neon / Supabase）、连接池、`prisma migrate deploy`
- Vercel 部署、域名、环境变量、错误监控
- 隐私政策页
- 验收：生产环境跑通完整闭环