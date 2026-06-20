import { describe, it, expect } from "bun:test"
import { MemoryDegradation } from "../../../src/core_infra/infra/memory_degradation.ts"

describe("memory_degradation", () => {
  it("should keep all active at low load", () => {
    const d: MemoryDegradation = new MemoryDegradation()
    d.register("core", 0)
    d.register("analytics", 2)
    d.report_load(30)
    expect(d.is_active("core")).toBe(true)
    expect(d.is_active("analytics")).toBe(true)
    expect(d.get_degraded().length).toBe(0)
  })

  it("should degrade low priority at medium load", () => {
    const d: MemoryDegradation = new MemoryDegradation()
    d.register("core", 0)
    d.register("cache", 1)
    d.register("analytics", 2)
    d.report_load(70)
    expect(d.is_active("core")).toBe(true)
    expect(d.is_active("cache")).toBe(true)
    expect(d.is_active("analytics")).toBe(false)
  })

  it("should degrade non-core at high load", () => {
    const d: MemoryDegradation = new MemoryDegradation()
    d.register("core", 0)
    d.register("cache", 1)
    d.report_load(90)
    expect(d.is_active("core")).toBe(true)
    expect(d.is_active("cache")).toBe(false)
  })

  it("should list degraded features", () => {
    const d: MemoryDegradation = new MemoryDegradation()
    d.register("analytics", 2)
    d.report_load(70)
    expect(d.get_degraded()).toContain("analytics")
  })

  it("should allow unknown features", () => {
    const d: MemoryDegradation = new MemoryDegradation()
    d.report_load(90)
    expect(d.is_active("unknown")).toBe(true)
  })
})
