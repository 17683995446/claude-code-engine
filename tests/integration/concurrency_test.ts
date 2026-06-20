import { describe, it, expect } from "bun:test"
import { AsyncTaskQueue } from "../../src/core_infra/infra/async_task_queue.ts"
import { AsyncLock, AsyncSemaphore } from "../../src/core_infra/infra/async_lock.ts"
import { async_sleep } from "../../src/core_infra/infra/async_utils.ts"

// ============================================================
// U3: 并发模型测试
// 异步任务队列、异步锁、异步信号量
// ============================================================

// ---- 异步任务队列 ----
describe("U3 AsyncTaskQueue", () => {
  it("should execute tasks sequentially with concurrency=1", async () => {
    const queue = new AsyncTaskQueue<number>(1)
    const order: number[] = []

    const p1 = queue.submit(async () => {
      await async_sleep(10)
      order.push(1)
      return 1
    })
    const p2 = queue.submit(async () => {
      await async_sleep(5)
      order.push(2)
      return 2
    })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(1)
    expect(r2).toBe(2)
    // concurrency=1 时应该顺序执行
    expect(order).toEqual([1, 2])
  })

  it("should execute tasks concurrently with concurrency>1", async () => {
    const queue = new AsyncTaskQueue<number>(3)
    const order: string[] = []

    const p1 = queue.submit(async () => {
      await async_sleep(20)
      order.push("p1_done")
      return 1
    })
    const p2 = queue.submit(async () => {
      await async_sleep(20)
      order.push("p2_done")
      return 2
    })
    const p3 = queue.submit(async () => {
      await async_sleep(20)
      order.push("p3_done")
      return 3
    })

    const start = Date.now()
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    const elapsed = Date.now() - start

    expect(r1).toBe(1)
    expect(r2).toBe(2)
    expect(r3).toBe(3)
    // 3 个 20ms 任务并发执行，总时间应该接近 20ms 而非 60ms
    expect(elapsed).toBeLessThan(50)
  })

  it("should prioritize tasks by priority", async () => {
    const queue = new AsyncTaskQueue<string>(1)
    const order: string[] = []

    // 先占用队列
    const p0 = queue.submit(async () => {
      await async_sleep(10)
      return "first"
    }, 10)

    // 提交低优先级任务
    const p1 = queue.submit(async () => {
      order.push("low")
      return "low"
    }, 1)

    // 提交高优先级任务
    const p2 = queue.submit(async () => {
      order.push("high")
      return "high"
    }, 10)

    await p0
    await Promise.all([p1, p2])

    // 高优先级应该先执行
    expect(order).toEqual(["high", "low"])
  })

  it("should handle task errors without breaking queue", async () => {
    const queue = new AsyncTaskQueue<number>(1)

    const p1 = queue.submit(async () => {
      throw new Error("task_fail")
    })
    const p2 = queue.submit(async () => 42)

    await expect(p1).rejects.toThrow("task_fail")
    const r2 = await p2
    expect(r2).toBe(42)
  })

  it("should track pending and active counts", async () => {
    const queue = new AsyncTaskQueue<number>(2)
    expect(queue.pending()).toBe(0)
    expect(queue.active()).toBe(0)

    const p1 = queue.submit(async () => {
      await async_sleep(50)
      return 1
    })
    const p2 = queue.submit(async () => {
      await async_sleep(50)
      return 2
    })
    // submit 是同步的，schedule 也是同步的，提交后立即检查
    expect(queue.active()).toBe(2)
    expect(queue.pending()).toBe(0)

    const p3 = queue.submit(async () => {
      await async_sleep(50)
      return 3
    })
    expect(queue.active()).toBe(2)
    expect(queue.pending()).toBe(1)

    await Promise.all([p1, p2, p3])
    // 等待微任务完成
    await Promise.resolve()
    expect(queue.active()).toBe(0)
    expect(queue.pending()).toBe(0)
  })

  it("wait_all should resolve when all tasks complete", async () => {
    const queue = new AsyncTaskQueue<number>(2)

    queue.submit(async () => {
      await async_sleep(10)
      return 1
    })
    queue.submit(async () => {
      await async_sleep(15)
      return 2
    })
    queue.submit(async () => {
      await async_sleep(5)
      return 3
    })

    await queue.wait_all()
    expect(queue.active()).toBe(0)
    expect(queue.pending()).toBe(0)
  })

  it("should handle 50 tasks with concurrency=5", async () => {
    const queue = new AsyncTaskQueue<number>(5)
    const promises: Promise<number>[] = []

    for (let i = 0; i < 50; i++) {
      promises.push(queue.submit(async () => {
        await async_sleep(1)
        return i
      }))
    }

    const results = await Promise.all(promises)
    expect(results.length).toBe(50)
    // 所有任务都应该完成
    const sum = results.reduce((a, b) => a + b, 0)
    expect(sum).toBe(1225) // 0+1+...+49
  })
})

