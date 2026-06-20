import { describe, it, expect } from "bun:test"
import { ChaosEngine } from "../../../src/core_infra/infra/chaos_engine.ts"

describe("chaos_engine", () => {
  it("should not inject when disabled", () => {
    const chaos = new ChaosEngine()
    chaos.set_enabled(false)
    expect(() => chaos.inject(1.0)).not.toThrow()
  })

  it("should inject when enabled and probability is 1", () => {
    const chaos = new ChaosEngine()
    expect(() => chaos.inject(1.0)).toThrow("chaos_injected_failure")
  })

  it("should delay when enabled", async () => {
    const chaos = new ChaosEngine()
    chaos.set_enabled(true)
    const start = Date.now()
    await chaos.delay(10)
    expect(Date.now() - start).toBeLessThan(20)
  })
})
