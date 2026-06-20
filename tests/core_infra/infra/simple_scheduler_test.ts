import { describe, it, expect } from "bun:test"
import { SimpleScheduler } from "../../../src/core_infra/infra/simple_scheduler.ts"
import type { IScheduledTask } from "../../../src/core_infra/core/i_scheduler.ts"

class CounterTask implements IScheduledTask {
  readonly id: string
  readonly interval_ms: number = 20
  enabled: boolean = true
  count: number = 0

  constructor(id: string) {
    this.id = id
  }

  async execute(): Promise<void> {
    this.count++
  }
}

class FailTask implements IScheduledTask {
  readonly id: string = "fail"
  readonly interval_ms: number = 20
  enabled: boolean = true

  async execute(): Promise<void> {
    throw new Error("fail")
  }
}

describe("simple_scheduler normal", () => {
  it("should run task periodically", async () => {
    const scheduler: SimpleScheduler = new SimpleScheduler()
    const task: CounterTask = new CounterTask("t1")
    scheduler.register(task)
    scheduler.start()
    await new Promise((res) => setTimeout(res, 70))
    scheduler.stop()
    expect(task.count).toBeGreaterThanOrEqual(2)
  })
})

describe("simple_scheduler boundary", () => {
  it("should not run disabled task", async () => {
    const scheduler: SimpleScheduler = new SimpleScheduler()
    const task: CounterTask = new CounterTask("t2")
    task.enabled = false
    scheduler.register(task)
    scheduler.start()
    await new Promise((res) => setTimeout(res, 50))
    scheduler.stop()
    expect(task.count).toBe(0)
  })
})

describe("simple_scheduler invalid", () => {
  it("should isolate task failure", async () => {
    const scheduler: SimpleScheduler = new SimpleScheduler()
    const good: CounterTask = new CounterTask("good")
    const bad: FailTask = new FailTask()
    scheduler.register(good)
    scheduler.register(bad)
    scheduler.start()
    await new Promise((res) => setTimeout(res, 70))
    scheduler.stop()
    expect(good.count).toBeGreaterThanOrEqual(2)
  })
})

describe("simple_scheduler null edge", () => {
  it("should unregister task", async () => {
    const scheduler: SimpleScheduler = new SimpleScheduler()
    const task: CounterTask = new CounterTask("t3")
    scheduler.register(task)
    scheduler.start()
    await new Promise((res) => setTimeout(res, 30))
    scheduler.unregister("t3")
    const before: number = task.count
    await new Promise((res) => setTimeout(res, 50))
    expect(task.count).toBe(before)
  })
})

describe("simple_scheduler state", () => {
  it("should reflect running state", () => {
    const scheduler: SimpleScheduler = new SimpleScheduler()
    expect(scheduler.is_running()).toBe(false)
    scheduler.start()
    expect(scheduler.is_running()).toBe(true)
    scheduler.stop()
    expect(scheduler.is_running()).toBe(false)
  })
})
