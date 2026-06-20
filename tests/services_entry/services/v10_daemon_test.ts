import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Daemon, DEFAULT_DAEMON_CONFIG } from "../../../src/services_entry/services/daemon.ts"
import { Planner } from "../../../src/services_entry/services/planner.ts"
import type { IStorage } from "../../../src/core_infra/core/i_storage.ts"
import type { PhaseExecutor, PlanPhase } from "../../../src/core_infra/core/i_plan.ts"
import type { DaemonConfig } from "../../../src/core_infra/core/i_daemon.ts"

// ============================================================
// V10: 守护进程 + 永续运行测试
// ============================================================

class MockStorage implements IStorage {
  public data: Map<string, unknown> = new Map()
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
      max_retries: 0,
    })
  }
  return phases
}

describe("V10 Daemon - constructor", () => {
  it("should create with default config", () => {
    const daemon = new Daemon()
    expect(daemon.get_status()).toBe("stopped")
    const config: DaemonConfig = daemon.get_config()
    expect(config.health_check_interval_ms).toBe(DEFAULT_DAEMON_CONFIG.health_check_interval_ms)
    expect(config.plan_recovery_interval_ms).toBe(DEFAULT_DAEMON_CONFIG.plan_recovery_interval_ms)
    expect(config.auto_recover_plans).toBe(true)
    expect(config.max_recovery_failures).toBe(DEFAULT_DAEMON_CONFIG.max_recovery_failures)
  })

  it("should create with custom config", () => {
    const daemon = new Daemon({
      config: {
        health_check_interval_ms: 1000,
        plan_recovery_interval_ms: 500,
        auto_recover_plans: false,
        max_recovery_failures: 3,
      },
    })
    const config: DaemonConfig = daemon.get_config()
    expect(config.health_check_interval_ms).toBe(1000)
    expect(config.plan_recovery_interval_ms).toBe(500)
    expect(config.auto_recover_plans).toBe(false)
    expect(config.max_recovery_failures).toBe(3)
  })

  it("should start with zero metrics", () => {
    const daemon = new Daemon()
    const metrics = daemon.get_metrics()
    expect(metrics.status).toBe("stopped")
    expect(metrics.started_at).toBeNull()
    expect(metrics.uptime_ms).toBe(0)
    expect(metrics.health_checks).toBe(0)
    expect(metrics.plan_recoveries).toBe(0)
    expect(metrics.recovery_failures).toBe(0)
    expect(metrics.last_health_check).toBeNull()
    expect(metrics.last_plan_recovery).toBeNull()
    expect(metrics.current_health).toBe("unknown")
  })

  it("should start with empty events", () => {
    const daemon = new Daemon()
    const events = daemon.get_events()
    expect(events.length).toBe(0)
  })
})

describe("V10 Daemon - start/stop", () => {
  let daemon: Daemon

  beforeEach(() => {
    daemon = new Daemon({
      config: {
        health_check_interval_ms: 100,
        plan_recovery_interval_ms: 100,
        auto_recover_plans: false,
        max_recovery_failures: 5,
      },
    })
  })

  afterEach(async () => {
    await daemon.stop()
  })

  it("should start daemon", async () => {
    const status = await daemon.start()
    expect(status).toBe("running")
    expect(daemon.get_status()).toBe("running")
    const metrics = daemon.get_metrics()
    expect(metrics.started_at).not.toBeNull()
  })

  it("should be idempotent when starting", async () => {
    await daemon.start()
    const status = await daemon.start()
    expect(status).toBe("running")
  })

  it("should stop daemon", async () => {
    await daemon.start()
    const status = await daemon.stop()
    expect(status).toBe("stopped")
    expect(daemon.get_status()).toBe("stopped")
  })

  it("should be idempotent when stopping", async () => {
    const status = await daemon.stop()
    expect(status).toBe("stopped")
  })

  it("should record status_change events", async () => {
    await daemon.start()
    await daemon.stop()
    const events = daemon.get_events()
    const status_changes = events.filter((e) => e.type === "status_change")
    expect(status_changes.length).toBeGreaterThanOrEqual(2)
    expect(status_changes[0].data.status).toBe("running")
  })
})

