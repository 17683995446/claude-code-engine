import type { ErrorCode } from "./error_code_enum.ts"

/**
 * Standard application exception interface.
 *
 * V14: 增加 description 和 suggestion 字段，提供友好错误信息。
 */
export interface IAppException {
  code: ErrorCode
  message: string
  timestamp: number
  /** V14: 人类可读的错误描述 */
  description: string
  /** V14: 可操作的修复建议 */
  suggestion: string
}

/**
 * Exception handler interface.
 */
export interface IExceptionHandler {
  /**
   * Handle an exception and return a standardized response.
   *
   * @param error - The error to handle.
   * @returns The standardized exception object.
   */
  handle(error: unknown): IAppException

  /**
   * Throw a standardized exception.
   *
   * @param code - The error code.
   * @param message - The error message.
   */
  throw_exception(code: ErrorCode, message: string): never
}
