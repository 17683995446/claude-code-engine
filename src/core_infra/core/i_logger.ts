import { LogLevel } from "../infra/log_level_enum.ts"

/**
 * Logger interface.
 *
 * Defines the contract for logging at various levels.
 */
export interface ILogger {
  /**
   * Log a debug message.
   *
   * @param message - The message to log.
   */
  log_debug(message: string): void

  /**
   * Log an info message.
   *
   * @param message - The message to log.
   */
  log_info(message: string): void

  /**
   * Log a warning message.
   *
   * @param message - The message to log.
   */
  log_warn(message: string): void

  /**
   * Log an error message.
   *
   * @param message - The message to log.
   */
  log_error(message: string): void

  /**
   * Set the minimum log level.
   *
   * @param level - The level to set.
   */
  set_level(level: LogLevel): void
}