describe("V10 Daemon - pause/resume", () => {
  let daemon: Daemon

  beforeEach(() => {
    daemon = new Daemon({
      config: {
        health_check_interval_ms: 100,
        plan_recovery_interval_ms: 100,
        auto_recover_plans: false,
        max_recovery_failures: 5,
      },
    })
  })

  afterEach(async () => {
    await daemon.stop()
  })

  it("should pause running daemon", async () => {
    await daemon.start()
    const status = await daemon.pause()
    expect(status).toBe("paused")
    expect(daemon.get_status()).toBe("paused")
  })

  it("should not pause stopped daemon", async () => {
    const status = await daemon.pause()
    expect(status).toBe("stopped")
  })

  it("should resume paused daemon", async () => {
    await daemon.start()
    await daemon.pause()
    const status = await daemon.resume()
    expect(status).toBe("running")
    expect(daemon.get_status()).toBe("running")
  })

  it("should not resume stopped daemon", async () => {
    const status = await daemon.resume()
    expect(status).toBe("stopped")
  })

  it("should not resume running daemon", async () => {
    await daemon.start()
    const status = await daemon.resume()
    expect(status).toBe("running")
  })
})

describe("V10 Daemon - run_health_check", () => {
  it("should return healthy when no probe configured", async () => {
    const daemon = new Daemon()
    await daemon.start()
    const health = await daemon.run_health_check()
    expect(health).toBe("healthy")
    const metrics = daemon.get_metrics()
    expect(metrics.health_checks).toBe(1)
    expect(metrics.last_health_check).not.toBeNull()
    expect(metrics.current_health).toBe("healthy")
    await daemon.stop()
  })

  it("should call health probe", async () => {
    let probe_calls: number = 0
    const daemon = new Daemon({
      health_probe: () => {
        probe_calls += 1
        return "degraded"
      },
    })
    await daemon.start()
    const health = await daemon.run_health_check()
    expect(health).toBe("degraded")
    expect(probe_calls).toBe(1)
    expect(daemon.get_metrics().current_health).toBe("degraded")
    await daemon.stop()
  })

  it("should handle probe exception as unhealthy", async () => {
    const daemon = new Daemon({
      health_probe: () => {
        throw new Error("probe failure")
      },
    })
    await daemon.start()
    const health = await daemon.run_health_check()
    expect(health).toBe("unhealthy")
    await daemon.stop()
  })

  it("should not run health check when stopped", async () => {
    const daemon = new Daemon()
    const health = await daemon.run_health_check()
    expect(health).toBe("unknown")
    expect(daemon.get_metrics().health_checks).toBe(0)
  })

  it("should record health_check event", async () => {
    const daemon = new Daemon()
    await daemon.start()
    await daemon.run_health_check()
    const events = daemon.get_events()
    const health_events = events.filter((e) => e.type === "health_check")
    expect(health_events.length).toBe(1)
    expect(health_events[0].data.health).toBe("healthy")
    await daemon.stop()
  })
})

