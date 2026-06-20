import { ErrorCode } from "../core/error_code_enum.js"
import { get_error_info } from "../core/error_code_descriptions.js"
import type { FriendlyErrorInfo } from "../core/error_code_descriptions.js"
import type { IAppException } from "../core/i_exception_handler.js"

/**
 * V14: 统一友好错误响应体。
 *
 * 所有 API 错误响应应使用此格式，包含错误码、描述和修复建议。
 */
export interface FriendlyErrorResponse {
  /** 错误分类（字符串，向后兼容） */
  error: string
  /** 错误码数值 */
  code: number
  /** 错误码名称 */
  name: string
  /** 具体错误消息 */
  message: string
  /** 人类可读的错误描述 */
  description: string
  /** 可操作的修复建议 */
  suggestion: string
}

/**
 * V14: 将错误码转换为错误分类字符串（用于 error 字段，向后兼容）。
 */
function code_to_error_string(code: ErrorCode): string {
  const name: string = ErrorCode[code] ?? "UNKNOWN_ERROR"
  return name.toLowerCase()
}

/**
 * V14: 构建友好错误响应体。
 *
 * @param code - 错误码
 * @param message - 具体错误消息（可选，默认使用描述）
 * @returns 友好错误响应对象
 */
export function build_error_response(code: ErrorCode, message?: string): FriendlyErrorResponse {
  const info: FriendlyErrorInfo = get_error_info(code)
  return {
    error: code_to_error_string(code),
    code: info.code,
    name: info.name,
    message: message ?? info.description,
    description: info.description,
    suggestion: info.suggestion,
  }
}

/**
 * V14: 从 IAppException 构建友好错误响应体。
 */
export function build_error_response_from_exception(exc: IAppException): FriendlyErrorResponse {
  return {
    error: code_to_error_string(exc.code),
    code: exc.code,
    name: ErrorCode[exc.code] ?? "UNKNOWN",
    message: exc.message,
    description: exc.description,
    suggestion: exc.suggestion,
  }
}

/**
 * V14: 从未知错误构建友好错误响应体。
 *
 * 尝试从错误消息中提取错误码，否则使用 UNKNOWN_ERROR。
 */
export function build_error_response_from_unknown(error: unknown): FriendlyErrorResponse {
  if (error instanceof Error) {
    const msg: string = error.message
    // 尝试从消息中提取 4 位数字错误码
    const match: RegExpMatchArray | null = msg.match(/\b(1[0-9]{3}|2[0-9]{3})\b/)
    if (match) {
      const code: number = parseInt(match[1], 10)
      if (code in ErrorCode) {
        return build_error_response(code as ErrorCode, msg)
      }
    }
    return build_error_response(ErrorCode.UNKNOWN_ERROR, msg)
  }
  return build_error_response(ErrorCode.UNKNOWN_ERROR, String(error))
}

/**
 * V14: 格式化错误为人类可读的多行字符串（用于 CLI 输出）。
 */
export function format_error_text(code: ErrorCode, message?: string): string {
  const info: FriendlyErrorInfo = get_error_info(code)
  const lines: string[] = [
    `Error [${info.name}]: ${message ?? info.description}`,
    `  Code: ${info.code}`,
    `  Description: ${info.description}`,
    `  Suggestion: ${info.suggestion}`,
  ]
  return lines.join("\n")
}
