# 创作罗盘（creator-compass）

面向小红书 / B站 / 抖音 **0–1 万粉新手创作者** 的 AI 助手，解决三件事：

1. **今天发什么** —— 基于平台、赛道、账号画像生成 5 条可跟选题，附推荐理由与参考方向
2. **怎么发** —— 由选题生成标题、开头钩子、脚本框架、标签与封面文案
3. **发完为什么行/不行** —— 手动录入或粘贴 CSV 作品数据，AI 产出复盘报告与下一步建议

> 当前进度：**P0 项目骨架**。仓库内只有占位页面与基础设施，**尚未实现**认证、AI 调用、选题 / 脚本 / 复盘功能。

## 技术栈

- Next.js 14（App Router）+ TypeScript strict
- Tailwind CSS 3 + 手写最小 UI 组件（Button / Card / Input / Label / Textarea / Badge / Skeleton）
- Prisma + SQLite（开发）→ Postgres（生产，Neon / Supabase）
- Zod（环境变量与入参校验）、Vitest（单元测试）
- AI：OpenAI 兼容接口（`OPENAI_BASE_URL` / `OPENAI_MODEL`），**密钥仅存在于服务端**

## 快速开始

前置：Node ≥ 18.18（推荐 20 / 22）。pnpm 通过 Node 自带的 corepack 启用：

```powershell
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v
```

```powershell
# 1. 准备环境变量：必须先建 .env，因为 pnpm install 的 postinstall 会执行 prisma generate
Copy-Item .env.example .env
# 2. 生成 SESSION_SECRET（至少 32 位）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 3. 把输出填进 .env 的 SESSION_SECRET，并按需填 OPENAI_API_KEY

# 4. 安装依赖（自动执行 prisma generate）
pnpm install

# 5. 初始化数据库（生成 prisma/dev.db）
pnpm exec prisma migrate dev --name init

# 6. 启动
pnpm dev
```

访问 http://localhost:3000 ；健康检查 http://localhost:3000/api/health

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 本地开发 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest 单测 |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm db:migrate` | Prisma 迁移 |
| `pnpm db:studio` | 可视化查看本地数据 |

阶段完成定义：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm test` **全部通过**，且零错误零警告。

## 环境变量

| 变量 | 必填 | 说明 | 示例 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 是 | 开发用 SQLite 文件；生产换 Postgres 连接串 | `file:./dev.db` |
| `SESSION_SECRET` | 是 | 会话密钥，≥ 32 字符 | 32 字节 hex |
| `OPENAI_API_KEY` | 是 | AI 服务密钥，**仅服务端使用** | `sk-...` |
| `OPENAI_BASE_URL` | 是 | OpenAI 兼容接口地址 | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 是 | 模型名 | `gpt-4o-mini` |
| `AI_DAILY_LIMIT` | 是 | 单用户每日 AI 调用上限（防刷） | `20` |
| `QUOTA_TOPIC` | 是 | 每月选题生成额度 | `10` |
| `QUOTA_SCRIPT` | 是 | 每月脚本生成额度 | `10` |
| `QUOTA_REVIEW` | 是 | 每月复盘生成额度 | `5` |
| `APP_BASE_URL` | 是 | 应用外部访问地址 | `http://localhost:3000` |

环境变量采用**延迟校验**：模块加载时不抛错，首次调用 `getEnv()` 时才用 Zod 校验并抛出 `EnvValidationError`；日志只输出变量名与原因，**不输出密钥值**。

## 健康检查分级

- 本地 / 预览：`GET /api/health` 返回 `{ status, db, ai, env, uptimeSec, checkedAt }`，其中 `ai` / `env` 只含布尔标记与长度
- 生产（`VERCEL_ENV=production`，或未设置时 `NODE_ENV=production`）：仅返回 `{ status }`
- 数据库不可用时 HTTP 状态为 `503`，`status` 为 `degraded`

## 目录结构

```
src/
  app/                  App Router：公开区 / (auth) / (app) / api
  components/
    layout/             AppShell、侧边导航、移动底栏
    ui/                 手写最小 UI 组件
  lib/
    api/                统一响应、错误码、路由包装器
    db/                 Prisma 单例
    constants.ts        平台 / 赛道等常量
    env.ts              环境变量延迟校验
prisma/schema.prisma    P0 仅 AppMeta
tests/                  Vitest 单测
docs/                   PRD / ARCHITECTURE / ROADMAP
```

## 阶段路线

详见 `docs/ROADMAP.md`：P0 骨架 → P1 认证与账号画像 → P2 选题推荐 → P3 标题脚本 → P4 数据复盘 → P5 打磨 → P6 上线。

## 合规红线

- 不做爬虫、不抓取平台数据、不采集平台账号密码或 Cookie
- 不做自动发布
- AI 输出仅作参考方向，不得宣称实时热榜或平台真实数据
## 常见问题

### `pnpm install` 卡住不动

默认 registry（registry.npmjs.org）在本机可能出现「元数据能访问、tarball 长时间无响应」的情况。改用国内镜像重试：

```powershell
corepack pnpm install --registry=https://registry.npmmirror.com
```

如需长期生效，在项目根目录新建 `.npmrc` 写入：

```
registry=https://registry.npmmirror.com
```

### pnpm 未安装

项目通过 Node 自带的 corepack 使用 pnpm（`packageManager` 字段锁定 9.15.0），无需全局安装：

```powershell
corepack pnpm install
```

若想直接使用 `pnpm` 命令，执行 `corepack enable` 后再 `corepack prepare pnpm@9 --activate`。

### 依赖的 postinstall 脚本没执行

pnpm 只会执行 `package.json` 中 `pnpm.onlyBuiltDependencies` 白名单内的构建脚本（已包含 `@prisma/client`、`@prisma/engines`、`prisma`、`esbuild`）。改动白名单后需要重新执行一次 `pnpm install`，否则 `prisma generate` 不会运行。