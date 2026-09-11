export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/** 客户端统一的接口调用封装：网络异常也会转成统一的失败结构，避免各处 try/catch。 */
export async function apiRequest<T = unknown>(
  url: string,
  init?: { method?: string; body?: string },
): Promise<ApiEnvelope<T>> {
  try {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: init?.body,
    });

    const payload = (await response.json()) as ApiEnvelope<T>;
    return payload;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "网络异常，请稍后重试" } };
  }
}