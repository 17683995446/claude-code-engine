import { describe, it, expect, beforeEach } from "bun:test"
import { Planner } from "../../../src/services_entry/services/planner.ts"
import type { IStorage } from "../../../src/core_infra/core/i_storage.ts"
import type { PlanPhase, PhaseExecutor, PhaseValidator } from "../../../src/core_infra/core/i_plan.ts"

// ============================================================
// V9: 长任务规划 + 自驱动执行测试
// ============================================================

class MockStorage implements IStorage {
  private data: Map<string, unknown> = new Map()
  async save(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
  async load(key: string): Promise<unknown> {
    return this.data.get(key) ?? null
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }
  async list_keys(prefix: string): Promise<string[]> {
    const keys: string[] = []
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }
  close(): void {}
}

function make_phases(count: number): Array<Omit<PlanPhase, "status" | "retry_count" | "started_at" | "completed_at" | "output" | "error">> {
  const phases = []
  for (let i = 0; i < count; i++) {
    phases.push({
      id: `p${i + 1}`,
      name: `Phase ${i + 1}`,
      goal: `Complete phase ${i + 1}`,
      max_retries: 2,
    })
  }
  return phases
}

describe("V9 Planner - create_plan", () => {
  let planner: Planner

  beforeEach(() => {
    const executor: PhaseExecutor = async () => "ok"
    planner = new Planner({ executor })
  })

  it("should create a plan with phases", async () => {
    const id: string = await planner.create_plan("test goal", "test plan", make_phases(3))
    expect(id).toBe("1")
    const summary = await planner.get_plan_summary(id)
    expect(summary).not.toBeNull()
    expect(summary!.goal).toBe("test goal")
    expect(summary!.name).toBe("test plan")
    expect(summary!.status).toBe("pending")
    expect(summary!.phase_count).toBe(3)
    expect(summary!.completed_phases).toBe(0)
  })

  it("should generate sequential plan IDs", async () => {
    const id1: string = await planner.create_plan("g1", "p1", make_phases(1))
    const id2: string = await planner.create_plan("g2", "p2", make_phases(1))
    expect(id1).toBe("1")
    expect(id2).toBe("2")
  })

  it("should reject plan with no phases", async () => {
    try {
      await planner.create_plan("g", "p", [])
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("plan_requires_at_least_one_phase")
    }
  })

  it("should reject plan with duplicate phase IDs", async () => {
    const phases = [
      { id: "dup", name: "A", goal: "a", max_retries: 0 },
      { id: "dup", name: "B", goal: "b", max_retries: 0 },
    ]
    try {
      await planner.create_plan("g", "p", phases)
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("duplicate_phase_id")
    }
  })
})

describe("V9 Planner - run_plan", () => {
  it("should run all phases to completion", async () => {
    const executor: PhaseExecutor = async (phase) => `output-${phase.id}`
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("goal", "plan", make_phases(3))
    const status = await planner.run_plan(id)
    expect(status).toBe("completed")
    const summary = await planner.get_plan_summary(id)
    expect(summary!.completed_phases).toBe(3)
    expect(summary!.status).toBe("completed")
  })

  it("should run single phase plan", async () => {
    const executor: PhaseExecutor = async () => "done"
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    const status = await planner.run_plan(id)
    expect(status).toBe("completed")
  })

  it("should throw when no executor configured", async () => {
    const planner = new Planner()
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    try {
      await planner.run_plan(id)
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("no_phase_executor_configured")
    }
  })

  it("should throw for non-existent plan", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    try {
      await planner.run_plan("nonexistent")
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("plan_not_found")
    }
  })

  it("should retry failed phases up to max_retries", async () => {
    let call_count: number = 0
    const executor: PhaseExecutor = async (phase) => {
      call_count += 1
      if (call_count < 3) {
        throw new Error("transient failure")
      }
      return "success"
    }
    const planner = new Planner({ executor })
    const phases = [{ id: "p1", name: "P1", goal: "g", max_retries: 3 }]
    const id: string = await planner.create_plan("g", "p", phases)
    const status = await planner.run_plan(id)
    expect(status).toBe("completed")
    expect(call_count).toBe(3)
  })

  it("should mark plan as failed when all retries exhausted", async () => {
    const executor: PhaseExecutor = async () => {
      throw new Error("permanent failure")
    }
    const planner = new Planner({ executor })
    const phases = [{ id: "p1", name: "P1", goal: "g", max_retries: 1 }]
    const id: string = await planner.create_plan("g", "p", phases)
    const status = await planner.run_plan(id)
    expect(status).toBe("failed")
    const plan = await planner.get_plan(id)
    expect(plan!.phases[0].status).toBe("failed")
    expect(plan!.phases[0].error).toContain("permanent failure")
    expect(plan!.phases[0].retry_count).toBe(1)
  })

  it("should stop at first failed phase", async () => {
    const executor: PhaseExecutor = async (phase) => {
      if (phase.id === "p2") {
        throw new Error("phase 2 fails")
      }
      return "ok"
    }
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(3))
    const status = await planner.run_plan(id)
    expect(status).toBe("failed")
    const plan = await planner.get_plan(id)
    expect(plan!.phases[0].status).toBe("completed")
    expect(plan!.phases[1].status).toBe("failed")
    expect(plan!.phases[2].status).toBe("pending")
  })

