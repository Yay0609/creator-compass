import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startedAt = Date.now();

/** 生产环境（Vercel production 或裸 NODE_ENV=production）只返回状态，不暴露内部信息。 */
function isProductionLike(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv === "production";
  }
  return process.env.NODE_ENV === "production";
}

export const GET = withRoute(async () => {
  // 延迟校验：这里才读取并校验环境变量，缺失时由 withRoute 统一兜底
  const env = getEnv();

  let db: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    await prisma.appMeta.count();
  } catch (error) {
    db = "error";
    dbError = error instanceof Error ? error.message : String(error);
  }

  const status = db === "ok" ? 200 : 503;

  if (isProductionLike()) {
    return ok({ status: db === "ok" ? "ok" : "degraded" }, { status });
  }

  return ok(
    {
      status: db === "ok" ? "ok" : "degraded",
      db,
      dbError,
      ai: {
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
        apiKeyConfigured: env.OPENAI_API_KEY.length > 0,
      },
      env: {
        appBaseUrl: env.APP_BASE_URL,
        databaseUrlConfigured: env.DATABASE_URL.length > 0,
        sessionSecretLength: env.SESSION_SECRET.length,
        aiDailyLimit: env.AI_DAILY_LIMIT,
        quota: {
          topic: env.QUOTA_TOPIC,
          script: env.QUOTA_SCRIPT,
          review: env.QUOTA_REVIEW,
        },
      },
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      checkedAt: new Date().toISOString(),
    },
    { status },
  );
});