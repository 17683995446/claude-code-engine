import { describe, it, expect } from "bun:test"
import { ExponentialRetryPolicy } from "../../../src/core_infra/infra/exponential_retry_policy.ts"

describe("exponential_retry_policy", () => {
  it("should succeed on first attempt", () => {
    const rp: ExponentialRetryPolicy = new ExponentialRetryPolicy(2)
    const result: string = rp.execute(() => "ok")
    expect(result).toBe("ok")
  })

  it("should retry and succeed", () => {
    const rp: ExponentialRetryPolicy = new ExponentialRetryPolicy(2, 1, 10)
    let attempts: number = 0
    const result: string = rp.execute(() => {
      attempts += 1
      if (attempts < 2) {
        throw new Error("fail")
      }
      return "ok"
    })
    expect(result).toBe("ok")
    expect(attempts).toBe(2)
  })

  it("should throw after max retries", () => {
    const rp: ExponentialRetryPolicy = new ExponentialRetryPolicy(1, 1, 10)
    let attempts: number = 0
    expect(() => {
      rp.execute(() => {
        attempts += 1
        throw new Error("fail")
      })
    }).toThrow("fail")
    expect(attempts).toBe(2)
  })

  it("should report max retries", () => {
    const rp: ExponentialRetryPolicy = new ExponentialRetryPolicy(5)
    expect(rp.get_max_retries()).toBe(5)
  })
})
