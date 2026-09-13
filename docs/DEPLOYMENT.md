# 部署与运维（P6）

面向维护者的一页手册：怎么把「创作罗盘」从本地 SQLite 部署到 Vercel + Neon，以及出问题时怎么查。
部署动作需要你自己的账号授权（Vercel / Neon / GitHub），仓库只提供命令与配置模板。

## 1. 生产拓扑

```
浏览器 ──> Vercel（Next.js 14 App Router，Node runtime）
             │  ├─ Serverless / Fluid 函数：页面、API、SSE 流式生成
             │  ├─ Edge Middleware：只看会话 Cookie 的粗粒度路由守卫
             │  └─ Cron（每天 1 次）→ GET /api/cron/prune-ai-logs
             ├──> Neon Postgres（ap-southeast-1）：业务数据 + 会话 + 配额 + AI 调用日志
             └──> DeepSeek（OpenAI 兼容接口）：选题 / 脚本 / 复盘生成
```

约定：所有密钥只存在于 Vercel 环境变量与服务端运行时；客户端 bundle 里不允许出现 `OPENAI_API_KEY`、`SESSION_SECRET`、`CRON_SECRET`、`DATABASE_URL`。

## 2. 双 schema：本地 SQLite / 生产 Postgres

| 用途 | schema 文件 | 迁移目录 | provider |
| --- | --- | --- | --- |
| 本地开发 | `prisma/schema.prisma` | `prisma/migrations/` | SQLite（`file:./dev.db`） |
| 生产 / 预览 | `prisma/postgres/schema.prisma` | `prisma/postgres/migrations/` | Postgres（Neon） |

硬性规则：

1. **两份 schema 的模型部分必须逐字一致**，只允许 `datasource` 不同。改任何模型（表、字段、索引、级联）都要同时改两份。
2. 每次改完执行 `corepack pnpm schema:check`（等价于 `node scripts/check-schema-parity.mjs`），不一致会直接失败。
3. **本地 SQLite 的迁移绝不要 deploy 到 Postgres**。生产迁移历史独立，且用 Postgres 方言 SQL 生成。
4. `prisma generate` 会覆盖 `node_modules/.prisma/client`（两份 schema 共用同一个输出目录）。因此：
   - 本地误跑了 `pnpm db:generate:pg` 之后，必须补一次 `corepack pnpm db:generate`（SQLite）才能继续本地开发；
   - Vercel 上 `postinstall` 会先用 SQLite schema 生成一次，随后 `vercel-build` 立即用 Postgres schema 覆盖 —— 这是刻意设计，不会影响生产运行时。
5. 生产 schema 使用 `url`（Neon 连接池地址）+ `directUrl`（Neon 直连地址）：迁移必须走直连，否则 pgbouncer 会报 prepared statement 相关错误。

## 3. 一次性准备

### 3.1 Neon

1. 注册 Neon，创建项目，区域选 **Singapore (ap-southeast-1)**（与 Vercel 函数区域同区，减少 SSE 首包延迟）。
2. 建库 `creator_compass`（默认生成的库名即可）。
3. 在 Dashboard → Connection Details 取两条连接串（模板如下，把尖括号换成真实值；**不要贴进聊天 / Issue / 提交记录**）：

```
# 连接池（应用运行时用，注意主机名里的 -pooler）
DATABASE_URL="postgresql://<user>:<password>@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/<db>?sslmode=require&pgbouncer=true&connection_limit=1"

# 直连（迁移用，没有 -pooler）
DIRECT_URL="postgresql://<user>:<password>@ep-xxx.ap-southeast-1.aws.neon.tech/<db>?sslmode=require"
```

生产从**空库**开始，不迁移本地 `dev.db` 数据；首次上线用测试账号验证闭环。

### 3.2 生成本地密钥