// ---- 异步锁 ----
describe("U3 AsyncLock", () => {
  it("should acquire lock when free", async () => {
    const lock = new AsyncLock()
    expect(lock.is_locked()).toBe(false)
    const got = await lock.acquire()
    expect(got).toBe(true)
    expect(lock.is_locked()).toBe(true)
  })

  it("should fail to acquire when locked with no timeout", async () => {
    const lock = new AsyncLock()
    await lock.acquire()
    const got = await lock.acquire(0)
    expect(got).toBe(false)
  })

  it("should wait and acquire after release", async () => {
    const lock = new AsyncLock()
    await lock.acquire()

    let acquired = false
    const wait_promise = lock.acquire(100).then((r) => {
      acquired = r
    })

    await async_sleep(5)
    expect(acquired).toBe(false)

    lock.release()
    await wait_promise
    expect(acquired).toBe(true)
  })

  it("should timeout when lock not released", async () => {
    const lock = new AsyncLock()
    await lock.acquire()

    const start = Date.now()
    const got = await lock.acquire(30)
    const elapsed = Date.now() - start

    expect(got).toBe(false)
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it("should hand off lock to waiter on release", async () => {
    const lock = new AsyncLock()
    await lock.acquire()

    let waiter_got = false
    const wait_promise = lock.acquire(100).then((r) => {
      waiter_got = r
    })

    await async_sleep(5)
    lock.release()

    await wait_promise
    expect(waiter_got).toBe(true)
    // 锁应该传递给等待者，仍然锁定
    expect(lock.is_locked()).toBe(true)
  })

  it("should handle multiple waiters in FIFO order", async () => {
    const lock = new AsyncLock()
    await lock.acquire()

    const order: number[] = []
    const p1 = lock.acquire(200).then((r) => { if (r) order.push(1) })
    const p2 = lock.acquire(200).then((r) => { if (r) order.push(2) })
    const p3 = lock.acquire(200).then((r) => { if (r) order.push(3) })

    await async_sleep(5)
    lock.release() // 给 p1

    await async_sleep(5)
    // p1 拿到锁后需要释放才能给 p2
    // 但 p1 的 then 中没有释放，所以需要手动处理
    // 这里验证 p1 先拿到
    expect(order).toEqual([1])

    // 释放给 p2
    lock.release()
    await async_sleep(5)
    expect(order).toEqual([1, 2])

    lock.release()
    await async_sleep(5)
    expect(order).toEqual([1, 2, 3])

    await Promise.all([p1, p2, p3])
  })

  it("should not error on release when not locked", async () => {
    const lock = new AsyncLock()
    expect(() => lock.release()).not.toThrow()
  })
})

// ---- 异步信号量 ----
describe("U3 AsyncSemaphore", () => {
  it("should acquire permits up to max", async () => {
    const sem = new AsyncSemaphore(3)
    expect(await sem.acquire()).toBe(true)
    expect(await sem.acquire()).toBe(true)
    expect(await sem.acquire()).toBe(true)
    expect(sem.available()).toBe(0)
  })

  it("should fail when permits exhausted with no timeout", async () => {
    const sem = new AsyncSemaphore(1)
    await sem.acquire()
    const got = await sem.acquire(0)
    expect(got).toBe(false)
  })

  it("should release and allow new acquire", async () => {
    const sem = new AsyncSemaphore(1)
    await sem.acquire()
    sem.release()
    expect(sem.available()).toBe(1)
    const got = await sem.acquire()
    expect(got).toBe(true)
  })

  it("should wait for permit with timeout", async () => {
    const sem = new AsyncSemaphore(1)
    await sem.acquire()

    let acquired = false
    const wait_promise = sem.acquire(100).then((r) => {
      acquired = r
    })

    await async_sleep(5)
    expect(acquired).toBe(false)

    sem.release()
    await wait_promise
    expect(acquired).toBe(true)
  })

  it("should timeout when no permit available", async () => {
    const sem = new AsyncSemaphore(1)
    await sem.acquire()

    const start = Date.now()
    const got = await sem.acquire(30)
    const elapsed = Date.now() - start

    expect(got).toBe(false)
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it("should throw for invalid permits", () => {
    expect(() => new AsyncSemaphore(0)).toThrow()
    expect(() => new AsyncSemaphore(-1)).toThrow()
  })

  it("should handle concurrent access with limited permits", async () => {
    const sem = new AsyncSemaphore(3)
    let concurrent = 0
    let max_concurrent = 0

    const tasks: Promise<void>[] = []
    for (let i = 0; i < 10; i++) {
      tasks.push((async () => {
        const got = await sem.acquire(500)
        if (!got) return
        concurrent += 1
        max_concurrent = Math.max(max_concurrent, concurrent)
        await async_sleep(10)
        concurrent -= 1
        sem.release()
      })())
    }

    await Promise.all(tasks)
    // 最大并发不应该超过 3
    expect(max_concurrent).toBeLessThanOrEqual(3)
  })
})

// ---- 并发模型集成测试 ----
describe("U3 concurrency integration", () => {
  it("task queue + lock should serialize critical sections", async () => {
    const queue = new AsyncTaskQueue<number>(3) // 3 并发
    const lock = new AsyncLock()
    let shared_value = 0
    let max_concurrent = 0
    let current = 0

    const tasks: Promise<number>[] = []
    for (let i = 0; i < 10; i++) {
      tasks.push(queue.submit(async () => {
        const got = await lock.acquire(500)
        if (!got) {
          throw new Error("lock_timeout")
        }
        current += 1
        max_concurrent = Math.max(max_concurrent, current)
        const old = shared_value
        await async_sleep(2)
        shared_value = old + 1
        current -= 1
        lock.release()
        return shared_value
      }))
    }

    const results = await Promise.all(tasks)
    // 临界区被锁保护，最大并发应该是 1
    expect(max_concurrent).toBe(1)
    // shared_value 应该正确递增到 10
    expect(shared_value).toBe(10)
    expect(results[9]).toBe(10)
  })

  it("semaphore should limit concurrent resource access", async () => {
    const sem = new AsyncSemaphore(2)
    const queue = new AsyncTaskQueue<string>(5) // 队列并发 5，但信号量限制 2
    let concurrent = 0
    let max_concurrent = 0

    const tasks: Promise<string>[] = []
    for (let i = 0; i < 10; i++) {
      tasks.push(queue.submit(async () => {
        const got = await sem.acquire(500)
        if (!got) return "timeout"
        concurrent += 1
        max_concurrent = Math.max(max_concurrent, concurrent)
        await async_sleep(10)
        concurrent -= 1
        sem.release()
        return "done"
      }))
    }

    const results = await Promise.all(tasks)
    expect(max_concurrent).toBeLessThanOrEqual(2)
    expect(results.every((r) => r === "done")).toBe(true)
  })
})
