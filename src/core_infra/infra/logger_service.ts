import { AbcBase } from "../core/abc_base.ts"
import { LogLevel } from "./log_level_enum.ts"
import type { ILogger } from "../core/i_logger.ts"

export class LoggerService extends AbcBase implements ILogger {
  private log_level: LogLevel
  private silent: boolean = false

  constructor(level: LogLevel) {
    super()
    this.log_level = level
  }

  validate(): boolean {
    return this.log_level >= LogLevel.DEBUG && this.log_level <= LogLevel.ERROR
  }

  to_object(): Record<string, unknown> {
    return { log_level: this.log_level, silent: this.silent }
  }

  set_level(level: LogLevel): void {
    this.log_level = level
  }

  get_level(): LogLevel {
    return this.log_level
  }

  /**
   * V13: 设置静默模式。
   *
   * 静默模式下，所有日志输出被抑制（不输出到 stdout），
   * 但 log_* 调用本身仍可正常执行（不抛异常）。
   */
  set_silent(silent: boolean): void {
    this.silent = silent
  }

  is_silent(): boolean {
    return this.silent
  }

  log(level: LogLevel, message: string): void {
    if (this.silent) {
      return
    }
    if (level < this.log_level) {
      return
    }

    this.output_log(level, message)
  }

  private output_log(level: LogLevel, message: string): void {
    const timestamp: string = new Date().toISOString()
    const level_name: string = LogLevel[level]

    console.log(`[${timestamp}] [${level_name}] ${message}`)
  }

  log_debug(message: string): void {
    this.log(LogLevel.DEBUG, message)
  }

  log_info(message: string): void {
    this.log(LogLevel.INFO, message)
  }

  log_warn(message: string): void {
    this.log(LogLevel.WARN, message)
  }

  log_error(message: string): void {
    this.log(LogLevel.ERROR, message)
  }
}
