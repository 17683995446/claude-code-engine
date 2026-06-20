import { describe, it, expect } from "bun:test"
import { TokenBucketLimiter } from "../../../src/core_infra/infra/token_bucket_limiter.ts"
import { CircuitBreaker } from "../../../src/core_infra/infra/circuit_breaker.ts"

describe("token_bucket normal", () => {
  it("should allow requests within limit", () => {
    const limiter = new TokenBucketLimiter(2, 1000)
    expect(limiter.try_acquire()).toBe(true)
    expect(limiter.try_acquire()).toBe(true)
    expect(limiter.try_acquire()).toBe(false)
  })
})

describe("token_bucket remaining", () => {
  it("should track remaining tokens", () => {
    const limiter = new TokenBucketLimiter(3, 1000)
    limiter.try_acquire()
    expect(limiter.remaining()).toBe(2)
  })
})

describe("circuit_breaker closed", () => {
  it("should execute normally when closed", () => {
    const cb = new CircuitBreaker(3, 1000)
    const result = cb.execute(() => "ok", "fallback")
    expect(result).toBe("ok")
    expect(cb.get_state()).toBe("closed")
  })
})

describe("circuit_breaker open", () => {
  it("should trip after threshold", () => {
    const cb = new CircuitBreaker(2, 1000)
    cb.record_failure()
    cb.record_failure()
    expect(cb.get_state()).toBe("open")
    const result = cb.execute(() => "ok", "fallback")
    expect(result).toBe("fallback")
  })
})

describe("circuit_breaker recovery", () => {
  it("should reset on success", () => {
    const cb = new CircuitBreaker(2, 1000)
    cb.record_failure()
    cb.record_success()
    expect(cb.get_state()).toBe("closed")
  })
})
