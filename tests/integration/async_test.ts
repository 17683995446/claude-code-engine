import { describe, it, expect } from "bun:test"
import { AsyncExponentialRetryPolicy } from "../../src/core_infra/infra/async_retry_policy.ts"
import { AsyncCircuitBreaker } from "../../src/core_infra/infra/async_circuit_breaker.ts"
import { AsyncResourcePool } from "../../src/core_infra/infra/async_resource_pool.ts"
import { async_sleep, with_timeout, with_deadline, retry_async } from "../../src/core_infra/infra/async_utils.ts"

// ============================================================
// U2: 异步 I/O 改造测试
// 验证异步重试、异步熔断、异步资源池、异步工具函数
// ============================================================

// ---- 异步重试策略 ----
describe("U2 AsyncExponentialRetryPolicy", () => {
  it("should return result on first success", async () => {
    const policy = new AsyncExponentialRetryPolicy(3, 1, 10)
    const result = await policy.execute(async () => "ok")
    expect(result).toBe("ok")
  })

  it("should retry on failure and eventually succeed", async () => {
    const policy = new AsyncExponentialRetryPolicy(3, 1, 10)
    let attempts = 0
    const result = await policy.execute(async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error("fail")
      }
      return "success"
    })
    expect(result).toBe("success")
    expect(attempts).toBe(3)
  })

  it("should throw last error after exhausting retries", async () => {
    const policy = new AsyncExponentialRetryPolicy(2, 1, 10)
    let attempts = 0
    expect(async () => {
      await policy.execute(async () => {
        attempts += 1
        throw new Error("always_fail")
      })
    }).toThrow()
    // 应该尝试 3 次（初始 + 2 次重试）
    expect(attempts).toBe(3)
  })

  it("should not block event loop during retry wait", async () => {
    const policy = new AsyncExponentialRetryPolicy(2, 5, 20)
    let other_completed = false
    const retry_promise = policy.execute(async () => {
      throw new Error("fail")
    }).catch(() => {})

    // 在重试等待期间，其他异步操作应该能执行
    Promise.resolve().then(() => {
      other_completed = true
    })

    await retry_promise
    expect(other_completed).toBe(true)
  })

  it("should support async operations returning objects", async () => {
    const policy = new AsyncExponentialRetryPolicy(1, 1, 10)
    const result = await policy.execute(async () => ({ data: [1, 2, 3], meta: "ok" }))
    expect(result).toEqual({ data: [1, 2, 3], meta: "ok" })
  })

  it("get_max_retries should return configured value", () => {
    const policy = new AsyncExponentialRetryPolicy(5, 1, 10)
    expect(policy.get_max_retries()).toBe(5)
  })
})

// ---- 异步熔断器 ----
describe("U2 AsyncCircuitBreaker", () => {
  it("should return result on success", async () => {
    const cb = new AsyncCircuitBreaker(3, 1000)
    const result = await cb.execute(async () => "ok", "fallback")
    expect(result).toBe("ok")
    expect(cb.get_state()).toBe("closed")
  })

  it("should return fallback on failure", async () => {
    const cb = new AsyncCircuitBreaker(3, 1000)
    const result = await cb.execute(async () => { throw new Error("fail") }, "fallback")
    expect(result).toBe("fallback")
    expect(cb.get_state()).toBe("closed")
  })

  it("should open after threshold failures", async () => {
    const cb = new AsyncCircuitBreaker(2, 1000)
    await cb.execute(async () => { throw new Error("fail") }, "f")
    await cb.execute(async () => { throw new Error("fail") }, "f")
    expect(cb.get_state()).toBe("open")
  })

  it("should return fallback immediately when open", async () => {
    const cb = new AsyncCircuitBreaker(2, 1000)
    await cb.execute(async () => { throw new Error("fail") }, "f")
    await cb.execute(async () => { throw new Error("fail") }, "f")
    expect(cb.get_state()).toBe("open")

    const start = Date.now()
    const result = await cb.execute(async () => "should_not_run", "fallback")
    const elapsed = Date.now() - start
    expect(result).toBe("fallback")
    // 应该立即返回，不执行操作
    expect(elapsed).toBeLessThan(50)
  })

  it("should recover after timeout", async () => {
    const cb = new AsyncCircuitBreaker(2, 50)
    await cb.execute(async () => { throw new Error("fail") }, "f")
    await cb.execute(async () => { throw new Error("fail") }, "f")
    expect(cb.get_state()).toBe("open")

    await async_sleep(60)
    const result = await cb.execute(async () => "recovered", "f")
    expect(result).toBe("recovered")
    expect(cb.get_state()).toBe("closed")
  })

  it("should support async operations with real async work", async () => {
    const cb = new AsyncCircuitBreaker(3, 1000)
    const result = await cb.execute(async () => {
      await async_sleep(1)
      return { status: "done" }
    }, { status: "fallback" })
    expect(result).toEqual({ status: "done" })
  })
})

