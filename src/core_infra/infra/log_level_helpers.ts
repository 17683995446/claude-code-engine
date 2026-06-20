import { LogLevel } from "./log_level_enum.ts"

/**
 * V13: 日志级别辅助工具。
 *
 * 提供 LogLevel 枚举与字符串之间的双向转换，
 * 统一 CLI 层（小写字符串）与基础设施层（数字枚举）的级别表示。
 */

/** 所有合法的日志级别名称（小写）。 */
export const LOG_LEVEL_NAMES: readonly string[] = ["debug", "info", "warn", "error"] as const

/**
 * 判断字符串是否为合法的日志级别名称。
 * 大小写不敏感。
 */
export function is_valid_log_level(s: string): boolean {
  if (s.length === 0) return false
  const lower: string = s.toLowerCase()
  return LOG_LEVEL_NAMES.includes(lower)
}

/**
 * 将字符串解析为 LogLevel 枚举值。
 *
 * 支持大小写不敏感输入，如 "INFO" / "info" / "Info" 均映射到 LogLevel.INFO。
 * 非法输入返回 default_level（默认 LogLevel.INFO）。
 */
export function parse_log_level(s: string, default_level: LogLevel = LogLevel.INFO): LogLevel {
  if (s.length === 0) return default_level
  const lower: string = s.toLowerCase()
  switch (lower) {
    case "debug":
      return LogLevel.DEBUG
    case "info":
      return LogLevel.INFO
    case "warn":
    case "warning":
      return LogLevel.WARN
    case "error":
      return LogLevel.ERROR
    default:
      return default_level
  }
}

/**
 * 将 LogLevel 枚举值转换为小写字符串。
 */
export function log_level_to_string(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return "debug"
    case LogLevel.INFO:
      return "info"
    case LogLevel.WARN:
      return "warn"
    case LogLevel.ERROR:
      return "error"
    default:
      return "info"
  }
}
