import { describe, it, expect } from "bun:test"
import { AlertManager } from "../../../src/core_infra/infra/alert_manager.ts"
import { MemoryNotifier } from "../../../src/core_infra/infra/memory_notifier.ts"
import type { IAlertRule } from "../../../src/core_infra/core/i_alert_manager.ts"

class TrueRule implements IAlertRule {
  readonly name: string = "true_rule"
  condition(): boolean {
    return true
  }
  message(): string {
    return "alert fired"
  }
}

class FalseRule implements IAlertRule {
  readonly name: string = "false_rule"
  condition(): boolean {
    return false
  }
  message(): string {
    return "should not fire"
  }
}

class BadRule implements IAlertRule {
  readonly name: string = "bad_rule"
  condition(): boolean {
    throw new Error("fail")
  }
  message(): string {
    return "bad"
  }
}

describe("alert_manager normal", () => {
  it("should evaluate and notify", () => {
    const notifier: MemoryNotifier = new MemoryNotifier()
    const manager: AlertManager = new AlertManager(notifier)
    manager.register(new TrueRule(), "ch1")
    manager.evaluate()
    expect(notifier.get_messages("ch1")).toContain("alert fired")
  })
})

describe("alert_manager boundary", () => {
  it("should not notify when condition false", () => {
    const notifier: MemoryNotifier = new MemoryNotifier()
    const manager: AlertManager = new AlertManager(notifier)
    manager.register(new FalseRule(), "ch1")
    manager.evaluate()
    expect(notifier.get_messages("ch1").length).toBe(0)
  })
})

describe("alert_manager invalid", () => {
  it("should isolate rule failure", () => {
    const notifier: MemoryNotifier = new MemoryNotifier()
    const manager: AlertManager = new AlertManager(notifier)
    manager.register(new BadRule(), "ch1")
    manager.register(new TrueRule(), "ch1")
    manager.evaluate()
    expect(notifier.get_messages("ch1")).toContain("alert fired")
  })
})

describe("alert_manager null edge", () => {
  it("should handle no rules", () => {
    const notifier: MemoryNotifier = new MemoryNotifier()
    const manager: AlertManager = new AlertManager(notifier)
    manager.evaluate()
    expect(notifier.get_messages("ch1").length).toBe(0)
  })
})

describe("alert_manager list", () => {
  it("should list rules", () => {
    const notifier: MemoryNotifier = new MemoryNotifier()
    const manager: AlertManager = new AlertManager(notifier)
    manager.register(new TrueRule(), "ch1")
    expect(manager.list_rules()).toContain("true_rule")
  })
})