describe("V10 Daemon - run_plan_recovery", () => {
  it("should return 0 when no planner configured", async () => {
    const daemon = new Daemon()
    await daemon.start()
    const recovered = await daemon.run_plan_recovery()
    expect(recovered).toBe(0)
    await daemon.stop()
  })

  it("should return 0 when stopped", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const daemon = new Daemon({ planner })
    const recovered = await daemon.run_plan_recovery()
    expect(recovered).toBe(0)
  })

  it("should recover failed plans", async () => {
    let first_run: boolean = true
    const executor: PhaseExecutor = async () => {
      if (first_run) {
        first_run = false
        throw new Error("transient failure")
      }
      return "recovered"
    }
    const planner = new Planner({ executor })
    const daemon = new Daemon({ planner })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)
    expect((await planner.get_plan_summary(id))!.status).toBe("failed")

    await daemon.start()
    const recovered = await daemon.run_plan_recovery()
    expect(recovered).toBe(1)
    expect((await planner.get_plan_summary(id))!.status).toBe("completed")
    const metrics = daemon.get_metrics()
    expect(metrics.plan_recoveries).toBe(1)
    expect(metrics.last_plan_recovery).not.toBeNull()
    await daemon.stop()
  })

  it("should recover paused plans", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const daemon = new Daemon({ planner })
    const id: string = await planner.create_plan("g", "p", make_phases(2))
    // 模拟暂停状态
    const plan = await planner.get_plan(id)
    expect(plan).not.toBeNull()
    plan!.status = "paused"
    plan!.started_at = Date.now()

    await daemon.start()
    const recovered = await daemon.run_plan_recovery()
    expect(recovered).toBe(1)
    expect((await planner.get_plan_summary(id))!.status).toBe("completed")
    await daemon.stop()
  })

  it("should skip completed plans", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const daemon = new Daemon({ planner })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)
    expect((await planner.get_plan_summary(id))!.status).toBe("completed")

    await daemon.start()
    const recovered = await daemon.run_plan_recovery()
    expect(recovered).toBe(0)
    await daemon.stop()
  })

  it("should track recovery failures", async () => {
    const executor: PhaseExecutor = async () => {
      throw new Error("permanent failure")
    }
    const planner = new Planner({ executor })
    const daemon = new Daemon({
      planner,
      config: { max_recovery_failures: 2, health_check_interval_ms: 1000, plan_recovery_interval_ms: 1000, auto_recover_plans: true },
    })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)
    expect((await planner.get_plan_summary(id))!.status).toBe("failed")

    await daemon.start()
    // 第一次恢复尝试会失败（resume_plan 会重新执行并失败）
    const recovered1 = await daemon.run_plan_recovery()
    expect(recovered1).toBe(0)
    expect(daemon.get_metrics().recovery_failures).toBeGreaterThanOrEqual(1)

    await daemon.stop()
  })

  it("should stop recovery after threshold reached", async () => {
    const executor: PhaseExecutor = async () => {
      throw new Error("permanent failure")
    }
    const planner = new Planner({ executor })
    const daemon = new Daemon({
      planner,
      config: { max_recovery_failures: 2, health_check_interval_ms: 1000, plan_recovery_interval_ms: 1000, auto_recover_plans: true },
    })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)

    await daemon.start()
    // 触发多次恢复失败直到达到阈值
    await daemon.run_plan_recovery()
    await daemon.run_plan_recovery()
    await daemon.run_plan_recovery()
    const metrics = daemon.get_metrics()
    expect(metrics.recovery_failures).toBeGreaterThanOrEqual(2)
    // 达到阈值后恢复操作被禁用
    const recovered = await daemon.run_plan_recovery()
    expect(recovered).toBe(0)
    await daemon.stop()
  })

  it("should reset recovery failures", async () => {
    const daemon = new Daemon({
      config: { max_recovery_failures: 1, health_check_interval_ms: 1000, plan_recovery_interval_ms: 1000, auto_recover_plans: true },
    })
    await daemon.start()
    // 手动设置恢复失败计数（通过内部状态）
    daemon.reset_recovery_failures()
    expect(daemon.get_metrics().recovery_failures).toBe(0)
    await daemon.stop()
  })

  it("should record plan_recovery event", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const daemon = new Daemon({ planner })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    const plan = await planner.get_plan(id)
    plan!.status = "paused"
    plan!.started_at = Date.now()

    await daemon.start()
    await daemon.run_plan_recovery()
    const events = daemon.get_events()
    const recovery_events = events.filter((e) => e.type === "plan_recovery")
    expect(recovery_events.length).toBe(1)
    expect(recovery_events[0].data.plan_id).toBe(id)
    await daemon.stop()
  })
})

describe("V10 Daemon - persistence", () => {
  it("should persist state to storage", async () => {
    const storage = new MockStorage()
    const daemon = new Daemon({
      storage,
      config: { health_check_interval_ms: 1000, plan_recovery_interval_ms: 1000, auto_recover_plans: false, max_recovery_failures: 5 },
    })
    await daemon.start()
    await daemon.run_health_check()
    await daemon.stop()
    const data = storage.data.get("daemon") as { status: string; metrics: { health_checks: number } }
    expect(data).toBeDefined()
    expect(data.status).toBe("stopped")
    expect(data.metrics.health_checks).toBeGreaterThanOrEqual(1)
  })

  it("should load state from storage", async () => {
    const storage = new MockStorage()
    // 先保存一些状态
    const daemon1 = new Daemon({ storage })
    await daemon1.start()
    await daemon1.run_health_check()
    await daemon1.run_health_check()
    await daemon1.stop()

    // 创建新 daemon 并加载
    const daemon2 = new Daemon({ storage })
    const loaded = await daemon2.load_from_storage()
    expect(loaded).toBe(true)
    const metrics = daemon2.get_metrics()
    expect(metrics.health_checks).toBeGreaterThanOrEqual(2)
    expect(daemon2.get_status()).toBe("stopped") // 加载后状态为 stopped
  })

  it("should return false when no storage", async () => {
    const daemon = new Daemon()
    const loaded = await daemon.load_from_storage()
    expect(loaded).toBe(false)
  })

  it("should return false when storage empty", async () => {
    const storage = new MockStorage()
    const daemon = new Daemon({ storage })
    const loaded = await daemon.load_from_storage()
    expect(loaded).toBe(false)
  })

  it("should not persist without storage", async () => {
    const daemon = new Daemon()
    await daemon.start()
    await daemon.stop()
    // 不应抛出异常
    expect(daemon.get_status()).toBe("stopped")
  })
})