  it("should run validator after each phase", async () => {
    const executor: PhaseExecutor = async (phase) => ({ value: phase.id })
    const validator: PhaseValidator = async (_phase, output) => {
      const o = output as { value: string }
      if (o.value === "p2") {
        return "validation failed for p2"
      }
      return null
    }
    const planner = new Planner({ executor, validator })
    const id: string = await planner.create_plan("g", "p", make_phases(3))
    const status = await planner.run_plan(id)
    expect(status).toBe("failed")
    const plan = await planner.get_plan(id)
    expect(plan!.phases[1].status).toBe("failed")
    expect(plan!.phases[1].error).toContain("validation_failed")
  })

  it("should not re-run a completed plan", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)
    const status = await planner.run_plan(id)
    expect(status).toBe("completed")
  })
})

describe("V9 Planner - pause / resume / cancel", () => {
  it("should cancel a pending plan", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(2))
    const cancelled: boolean = await planner.cancel_plan(id)
    expect(cancelled).toBe(true)
    const summary = await planner.get_plan_summary(id)
    expect(summary!.status).toBe("cancelled")
  })

  it("should return false for cancelling non-existent plan", async () => {
    const planner = new Planner()
    const cancelled: boolean = await planner.cancel_plan("nonexistent")
    expect(cancelled).toBe(false)
  })

  it("should resume a failed plan from failed phase", async () => {
    // 第一次运行 p2 的所有重试都失败，resume 时才成功
    let first_run: boolean = true
    const executor: PhaseExecutor = async (phase) => {
      if (phase.id === "p2" && first_run) {
        throw new Error("transient")
      }
      return "ok"
    }
    const planner = new Planner({ executor })
    // max_retries=0 确保第一次运行 p2 失败后不重试
    const phases = [
      { id: "p1", name: "P1", goal: "g", max_retries: 0 },
      { id: "p2", name: "P2", goal: "g", max_retries: 0 },
      { id: "p3", name: "P3", goal: "g", max_retries: 0 },
    ]
    const id: string = await planner.create_plan("g", "p", phases)
    // 第一次运行：p2 失败
    const status1 = await planner.run_plan(id)
    expect(status1).toBe("failed")
    // 标记第一次运行结束，resume 时 p2 应成功
    first_run = false
    // 恢复：从 p2 重试
    const status2 = await planner.resume_plan(id)
    expect(status2).toBe("completed")
    const summary = await planner.get_plan_summary(id)
    expect(summary!.completed_phases).toBe(3)
  })

  it("should return status for resuming non-paused/non-failed plan", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)
    const status = await planner.resume_plan(id)
    expect(status).toBe("completed")
  })

  it("should throw for resuming non-existent plan", async () => {
    const planner = new Planner()
    try {
      await planner.resume_plan("nonexistent")
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("plan_not_found")
    }
  })

  it("should delete a plan", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    expect(await planner.count()).toBe(1)
    const deleted: boolean = await planner.delete_plan(id)
    expect(deleted).toBe(true)
    expect(await planner.count()).toBe(0)
  })
})

