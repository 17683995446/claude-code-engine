import { describe, it, expect } from "bun:test"
import { MemoryWorkflowEngine } from "../../../src/core_infra/infra/memory_workflow_engine.ts"

describe("memory_workflow_engine", () => {
  it("should execute single task", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    wf.define_task("a", [], "act")
    expect(wf.execute()).toEqual(["a"])
    expect(wf.get_status("a")).toBe("done")
  })

  it("should respect dependencies", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    wf.define_task("b", ["a"], "act")
    wf.define_task("a", [], "act")
    const order: string[] = wf.execute()
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"))
  })

  it("should execute parallel branches", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    wf.define_task("a", [], "act")
    wf.define_task("b", [], "act")
    wf.define_task("c", ["a", "b"], "act")
    const order: string[] = wf.execute()
    expect(order).toContain("a")
    expect(order).toContain("b")
    expect(order).toContain("c")
    expect(order.indexOf("c")).toBeGreaterThan(order.indexOf("a"))
    expect(order.indexOf("c")).toBeGreaterThan(order.indexOf("b"))
  })

  it("should mark cyclic deps as failed", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    wf.define_task("a", ["b"], "act")
    wf.define_task("b", ["a"], "act")
    wf.execute()
    expect(wf.get_status("a")).toBe("failed")
    expect(wf.get_status("b")).toBe("failed")
  })

  it("should return unknown for undefined task", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    expect(wf.get_status("x")).toBe("unknown")
  })
})
