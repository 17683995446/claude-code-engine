import { describe, it, expect } from "bun:test"
import { AuditLogger } from "../../../src/core_infra/infra/audit_logger.ts"
import type { AuditEvent } from "../../../src/core_infra/core/i_audit_logger.ts"

function make_event(actor: string, action: string, result: "success" | "failure" = "success"): AuditEvent {
  return {
    timestamp: Date.now(),
    level: "info",
    actor,
    action,
    resource: "res",
    result,
  }
}

describe("audit_logger normal", () => {
  it("should record and query", () => {
    const logger: AuditLogger = new AuditLogger()
    logger.record(make_event("alice", "login"))
    logger.record(make_event("bob", "logout"))
    const results = logger.query({ actor: "alice" })
    expect(results.length).toBe(1)
    expect(results[0].action).toBe("login")
  })
})

describe("audit_logger boundary", () => {
  it("should filter by action", () => {
    const logger: AuditLogger = new AuditLogger()
    logger.record(make_event("alice", "login"))
    logger.record(make_event("alice", "delete"))
    const results = logger.query({ action: "delete" })
    expect(results.length).toBe(1)
    expect(results[0].actor).toBe("alice")
  })
})

describe("audit_logger invalid", () => {
  it("should return empty for no match", () => {
    const logger: AuditLogger = new AuditLogger()
    logger.record(make_event("alice", "login"))
    const results = logger.query({ actor: "charlie" })
    expect(results.length).toBe(0)
  })
})

describe("audit_logger null edge", () => {
  it("should export empty", () => {
    const logger: AuditLogger = new AuditLogger()
    expect(logger.export()).toBe("")
  })
})

describe("audit_logger rotation", () => {
  it("should rotate over max size", () => {
    const logger: AuditLogger = new AuditLogger(3)
    logger.record(make_event("a", "1"))
    logger.record(make_event("b", "2"))
    logger.record(make_event("c", "3"))
    logger.record(make_event("d", "4"))
    const results = logger.query({})
    expect(results.length).toBe(3)
    expect(results[0].actor).toBe("b")
  })
})

describe("audit_logger export", () => {
  it("should export as jsonl", () => {
    const logger: AuditLogger = new AuditLogger()
    logger.record(make_event("alice", "login"))
    const exported: string = logger.export()
    expect(exported.includes("alice")).toBe(true)
    expect(exported.includes("\n")).toBe(false)
  })
})