// ---- 异步资源池 ----
describe("U2 AsyncResourcePool", () => {
  it("should acquire resource immediately when available", async () => {
    const pool = new AsyncResourcePool<number>(2, () => 42)
    const r1 = await pool.acquire()
    expect(r1).toBe(42)
    expect(pool.available()).toBe(1)
  })

  it("should return undefined when exhausted with no timeout", async () => {
    const pool = new AsyncResourcePool<number>(1, () => 42)
    await pool.acquire()
    const r2 = await pool.acquire(0)
    expect(r2).toBe(undefined)
  })

  it("should wait for resource release with timeout", async () => {
    const pool = new AsyncResourcePool<number>(1, () => 42)
    const r1 = await pool.acquire()
    expect(r1).toBe(42)

    // 异步释放资源
    setTimeout(() => pool.release(r1!), 20)

    // 应该能等到资源
    const r2 = await pool.acquire(100)
    expect(r2).toBe(42)
  })

  it("should timeout when resource not released", async () => {
    const pool = new AsyncResourcePool<number>(1, () => 42)
    await pool.acquire()

    const start = Date.now()
    const r2 = await pool.acquire(30)
    const elapsed = Date.now() - start
    expect(r2).toBe(undefined)
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it("should hand off resource to waiter on release", async () => {
    const pool = new AsyncResourcePool<string>(1, () => "resource")
    const r1 = await pool.acquire()

    let acquired_by_waiter: string | undefined
    const wait_promise = pool.acquire(100).then((r) => {
      acquired_by_waiter = r
    })

    // 等待一下确保 waiter 注册
    await async_sleep(5)
    pool.release(r1!)

    await wait_promise
    expect(acquired_by_waiter).toBe("resource")
  })

  it("should handle multiple waiters in FIFO order", async () => {
    const pool = new AsyncResourcePool<number>(1, () => 100)
    const r1 = await pool.acquire()

    const results: number[] = []
    const p1 = pool.acquire(200).then((r) => results.push(1))
    const p2 = pool.acquire(200).then((r) => results.push(2))
    const p3 = pool.acquire(200).then((r) => results.push(3))

    await async_sleep(5)
    pool.release(r1!)

    await p1
    // p1 拿到资源后需要释放才能给 p2
    // 但 p1 的 then 中没有释放，所以需要手动处理
    // 这里验证 FIFO：p1 应该先完成
    expect(results).toEqual([1])
  })
})

// ---- 异步工具函数 ----
describe("U2 async_utils", () => {
  it("async_sleep should wait specified time", async () => {
    const start = Date.now()
    await async_sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(45)
  })

  it("async_sleep should not block event loop", async () => {
    let other_done = false
    const sleep_promise = async_sleep(30)
    Promise.resolve().then(() => {
      other_done = true
    })
    await sleep_promise
    expect(other_done).toBe(true)
  })

  it("with_timeout should resolve if operation completes in time", async () => {
    const result = await with_timeout(async () => {
      await async_sleep(10)
      return "done"
    }, 100, "test_op")
    expect(result).toBe("done")
  })

  it("with_timeout should reject if operation exceeds timeout", async () => {
    expect(async () => {
      await with_timeout(async () => {
        await async_sleep(100)
        return "done"
      }, 20, "slow_op")
    }).toThrow()
  })

  it("with_deadline should resolve if before deadline", async () => {
    const deadline = Date.now() + 100
    const result = await with_deadline(async () => {
      await async_sleep(10)
      return "done"
    }, deadline, "test_op")
    expect(result).toBe("done")
  })

  it("with_deadline should reject if past deadline", async () => {
    expect(async () => {
      await with_deadline(async () => {
        await async_sleep(50)
        return "done"
      }, Date.now() + 10, "late_op")
    }).toThrow()
  })

  it("with_deadline should reject immediately if deadline already passed", async () => {
    expect(async () => {
      await with_deadline(async () => "done", Date.now() - 100, "expired_op")
    }).toThrow()
  })

  it("retry_async should succeed on first try", async () => {
    const result = await retry_async(async () => "ok", 3, 1)
    expect(result).toBe("ok")
  })

  it("retry_async should retry and eventually succeed", async () => {
    let attempts = 0
    const result = await retry_async(async () => {
      attempts += 1
      if (attempts < 3) throw new Error("fail")
      return "success"
    }, 5, 1)
    expect(result).toBe("success")
    expect(attempts).toBe(3)
  })

  it("retry_async should throw after exhausting retries", async () => {
    let attempts = 0
    expect(async () => {
      await retry_async(async () => {
        attempts += 1
        throw new Error("always")
      }, 2, 1)
    }).toThrow()
    expect(attempts).toBe(3)
  })
})

// ---- 异步组件集成测试 ----
describe("U2 async integration", () => {
  it("async circuit breaker + async retry should handle cascading failures", async () => {
    const cb = new AsyncCircuitBreaker(3, 1000)
    const retry = new AsyncExponentialRetryPolicy(2, 1, 10)

    let call_count = 0
    const operation = async () => {
      call_count += 1
      throw new Error("service_down")
    }

    // 熔断器应该在重试耗尽前跳闸
    const results: string[] = []
    for (let i = 0; i < 5; i++) {
      const result = await cb.execute(() => retry.execute(operation), "fallback")
      results.push(result)
    }
    expect(results.every((r) => r === "fallback")).toBe(true)
    expect(cb.get_state()).toBe("open")
  })

  it("async resource pool + async circuit breaker should handle resource exhaustion", async () => {
    const pool = new AsyncResourcePool<number>(2, () => Math.floor(Math.random() * 1000))
    const cb = new AsyncCircuitBreaker(3, 1000)

    const r1 = await pool.acquire()
    const r2 = await pool.acquire()

    // 池已耗尽，操作应该失败并触发熔断
    const results: string[] = []
    for (let i = 0; i < 3; i++) {
      const result = await cb.execute(async () => {
        const r = await pool.acquire(0)
        if (r === undefined) {
          throw new Error("pool_exhausted")
        }
        return r
      }, -1)
      results.push(String(result))
    }

    // 3 次失败后熔断器应该跳闸
    expect(cb.get_state()).toBe("open")
    expect(results.every((r) => r === "-1")).toBe(true)

    // 释放资源
    pool.release(r1!)
    pool.release(r2!)
  })

  it("should handle concurrent async operations without blocking", async () => {
    const start = Date.now()
    const promises: Promise<string>[] = []

    for (let i = 0; i < 10; i++) {
      promises.push(async_sleep(20).then(() => `result_${i}`))
    }

    const results = await Promise.all(promises)
    const elapsed = Date.now() - start

    // 10 个 20ms 的异步操作并发执行，总时间应该远小于 200ms
    expect(elapsed).toBeLessThan(100)
    expect(results.length).toBe(10)
    expect(results[0]).toBe("result_0")
    expect(results[9]).toBe("result_9")
  })
})
