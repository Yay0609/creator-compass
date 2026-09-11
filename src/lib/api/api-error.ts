import { DEFAULT_ERROR_MESSAGE, ErrorCode } from "./error-codes";

/** 业务可预期错误。抛出后由 withRoute() 统一转换为响应体。 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? DEFAULT_ERROR_MESSAGE[code]);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}