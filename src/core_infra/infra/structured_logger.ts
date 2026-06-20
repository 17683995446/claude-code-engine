import { log_debug, log_info, log_warn, log_error } from "./global_logger.ts"

/**
 * 结构化日志条目。
 */
export interface StructuredLogEntry {
  timestamp: string
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  message: string
  fields: Record<string, unknown>
  trace_id?: string
  request_id?: string
}

/**
 * StructuredLogger - 结构化日志记录器。
 *
 * 输出 JSON 格式的结构化日志，支持 trace_id、request_id、自定义字段。
 * 与 global_logger 兼容，同时提供更丰富的上下文信息。
 */
export class StructuredLogger {
  private trace_id: string | undefined
  private request_id: string | undefined
  private default_fields: Record<string, unknown> = {}

  set_trace_id(trace_id: string | undefined): void {
    this.trace_id = trace_id
  }

  set_request_id(request_id: string | undefined): void {
    this.request_id = request_id
  }

  set_default_fields(fields: Record<string, unknown>): void {
    this.default_fields = { ...fields }
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.emit("DEBUG", message, fields)
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.emit("INFO", message, fields)
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.emit("WARN", message, fields)
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.emit("ERROR", message, fields)
  }

  private emit(level: StructuredLogEntry["level"], message: string, fields: Record<string, unknown>): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      fields: { ...this.default_fields, ...fields },
    }
    if (this.trace_id) {
      entry.trace_id = this.trace_id
    }
    if (this.request_id) {
      entry.request_id = this.request_id
    }

    // 输出可读格式到 global_logger（受全局级别过滤）
    const prefix = `[${entry.trace_id ?? "-"}]`
    const full_message = `${prefix} ${message} ${JSON.stringify(entry.fields)}`

    switch (level) {
      case "DEBUG":
        log_debug(full_message)
        break
      case "INFO":
        log_info(full_message)
        break
      case "WARN":
        log_warn(full_message)
        break
      case "ERROR":
        log_error(full_message)
        break
    }
  }

  /**
   * 创建带上下文的子 logger。
   */
  child(fields: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger()
    child.trace_id = this.trace_id
    child.request_id = this.request_id
    child.default_fields = { ...this.default_fields, ...fields }
    return child
  }
}
