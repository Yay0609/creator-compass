import { ApiError } from "./api-error";
import { ErrorCode } from "./error-codes";

/** 解析 JSON 请求体；格式错误统一转成 400，而不是抛未处理异常。 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(ErrorCode.BAD_REQUEST, "请求体不是合法的 JSON");
  }
}