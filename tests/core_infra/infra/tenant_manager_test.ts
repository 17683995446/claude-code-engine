import { describe, it, expect } from "bun:test"
import { TenantManager } from "../../../src/core_infra/infra/tenant_manager.ts"

describe("tenant_manager normal", () => {
  it("should register and allow within quota", () => {
    const tm = new TenantManager()
    tm.register("t1", 100)
    expect(tm.allow("t1")).toBe(true)
    expect(tm.usage("t1")).toBe(1)
  })

  it("should deny over quota", () => {
    const tm = new TenantManager()
    tm.register("t1", 1)
    expect(tm.allow("t1")).toBe(true)
    expect(tm.allow("t1")).toBe(false)
  })

  it("should release and re-acquire", () => {
    const tm = new TenantManager()
    tm.register("t1", 1)
    expect(tm.allow("t1")).toBe(true)
    tm.release("t1")
    expect(tm.allow("t1")).toBe(true)
  })

  it("should deny unknown tenant", () => {
    const tm = new TenantManager()
    expect(tm.allow("unknown")).toBe(false)
    expect(tm.usage("unknown")).toBe(0)
  })

  it("should unregister tenant", () => {
    const tm = new TenantManager()
    tm.register("t1", 10)
    tm.unregister("t1")
    expect(tm.allow("t1")).toBe(false)
  })

  it("should preserve usage on re-register", () => {
    const tm = new TenantManager()
    tm.register("t1", 10)
    tm.allow("t1")
    tm.allow("t1")
    tm.register("t1", 5) // re-register should not reset usage
    expect(tm.usage("t1")).toBe(2)
  })
})

describe("tenant_manager rich quota (extension)", () => {
  it("should register with rich quota and check", () => {
    const tm = new TenantManager()
    tm.register_with_quota("t1", {
      max_messages: 100,
      max_requests_per_minute: 60,
      max_storage_mb: 10,
    })
    const ctx = tm.get_context("t1")
    expect(ctx).not.toBeNull()
    expect(ctx?.tenant_id).toBe("t1")
  })

  it("should allow within rich quota", () => {
    const tm = new TenantManager()
    tm.register_with_quota("t1", {
      max_messages: 100,
      max_requests_per_minute: 60,
      max_storage_mb: 10,
    })
    expect(tm.check_quota("t1", { messages: 50, requests: 30, storage_mb: 5 })).toBe(true)
  })

  it("should deny over rich quota", () => {
    const tm = new TenantManager()
    tm.register_with_quota("t1", {
      max_messages: 100,
      max_requests_per_minute: 60,
      max_storage_mb: 10,
    })
    expect(tm.check_quota("t1", { messages: 200, requests: 30, storage_mb: 5 })).toBe(false)
  })

  it("should deny unknown tenant in rich quota", () => {
    const tm = new TenantManager()
    expect(tm.check_quota("unknown", { messages: 0, requests: 0, storage_mb: 0 })).toBe(false)
  })
})
