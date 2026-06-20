import { describe, it, expect } from "bun:test"
import { MemoryTenantManager } from "../../../src/core_infra/infra/memory_tenant_manager.ts"

describe("memory_tenant_manager", () => {
  it("should allow within quota", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    tm.register("t1", 2)
    expect(tm.allow("t1")).toBe(true)
    expect(tm.allow("t1")).toBe(true)
  })

  it("should deny over quota", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    tm.register("t1", 1)
    tm.allow("t1")
    expect(tm.allow("t1")).toBe(false)
  })

  it("should deny unknown tenant", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    expect(tm.allow("unknown")).toBe(false)
  })

  it("should track usage", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    tm.register("t1", 5)
    tm.allow("t1")
    tm.allow("t1")
    expect(tm.usage("t1")).toBe(2)
  })

  it("should release quota", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    tm.register("t1", 1)
    tm.allow("t1")
    tm.release("t1")
    expect(tm.allow("t1")).toBe(true)
  })

  it("should isolate tenants", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    tm.register("a", 1)
    tm.register("b", 1)
    tm.allow("a")
    expect(tm.allow("b")).toBe(true)
  })
})