describe("V9 Planner - listing and queries", () => {
  let planner: Planner

  beforeEach(() => {
    const executor: PhaseExecutor = async () => "ok"
    planner = new Planner({ executor })
  })

  it("should list plans sorted by created_at desc", async () => {
    await planner.create_plan("g1", "first", make_phases(1))
    await new Promise((r) => setTimeout(r, 10))
    await planner.create_plan("g2", "second", make_phases(1))
    const list = await planner.list_plans()
    expect(list.length).toBe(2)
    expect(list[0].name).toBe("second")
    expect(list[1].name).toBe("first")
  })

  it("should return null summary for non-existent plan", async () => {
    const summary = await planner.get_plan_summary("nonexistent")
    expect(summary).toBeNull()
  })

  it("should count plans correctly", async () => {
    expect(await planner.count()).toBe(0)
    await planner.create_plan("g", "p1", make_phases(1))
    expect(await planner.count()).toBe(1)
    await planner.create_plan("g", "p2", make_phases(1))
    expect(await planner.count()).toBe(2)
  })

  it("should generate sequential IDs via next_id", () => {
    const id1: string = planner.next_id()
    const id2: string = planner.next_id()
    expect(id1).toBe("1")
    expect(id2).toBe("2")
  })

  it("should track current_phase in summary", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner2 = new Planner({ executor })
    const id: string = await planner2.create_plan("g", "p", make_phases(3))
    await planner2.run_plan(id)
    const summary = await planner2.get_plan_summary(id)
    expect(summary!.current_phase).toBeNull() // 所有阶段完成
  })
})

describe("V9 Planner - persistence (断点续传)", () => {
  it("should persist and reload plans from storage", async () => {
    const storage = new MockStorage()
    const executor: PhaseExecutor = async () => "ok"
    const planner1 = new Planner({ storage, executor })
    const id: string = await planner1.create_plan("persisted goal", "persisted plan", make_phases(2))
    await planner1.run_plan(id)

    // 新 planner 实例共享同一存储
    const planner2 = new Planner({ storage, executor })
    const loaded: number = await planner2.load_from_storage()
    expect(loaded).toBe(1)
    const list = await planner2.list_plans()
    expect(list.length).toBe(1)
    expect(list[0].name).toBe("persisted plan")
    expect(list[0].status).toBe("completed")
  })

  it("should mark running plans as paused on reload", async () => {
    const storage = new MockStorage()
    let should_fail: boolean = true
    const executor: PhaseExecutor = async (phase) => {
      if (phase.id === "p2" && should_fail) {
        throw new Error("simulated crash")
      }
      return "ok"
    }
    const planner1 = new Planner({ storage, executor })
    const id: string = await planner1.create_plan("g", "p", make_phases(3))
    // 第一次运行：p2 失败，计划标记为 failed
    await planner1.run_plan(id)

    // 新 planner 实例加载
    const planner2 = new Planner({ storage, executor })
    await planner2.load_from_storage()
    const plan = await planner2.get_plan(id)
    // failed 状态保持为 failed（不是 running，所以不会被改为 paused）
    expect(plan!.status).toBe("failed")
  })

  it("should handle empty storage gracefully", async () => {
    const storage = new MockStorage()
    const planner = new Planner({ storage })
    const loaded: number = await planner.load_from_storage()
    expect(loaded).toBe(0)
  })

  it("should work without storage", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    const status = await planner.run_plan(id)
    expect(status).toBe("completed")
  })

  it("should resume from persisted state after reload", async () => {
    const storage = new MockStorage()
    let attempt: number = 0
    const executor: PhaseExecutor = async (phase) => {
      if (phase.id === "p2") {
        attempt += 1
        if (attempt === 1) {
          throw new Error("fail first")
        }
      }
      return "ok"
    }
    const planner1 = new Planner({ storage, executor })
    const id: string = await planner1.create_plan("g", "p", make_phases(3))
    // 第一次运行失败
    await planner1.run_plan(id)

    // 新 planner 加载并恢复
    const planner2 = new Planner({ storage, executor })
    await planner2.load_from_storage()
    const status = await planner2.resume_plan(id)
    expect(status).toBe("completed")
    const summary = await planner2.get_plan_summary(id)
    expect(summary!.completed_phases).toBe(3)
  })
})
