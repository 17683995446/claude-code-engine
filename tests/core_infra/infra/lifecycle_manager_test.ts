import { describe, it, expect } from "bun:test"
import { LifecycleManager } from "../../../src/core_infra/infra/lifecycle_manager.ts"
import type { ILifecycle } from "../../../src/core_infra/core/i_lifecycle.ts"

class FakeModule implements ILifecycle {
  started: boolean = false
  init(): void { this.started = false }
  start(): void { this.started = true }
  stop(): void { this.started = false }
  is_running(): boolean { return this.started }
}

describe("lifecycle_manager normal", () => {
  it("should manage module lifecycle", () => {
    const manager = new LifecycleManager()
    const mod = new FakeModule()
    manager.register(mod)
    manager.init()
    expect(mod.is_running()).toBe(false)
    manager.start()
    expect(mod.is_running()).toBe(true)
    manager.stop()
    expect(mod.is_running()).toBe(false)
  })
})

describe("lifecycle_manager state", () => {
  it("should reflect running state", () => {
    const manager = new LifecycleManager()
    expect(manager.is_running()).toBe(false)
    manager.start()
    expect(manager.is_running()).toBe(true)
    manager.stop()
    expect(manager.is_running()).toBe(false)
  })
})
