import { LoggerService } from "./logger_service.ts"
import { LogLevel } from "./log_level_enum.ts"
import { parse_log_level } from "./log_level_helpers.ts"

const GLOBAL_LOGGER: LoggerService = new LoggerService(LogLevel.DEBUG)

export function log_debug(message: string): void {
  GLOBAL_LOGGER.log_debug(message)
}

export function log_info(message: string): void {
  GLOBAL_LOGGER.log_info(message)
}

export function log_warn(message: string): void {
  GLOBAL_LOGGER.log_warn(message)
}

export function log_error(message: string): void {
  GLOBAL_LOGGER.log_error(message)
}

/**
 * V13: 设置全局 logger 的最低日志级别。
 */
export function set_global_level(level: LogLevel): void {
  GLOBAL_LOGGER.set_level(level)
}

/**
 * V13: 获取全局 logger 的当前日志级别。
 */
export function get_global_level(): LogLevel {
  return GLOBAL_LOGGER.get_level()
}

/**
 * V13: 便捷配置全局 logger。
 *
 * 接受字符串（如 "info"、"WARN"、"debug"）或 LogLevel 枚举值。
 * 字符串大小写不敏感，非法值回退到 LogLevel.INFO。
 */
export function configure_global_logger(level: string | LogLevel): void {
  if (typeof level === "string") {
    GLOBAL_LOGGER.set_level(parse_log_level(level))
  } else {
    GLOBAL_LOGGER.set_level(level)
  }
}

/**
 * V13: 设置全局 logger 静默模式。
 *
 * 静默模式下所有日志输出被抑制，适用于测试或纯 API 调用场景。
 */
export function set_global_silent(silent: boolean): void {
  GLOBAL_LOGGER.set_silent(silent)
}

/**
 * V13: 查询全局 logger 是否处于静默模式。
 */
export function is_global_silent(): boolean {
  return GLOBAL_LOGGER.is_silent()
}
