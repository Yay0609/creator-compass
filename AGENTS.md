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
pnpm build
pnpm test
```

## 3. 安全红线

- `OPENAI_API_KEY` 等密钥**只能存在于服务端**：禁止写入 `NEXT_PUBLIC_*`、禁止传入客户端组件、禁止打进日志。
- 会话令牌只以哈希（sha256）形式落库，明文仅存在于 httpOnly Cookie。
- 密码使用 bcrypt 哈希，禁止明文或可逆加密存储。
- Cookie 必须带 `httpOnly`、`secure`（生产环境）、`sameSite: "lax"`。
- **所有资源查询必须带 `userId`**（形如 `where: { id, userId }`），禁止先按 id 查出再判断归属。
- 响应中禁止回显密钥、令牌、密码哈希；`/api/health` 只输出标记与长度。

## 4. 明确的非目标（不要实现）

- 不做爬虫、不抓取平台数据、不采集平台账号密码或 Cookie
- 不做自动发布、不接入平台 OAuth
- 不做社区、关注、私信、评论
- 不做小程序、不做原生 App

## 5. 代码约定

- TypeScript strict，不使用 `any`；必要时用 `@ts-expect-error` 并写明原因，禁止 `@ts-ignore`。
- 所有外部输入（请求体、查询参数、CSV、AI 返回）必须经 Zod 校验后才能进入业务逻辑。
- **AI 输出必须通过 Zod 校验**：失败自动重试 1 次，再失败则降级为可编辑草稿，并在响应中标记 `degraded: true`。
- 服务端统一响应体：`{ ok: true, data }` 或 `{ ok: false, error: { code, message, details? } }`；错误码集中在 `src/lib/api/error-codes.ts`。
- 路由处理器统一用 `withRoute()` 包装，禁止各写一套裸 `try/catch`。
- 环境变量只能通过 `src/lib/env.ts` 的 `getEnv()` 读取，禁止散落 `process.env.XXX`（`NODE_ENV` / `VERCEL_ENV` 除外）。
- 新增依赖前先说明理由，优先复用已有依赖；不引入 Tailwind v4、NextAuth、shadcn CLI 等与当前栈冲突的方案。
- 注释与面向用户的文案统一使用中文。

## 6. 目录约定

- 页面：`src/app/**`（公开区在根，认证在 `(auth)`，应用区在 `(app)`）
- 组件：`src/components/**`（`ui/` 通用原子组件，`layout/` 框架级组件）
- 服务端能力：`src/lib/**`（`api/`、`db/`，后续 `auth/`、`ai/`、`csv/`）
- 数据模型：`prisma/schema.prisma`；业务模型按阶段新增，**禁止提前建表**
- 测试：`tests/**`

## 7. 禁止的操作

- 禁止执行 `git push`、`vercel deploy` 等对外发布动作（由人类执行）
- 禁止 `rm -rf`、`prisma migrate reset`、删除项目目录外的文件、修改系统目录
- 禁止提交 `.env` 与 `*.db`

## 8. 文档

设计变更先改文档再改代码：

- `docs/PRD.md` —— 产品需求
- `docs/ARCHITECTURE.md` —— 技术方案
- `docs/ROADMAP.md` —— 阶段计划