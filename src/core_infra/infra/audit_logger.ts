import { log_info, log_warn } from "./global_logger.ts"
import type { IAuditLogger, AuditEvent, AuditFilter } from "../core/i_audit_logger.ts"

export class AuditLogger implements IAuditLogger {
  private events: AuditEvent[] = []
  private readonly max_size: number

  constructor(max_size: number = 1000) {
    log_info(`audit_logger_created: max=${max_size}`)
    this.max_size = max_size
  }

  record(event: AuditEvent): void {
    log_info(`audit_record: ${event.actor} ${event.action}`)
    this.events.push(event)
    if (this.events.length > this.max_size) {
      log_warn(`audit_rotate: ${this.events.length}`)
      this.events.shift()
    }
  }

  query(filter: AuditFilter): AuditEvent[] {
    log_info(`audit_query: actor=${filter.actor} action=${filter.action}`)
    return this.events
      .filter((e: AuditEvent) => this.matches(e, filter))
      .map((e: AuditEvent) => ({ ...e }))
  }

  export(): string {
    log_info(`audit_export: ${this.events.length}`)
    return this.events.map((e: AuditEvent) => JSON.stringify(e)).join("\n")
  }

  private matches(event: AuditEvent, filter: AuditFilter): boolean {
    if (filter.actor && event.actor !== filter.actor) return false
    if (filter.action && event.action !== filter.action) return false
    if (filter.resource && event.resource !== filter.resource) return false
    if (filter.result && event.result !== filter.result) return false
    if (filter.since && event.timestamp < filter.since) return false
    if (filter.until && event.timestamp > filter.until) return false
    return true
  }
}
