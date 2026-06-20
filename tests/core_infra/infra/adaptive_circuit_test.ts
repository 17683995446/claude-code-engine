import { describe, it, expect } from "bun:test"
import { AdaptiveCircuitBreaker } from "../../../src/core_infra/infra/adaptive_circuit_breaker.ts"
import { AdaptiveRateLimiter } from "../../../src/core_infra/infra/adaptive_rate_limiter.ts"

describe("adaptive_circuit_breaker", () => {
  it("should return success on normal operation", () => {
    const cb: AdaptiveCircuitBreaker = new AdaptiveCircuitBreaker(3, 1000)
    const result: string = cb.execute(() => "ok", "fallback")
    expect(result).toBe("ok")
    expect(cb.get_state()).toBe("closed")
  })

  it("should open after threshold failures", () => {
    const cb: AdaptiveCircuitBreaker = new AdaptiveCircuitBreaker(2, 1000)
    cb.execute(() => { throw new Error("fail") }, "f")
    cb.execute(() => { throw new Error("fail") }, "f")
    expect(cb.get_state()).toBe("open")
  })

  it("should decrease threshold after trip", () => {
    const cb: AdaptiveCircuitBreaker = new AdaptiveCircuitBreaker(2, 1000, 1, 5)
    cb.execute(() => { throw new Error("fail") }, "f")
    cb.execute(() => { throw new Error("fail") }, "f")
    expect(cb.get_threshold()).toBeLessThan(2)
  })

  it("should decrease threshold after recovery", async () => {
    const cb: AdaptiveCircuitBreaker = new AdaptiveCircuitBreaker(2, 50, 1, 5)
    cb.execute(() => { throw new Error("fail") }, "f")
    cb.execute(() => { throw new Error("fail") }, "f")
    expect(cb.get_state()).toBe("open")
    await new Promise((r) => setTimeout(r, 60))
    cb.execute(() => "ok", "f")
    expect(cb.get_state()).toBe("closed")
  })
})

describe("adaptive_rate_limiter", () => {
  it("should allow initial requests", () => {
    const rl: AdaptiveRateLimiter = new AdaptiveRateLimiter(5, 1000)
    expect(rl.try_acquire()).toBe(true)
  })

  it("should reduce rate on errors", () => {
    const rl: AdaptiveRateLimiter = new AdaptiveRateLimiter(10, 1000)
    for (let i: number = 0; i < 10; i++) {
      rl.report_error()
    }
    expect(rl.get_current_rate()).toBeLessThan(10)
  })

  it("should increase rate on successes", () => {
    const rl: AdaptiveRateLimiter = new AdaptiveRateLimiter(10, 1000)
    for (let i: number = 0; i < 10; i++) {
      rl.report_error()
    }
    const reduced: number = rl.get_current_rate()
    for (let i: number = 0; i < 10; i++) {
      rl.report_success()
    }
    expect(rl.get_current_rate()).toBeGreaterThanOrEqual(reduced)
  })
})