```powershell
# SESSION_SECRET（32 字节 hex）；生产必须与本地不同
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# CRON_SECRET：任意随机长串
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

## 4. Vercel 项目配置

1. Vercel → Add New Project → 导入 GitHub 仓库 `creator-compass`（Framework 会被识别为 Next.js）。
2. Build Command 不手工改：仓库根的 `vercel.json` 已声明 `pnpm run vercel-build`，它会依次执行
   `prisma generate --schema prisma/postgres/schema.prisma` → `prisma migrate deploy --schema prisma/postgres/schema.prisma` → `next build`。
3. Install Command 保持默认 `pnpm install`（仓库已锁定 `pnpm@9.15.0`）。
4. Node.js Version：推荐固定为 **20.x**（本地 22.x 也已验证通过，但固定版本可避免 Vercel 默认值漂移）。
5. 函数区域：Project → Settings → Functions → Region 选 Singapore（`sin1`），与 Neon 同区。
6. 环境变量：按第 5 节表格，在 Production / Preview 分别配置；`CRON_SECRET` 至少要在 Production 配。
7. Preview 建议开启 **Deployment Protection**（Settings → Deployment Protection），避免预览域名被外部注册、消耗 DeepSeek 额度。
8. 首次部署后按第 6 节验收；`vercel.json` 的 Cron 只有在 **Production 部署**后才会生效。
## 5. 环境变量清单（值由你填写）

| 变量 | Production | Preview | 说明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | ✅ | Neon **连接池**地址（主机名带 `-pooler`，含 `pgbouncer=true&connection_limit=1`） |
| `DIRECT_URL` | ✅ | ✅ | Neon **直连**地址，仅供 `prisma migrate deploy` 使用 |
| `SESSION_SECRET` | ✅ | ✅ | ≥ 32 字符；生产与本地必须不同，换值会让所有会话失效 |
| `OPENAI_API_KEY` | ✅ | ✅ | DeepSeek Key（仅服务端） |
| `OPENAI_BASE_URL` | ✅ | ✅ | `https://api.deepseek.com/v1` |
| `OPENAI_MODEL` | ✅ | ✅ | `deepseek-chat` |
| `AI_DAILY_LIMIT` | ✅ | ✅ | 单用户每日 AI 调用总上限，建议 `20` |
| `QUOTA_TOPIC` / `QUOTA_SCRIPT` / `QUOTA_REVIEW` | ✅ | ✅ | 每月额度，建议 `10` / `10` / `5` |
| `AI_MAX_TOKENS` | 可选 | 可选 | 留空即 3000（上限 8192） |
| `AI_TIMEOUT_MS` | 可选 | 可选 | 留空即 45000（上限 120000）。若上游偏慢，可调到 `60000` |
| `AI_LOG_RETENTION_DAYS` | 可选 | 可选 | 留空即 90 |
| `APP_BASE_URL` | ✅ | ✅ | 生产填 `https://<项目>.vercel.app`（必须 https，否则 Secure Cookie 失效） |
| `CRON_SECRET` | ✅ | 可选 | Cron 接口 Bearer 密钥；生产未配置时 `/api/cron/*` 直接拒绝执行 |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | — | — | 本轮未接入，留空；接入方案见第 9 节 |

本地 `.env` 不需要新增任何**必填**项；`DIRECT_URL` / `CRON_SECRET` 留空不影响开发（`CRON_SECRET` 为空时本地 Cron 接口放行，仅用于手工验证）。

## 6. 首次部署与验收

### 6.1 部署

1. 先在本地确认四件套通过：`corepack pnpm lint` → `corepack pnpm exec tsc --noEmit` → `corepack pnpm test` → `corepack pnpm build`，并跑 `corepack pnpm schema:check`。
2. 推送代码后，Vercel 会对 PR / 分支出 Preview，对 `main` 出 Production。首次部署时 `vercel-build` 会自动完成 Neon 建表（不需要手工跑迁移）。
3. 需要手工核对迁移状态时（在本地，用生产连接串）：

```powershell
$env:DATABASE_URL="postgresql://...-pooler..."; $env:DIRECT_URL="postgresql://..."
corepack pnpm db:status:pg     # 迁移是否都应用了
corepack pnpm db:migrate:pg    # 手工应用未执行的迁移（与 vercel-build 中同一命令）
```

### 6.2 验收清单