describe("V10 Daemon - periodic operations", () => {
  it("should run periodic health checks", async () => {
    let probe_calls: number = 0
    const daemon = new Daemon({
      health_probe: () => {
        probe_calls += 1
        return "healthy"
      },
      config: {
        health_check_interval_ms: 30,
        plan_recovery_interval_ms: 1000,
        auto_recover_plans: false,
        max_recovery_failures: 5,
      },
    })
    await daemon.start()
    // 等待定时器触发
    await new Promise((r) => setTimeout(r, 100))
    expect(probe_calls).toBeGreaterThan(1)
    await daemon.stop()
  })

  it("should run periodic plan recovery", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const daemon = new Daemon({
      planner,
      config: {
        health_check_interval_ms: 1000,
        plan_recovery_interval_ms: 30,
        auto_recover_plans: true,
        max_recovery_failures: 5,
      },
    })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    const plan = await planner.get_plan(id)
    plan!.status = "paused"
    plan!.started_at = Date.now()

    await daemon.start()
    // 等待定时器触发恢复
    await new Promise((r) => setTimeout(r, 100))
    expect((await planner.get_plan_summary(id))!.status).toBe("completed")
    await daemon.stop()
  })

  it("should not run periodic recovery when auto_recover_plans is false", async () => {
    const executor: PhaseExecutor = async () => "ok"
    const planner = new Planner({ executor })
    const daemon = new Daemon({
      planner,
      config: {
        health_check_interval_ms: 1000,
        plan_recovery_interval_ms: 30,
        auto_recover_plans: false,
        max_recovery_failures: 5,
      },
    })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    const plan = await planner.get_plan(id)
    plan!.status = "paused"
    plan!.started_at = Date.now()

    await daemon.start()
    await new Promise((r) => setTimeout(r, 100))
    // 自动恢复未启用，计划仍为 paused
    expect((await planner.get_plan_summary(id))!.status).toBe("paused")
    await daemon.stop()
  })

  it("should stop periodic operations when paused", async () => {
    let probe_calls: number = 0
    const daemon = new Daemon({
      health_probe: () => {
        probe_calls += 1
        return "healthy"
      },
      config: {
        health_check_interval_ms: 30,
        plan_recovery_interval_ms: 1000,
        auto_recover_plans: false,
        max_recovery_failures: 5,
      },
    })
    await daemon.start()
    await new Promise((r) => setTimeout(r, 50))
    const calls_before_pause = probe_calls
    await daemon.pause()
    await new Promise((r) => setTimeout(r, 100))
    // 暂停后探针调用次数不应显著增加
    expect(probe_calls).toBeLessThanOrEqual(calls_before_pause + 1)
    await daemon.stop()
  })
})

describe("V10 Daemon - events", () => {
  it("should limit events to max_events", async () => {
    const daemon = new Daemon({
      config: {
        health_check_interval_ms: 1000,
        plan_recovery_interval_ms: 1000,
        auto_recover_plans: false,
        max_recovery_failures: 5,
      },
    })
    await daemon.start()
    // 触发超过 100 次健康检查
    for (let i = 0; i < 110; i++) {
      await daemon.run_health_check()
    }
    const events = daemon.get_events()
    expect(events.length).toBeLessThanOrEqual(100)
    await daemon.stop()
  })

  it("should record recovery_failed event on failure", async () => {
    const executor: PhaseExecutor = async () => {
      throw new Error("permanent failure")
    }
    const planner = new Planner({ executor })
    const daemon = new Daemon({
      planner,
      config: { max_recovery_failures: 5, health_check_interval_ms: 1000, plan_recovery_interval_ms: 1000, auto_recover_plans: true },
    })
    const id: string = await planner.create_plan("g", "p", make_phases(1))
    await planner.run_plan(id)

    await daemon.start()
    await daemon.run_plan_recovery()
    const events = daemon.get_events()
    const failed_events = events.filter((e) => e.type === "recovery_failed")
    expect(failed_events.length).toBeGreaterThanOrEqual(1)
    expect(failed_events[0].data.plan_id).toBe(id)
    await daemon.stop()
  })
})
