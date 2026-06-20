/**
 * Audit event level.
 */
export type AuditLevel = "info" | "warn" | "error"

/**
 * Audit event type.
 */
export type AuditEvent = {
  timestamp: number
  level: AuditLevel
  actor: string
  action: string
  resource: string
  result: "success" | "failure"
}

/**
 * Audit filter type.
 */
export type AuditFilter = {
  actor?: string
  action?: string
  resource?: string
  result?: "success" | "failure"
  since?: number
  until?: number
}

/**
 * Audit logger interface.
 *
 * Defines the contract for recording and querying audit events.
 */
export interface IAuditLogger {
  /**
   * Record an audit event.
   *
   * @param event - The event to record.
   */
  record(event: AuditEvent): void

  /**
   * Query audit events by filter.
   *
   * @param filter - The filter criteria.
   * @returns Matching events.
   */
  query(filter: AuditFilter): AuditEvent[]

  /**
   * Export all events as JSONL string.
   *
   * @returns JSONL formatted events.
   */
  export(): string
}
