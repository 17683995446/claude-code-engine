import { log_error } from "./global_logger.js"
import { ErrorCode } from "../core/error_code_enum.js"
import { get_error_description, get_error_suggestion } from "../core/error_code_descriptions.js"
import type { IExceptionHandler, IAppException } from "../core/i_exception_handler.js"

/**
 * V14: AppException - 携带友好错误信息的应用异常。
 *
 * 构造时自动从错误码映射表填充 description 和 suggestion。
 */
export class AppException extends Error implements IAppException {
  code: ErrorCode
  timestamp: number
  description: string
  suggestion: string

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
    this.timestamp = Date.now()
    this.description = get_error_description(code)
    this.suggestion = get_error_suggestion(code)
  }
}

/**
 * V14: ExceptionHandler - 统一异常处理器。
 *
 * 将任意 unknown 错误转换为携带友好信息的 IAppException。
 */
export class ExceptionHandler implements IExceptionHandler {
  handle(error: unknown): IAppException {
    log_error(`exception_handler_handle: ${error}`)
    if (error instanceof AppException) {
      return error
    }
    if (error instanceof Error) {
      const mapped = this.map_error_to_code(error)
      return new AppException(mapped.code, mapped.message)
    }
    return new AppException(ErrorCode.UNKNOWN_ERROR, String(error))
  }

  throw_exception(code: ErrorCode, message: string): never {
    log_error(`exception_handler_throw: ${code} - ${message}`)
    throw new AppException(code, message)
  }

  private map_error_to_code(error: Error): { code: ErrorCode; message: string } {
    const msg = error.message
    if (msg.includes("1001")) return { code: ErrorCode.INVALID_ARGUMENT, message: msg }
    if (msg.includes("1002")) return { code: ErrorCode.MISSING_ARGUMENT, message: msg }
    if (msg.includes("1004")) return { code: ErrorCode.OUT_OF_RANGE, message: msg }
    if (msg.includes("1100")) return { code: ErrorCode.AUTH_UNAUTHORIZED, message: msg }
    if (msg.includes("1200")) return { code: ErrorCode.SHELL_COMMAND_FAILED, message: msg }
    if (msg.includes("1300")) return { code: ErrorCode.API_REQUEST_FAILED, message: msg }
    if (msg.includes("1400")) return { code: ErrorCode.FILE_NOT_FOUND, message: msg }
    if (msg.includes("1500")) return { code: ErrorCode.CONFIG_MISSING, message: msg }
    if (msg.includes("1501")) return { code: ErrorCode.CONFIG_INVALID, message: msg }
    if (msg.includes("1600")) return { code: ErrorCode.MESSAGE_PARSE_ERROR, message: msg }
    return { code: ErrorCode.UNKNOWN_ERROR, message: msg }
  }
}