| # | 验收项 | 期望 |
| --- | --- | --- |
| 1 | `GET /api/health`（预览） | 200，返回完整 `{ ok, data: { status, db, ai, env, uptimeSec, checkedAt } }`，`db: true` |
| 2 | `GET /api/health`（生产） | 200，只返回 `{ ok: true, data: { status: "ok" } }` |
| 3 | `/`、`/privacy`、`/terms`、`/login` | 200，内容正常 |
| 4 | `GET /api/auth/me`（未登录） | 401 |
| 5 | 生产全链路冒烟 | `node scripts/smoke-real-ai.mjs --base=https://<项目>.vercel.app` 全绿 |
| 6 | 冒烟后数据核对 | Neon 中 `smoke-*` 用户为 0，关联表无残留（验证 Postgres 上的级联删除） |
| 7 | Cron 鉴权 | 不带 token 请求 `/api/cron/prune-ai-logs` → 401；带 `Bearer $CRON_SECRET` → 200 + 删除条数 |
| 8 | Cron 调度 | Vercel → Cron Jobs 出现成功记录（UTC 18:00 = 次日 02:00 Asia/Shanghai） |
| 9 | 密钥泄漏扫描 | 生产 bundle 中搜不到 `OPENAI_API_KEY` / `SESSION_SECRET` / `CRON_SECRET` 的值 |
| 10 | 移动端 | 375px 下生产域名走一遍注册 → 选题 → 脚本 → 数据 → 复盘（HTTPS + Secure Cookie 与本地行为不同） |

手工触发 Cron（PowerShell）：

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Uri "https://<项目>.vercel.app/api/cron/prune-ai-logs" -Headers $headers
```

## 7. Cron 说明

- 配置在 `vercel.json`：`{ "path": "/api/cron/prune-ai-logs", "schedule": "0 18 * * *" }`（UTC 18:00 = 02:00 Asia/Shanghai，低峰执行）。
- 实现：`src/app/api/cron/prune-ai-logs/route.ts` 只调用 P5 的 `pruneAiCallLogs()`（保留期由 `AI_LOG_RETENTION_DAYS` 决定，分批 500 行删除），不在这里另写删除逻辑。
- 鉴权：Vercel Cron 会带上 `Authorization: Bearer $CRON_SECRET`；比较使用常量时间函数。
- 计划限制：Hobby 套餐 **Cron 最多 2 个、且只能是每天一次的粒度**，函数单次最长 60s。当前任务远低于这些上限。
- 本地等价操作：`node scripts/prune-ai-logs.mjs`（默认 dry-run，加 `--yes` 才真删）。

## 8. 运维与排障

| 场景 | 处理 |
| --- | --- |
| 迁移失败（`vercel-build` 报错） | 检查 `DIRECT_URL` 是否直连地址、是否带 `sslmode=require`；`pnpm db:status:pg` 看是否处于 failed 状态 |
| 生产页面 500 | Vercel → Deployments → Functions 日志；`EnvValidationError` 会在日志里列出缺失变量名（不含值） |
| SSE 没有流式效果 | 确认响应头含 `text/event-stream`、`Cache-Control: no-store`、`X-Accel-Buffering: no`；若上游偏慢，先调 `AI_TIMEOUT_MS` |
| 额度异常 | `/api/usage` 看月 / 日用量；`UsageCounter` 的条件自增是原子的，不会因并发超发 |
| 需要回滚 | Vercel → Deployments → 选中上一个正常版本 → Promote to Production（无需重新构建） |
| 密钥轮换 | Vercel 改环境变量 → Redeploy；`SESSION_SECRET` 换值等于强制所有用户重新登录；DeepSeek Key 泄漏时先在控制台吊销再换 |
| 日志保留过久 | 调小 `AI_LOG_RETENTION_DAYS` 并手工触发一次 Cron |
| 本地数据库乱了 | `corepack pnpm db:migrate`（SQLite）；需要彻底重来时删掉 `prisma/dev.db` 再 migrate（**不要**在生产执行 reset 类命令） |

## 9. 后续（P6 之后）

- **Sentry**：本轮未接入。接入时安装 `@sentry/nextjs`，生成 `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` 并用 `withSentryConfig` 包裹 `next.config.mjs`；必须 `sendDefaultPii: false`、`tracesSampleRate: 0`（只收错误），确保不上报用户内容、prompt、邮箱；没有 DSN 时不应初始化。
- **自定义域名**：Vercel → Settings → Domains 绑定，DNS 按提示配置；绑定后把 `APP_BASE_URL` 改成新域名并重新部署（Cookie 的 Secure 行为依赖 https）。
- **隐私政策 / 服务条款**：`/privacy`、`/terms` 目前仍标注「待补充」，上线对外提供服务前必须替换为真实主体信息（主体名称、联系方式、生效日期、备案号）。在补齐之前不要对外宣传为正式服务。
- **商业使用**：Vercel Hobby 仅限非商业用途；若转为经营用途需升级 Pro（同时函数时长与 Cron 限制也会放宽）。