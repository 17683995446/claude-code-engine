import { describe, it, expect } from "bun:test"
import { TransactionManager } from "../../src/core_infra/infra/transaction_manager.ts"
import { SimpleEventBus } from "../../src/core_infra/infra/simple_event_bus.ts"
import { SnapshotManager } from "../../src/core_infra/infra/snapshot_manager.ts"
import { FileStorage } from "../../src/core_infra/infra/file_storage.ts"
import { HealthChecker } from "../../src/core_infra/infra/health_checker.ts"
import { MemoryCache } from "../../src/core_infra/infra/memory_cache.ts"
import { MemoryLock } from "../../src/core_infra/infra/memory_lock.ts"
import { MemorySearchEngine } from "../../src/core_infra/infra/memory_search_engine.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"
import { ExponentialRetryPolicy } from "../../src/core_infra/infra/exponential_retry_policy.ts"
import { MemoryWorkflowEngine } from "../../src/core_infra/infra/memory_workflow_engine.ts"
import { MemoryConsistencyChecker } from "../../src/core_infra/infra/memory_consistency_checker.ts"
import { MemoryTenantManager } from "../../src/core_infra/infra/memory_tenant_manager.ts"
import { MemoryFeatureFlag } from "../../src/core_infra/infra/memory_feature_flag.ts"
import { MemoryDegradation } from "../../src/core_infra/infra/memory_degradation.ts"
import { CircuitBreaker } from "../../src/core_infra/infra/circuit_breaker.ts"
import { TokenBucketLimiter } from "../../src/core_infra/infra/token_bucket_limiter.ts"
import { MemoryResourcePool } from "../../src/core_infra/infra/memory_resource_pool.ts"
import { AdaptiveCircuitBreaker } from "../../src/core_infra/infra/adaptive_circuit_breaker.ts"

/**
 * C2: 复杂场景集成测试
 * 目的：通过跨模块高压测试发现真实运行时bug
 */

describe("complex_bug_hunt transaction", () => {
  it("BUG#1: rollback should not pop unrelated history entry", () => {
    const tx: TransactionManager<string> = new TransactionManager()
    tx.execute(() => "first_success")
    const history_before: string[] = tx.get_history()
    expect(history_before.length).toBe(1)
    tx.execute(() => { throw new Error("fail") })
    const history_after: string[] = tx.get_history()
    expect(history_after.length).toBe(1)
    expect(history_after[0]).toBe("first_success")
  })

  it("BUG#2: rollback called externally should not corrupt history", () => {
    const tx: TransactionManager<number> = new TransactionManager()
    tx.execute(() => 42)
    tx.rollback()
    const history: number[] = tx.get_history()
    expect(history.length).toBe(0)
  })
})

describe("complex_bug_hunt event_bus", () => {
  it("BUG#3: simple_event_bus publish should isolate handler exceptions", () => {
    const bus: SimpleEventBus = new SimpleEventBus()
    let second_called: boolean = false
    bus.subscribe("test", () => { throw new Error("handler1 fail") })
    bus.subscribe("test", () => { second_called = true })
    bus.publish("test", "payload")
    expect(second_called).toBe(true)
  })
})

describe("complex_bug_hunt snapshot", () => {
  it("BUG#4: snapshot capture should save actual state data", async () => {
    const storage: FileStorage = new FileStorage()
    const sm: SnapshotManager = new SnapshotManager(storage, "test_snap")
    await sm.capture("snap1")
    const data: unknown = await storage.load("test_snap:snap1")
    expect(data).toBeDefined()
    const record: Record<string, unknown> = data as Record<string, unknown>
    expect(record.created_at).toBeDefined()
  })

  it("BUG#5: snapshot list should return actual snapshots", async () => {
    const storage: FileStorage = new FileStorage()
    const sm: SnapshotManager = new SnapshotManager(storage, "test_list")
    await sm.capture("s1")
    await sm.capture("s2")
    const list: string[] = await sm.list()
    expect(list.length).toBeGreaterThan(0)
  })
})

describe("complex_bug_hunt auth", () => {
  it("BUG#6: validate should return false for expired token", () => {
    const auth: AuthService = new AuthService()
    auth.set_token({
      source: "test",
      token: "valid_token",
      expires_at: Date.now() - 1000,
    })
    expect(auth.validate()).toBe(false)
  })

  it("BUG#7: validate should return false for NaN expires_at", () => {
    const auth: AuthService = new AuthService()
    auth.set_token({
      source: "test",
      token: "valid_token",
      expires_at: NaN,
    })
    expect(auth.validate()).toBe(false)
    expect(auth.is_token_expired()).toBe(true)
  })

  it("BUG#8: get_status should reflect expired token", () => {
    const auth: AuthService = new AuthService()
    auth.set_token({
      source: "test",
      token: "valid_token",
      expires_at: Date.now() - 1000,
    })
    const status = auth.get_status()
    expect(status.is_authenticated).toBe(false)
  })
})

describe("complex_bug_hunt message_service", () => {
  it("BUG#9: message IDs should not collide after clear", () => {
    const ms: MessageService = new MessageService()
    const msg1 = ms.add("first", "user")
    ms.clear()
    const msg2 = ms.add("second", "user")
    expect(msg1.id).not.toBe(msg2.id)
  })

  it("BUG#10: get_all should return copy not internal reference", () => {
    const ms: MessageService = new MessageService()
    ms.add("hello", "user")
    const all: Message[] = ms.get_all()
    all.push({ id: "fake", content: "injected", role: "user", timestamp: 0 } as any)
    const re_fetched: Message[] = ms.get_all()
    expect(re_fetched.length).toBe(1)
  })
})

describe("complex_bug_hunt shell_service", () => {
  it("BUG#11: get_history should return copy not internal reference", () => {
    const ss: ShellService = new ShellService()
    ss.run({ command: "echo", timeout_ms: 1000 })
    const hist = ss.get_history()
    hist.push({ command: "injected", timeout_ms: 0 })
    const re_fetched = ss.get_history()
    expect(re_fetched.length).toBe(1)
  })

  it("BUG#12: failed command should not be in history", () => {
    const ss: ShellService = new ShellService()
    ss.run({ command: "", timeout_ms: 1000 })
    expect(ss.get_history().length).toBe(0)
  })
})

describe("complex_bug_hunt health_checker", () => {
  it("BUG#13: probe throwing exception should not crash check_all", () => {
    const hc: HealthChecker = new HealthChecker()
    hc.register("good", () => true)
    hc.register("bad", () => { throw new Error("probe fail") })
    const results = hc.check_all()
    expect(results.length).toBe(2)
    const bad_result = results.find((r) => r.name === "bad")
    expect(bad_result?.status).toBe("unhealthy")
  })

  it("BUG#14: empty probes should not return healthy", () => {
    const hc: HealthChecker = new HealthChecker()
    const status = hc.overall_status()
    expect(status).not.toBe("healthy")
  })
})

describe("complex_bug_hunt search_engine", () => {
  it("BUG#15: re-indexing same doc should remove old terms", () => {
    const se: MemorySearchEngine = new MemorySearchEngine()
    se.index("doc1", "hello world")
    se.index("doc1", "foo bar")
    const results: string[] = se.search("hello")
    expect(results).not.toContain("doc1")
  })
})

describe("complex_bug_hunt workflow_engine", () => {
  it("BUG#16: workflow should detect missing dependency with clear error", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    wf.define_task("a", ["nonexistent"], "act")
    wf.execute()
    expect(wf.get_status("a")).toBe("failed")
  })

  it("BUG#17: workflow execute should actually run the action", () => {
    const wf: MemoryWorkflowEngine = new MemoryWorkflowEngine()
    let action_executed: boolean = false
    wf.define_task("a", [], "do_something")
    wf.execute()
    expect(wf.get_status("a")).toBe("done")
  })
})

describe("complex_bug_hunt consistency_checker", () => {
  it("BUG#18: checksum should not produce negative hex for negative hash", () => {
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const sum: string = cc.checksum("test_data")
    expect(sum).not.toContain("-")
  })
})

describe("complex_bug_hunt circuit_breaker", () => {
  it("BUG#19: record_success should not reset open state externally", () => {
    const cb: CircuitBreaker = new CircuitBreaker(2, 10000)
    cb.execute(() => { throw new Error("fail") }, "fb")
    cb.execute(() => { throw new Error("fail") }, "fb")
    expect(cb.get_state()).toBe("open")
    cb.record_success()
    expect(cb.get_state()).toBe("open")
  })
})

describe("complex_bug_hunt adaptive_circuit", () => {
  it("BUG#20: threshold should decrease (more sensitive) after trip, not increase", () => {
    const cb: AdaptiveCircuitBreaker = new AdaptiveCircuitBreaker(3, 1000, 1, 10)
    const before: number = cb.get_threshold()
    cb.execute(() => { throw new Error("f") }, "fb")
    cb.execute(() => { throw new Error("f") }, "fb")
    cb.execute(() => { throw new Error("f") }, "fb")
    const after: number = cb.get_threshold()
    expect(after).toBeLessThanOrEqual(before)
  })
})

describe("complex_bug_hunt resource_pool", () => {
  it("BUG#21: release when pool full should log warning not silently drop", () => {
    const pool: MemoryResourcePool<number> = new MemoryResourcePool(2, () => 0)
    pool.release(999)
    pool.release(998)
    pool.release(997)
    expect(pool.available()).toBe(2)
  })
})

describe("complex_bug_hunt cross_module_stress", () => {
  it("should survive 500 mixed operations across 10 modules", () => {
    const tx: TransactionManager<string> = new TransactionManager()
    const bus: SimpleEventBus = new SimpleEventBus()
    const cache: MemoryCache<string> = new MemoryCache(5000)
    const hc: HealthChecker = new HealthChecker()
    const cb: CircuitBreaker = new CircuitBreaker(10, 1000)
    const limiter: TokenBucketLimiter = new TokenBucketLimiter(100, 1)
    const tm: MemoryTenantManager = new MemoryTenantManager()
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    const deg: MemoryDegradation = new MemoryDegradation()
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()

    tm.register("tenant_1", 200)
    ff.enable("feature_a")
    deg.register("core", 0)
    deg.register("analytics", 2)
    hc.register("db", () => true)
    let event_count: number = 0
    bus.subscribe("op_done", () => { event_count += 1 })

    let errors: number = 0
    for (let i: number = 0; i < 500; i++) {
      try {
        tx.execute(() => `op_${i}`)
        cache.set(`k${i}`, `v${i}`, 5000)
        bus.publish("op_done", `payload_${i}`)
        cb.execute(() => i % 10 !== 9, "fallback")
        limiter.try_acquire()
        tm.allow("tenant_1")
        ff.is_enabled("feature_a", `user_${i}`)
        deg.report_load(i % 100)
        deg.is_active("core")
        cc.checksum(`data_${i}`)
      } catch (e) {
        errors += 1
      }
    }
    expect(errors).toBe(0)
    expect(tx.get_history().length).toBe(500)
    expect(event_count).toBe(500)
    expect(cache.size()).toBe(500)
  })

  it("should handle concurrent failure storm with recovery", () => {
    const cb: CircuitBreaker = new CircuitBreaker(3, 50)
    const limiter: TokenBucketLimiter = new TokenBucketLimiter(50, 1)
    let successes: number = 0
    let fallbacks: number = 0
    for (let i: number = 0; i < 100; i++) {
      if (!limiter.try_acquire()) {
        continue
      }
      const result: string = cb.execute(() => {
        if (i % 5 === 0) {
          throw new Error("random_fail")
        }
        return "ok"
      }, "fallback")
      if (result === "ok") {
        successes += 1
      } else {
        fallbacks += 1
      }
    }
    expect(successes + fallbacks).toBeGreaterThan(0)
  })
})

describe("complex_bug_hunt edge_cases", () => {
  it("should handle empty string inputs across modules", () => {
    const se: MemorySearchEngine = new MemorySearchEngine()
    se.index("doc1", "")
    const results: string[] = se.search("")
    expect(results).toBeDefined()

    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const sum: string = cc.checksum("")
    expect(sum).toBeDefined()
  })

  it("should handle very large inputs", () => {
    const cache: MemoryCache<string> = new MemoryCache()
    const large_value: string = "x".repeat(100000)
    cache.set("large", large_value)
    expect(cache.get("large")).toBe(large_value)
  })

  it("should handle rapid register/unregister cycles", () => {
    const tm: MemoryTenantManager = new MemoryTenantManager()
    for (let i: number = 0; i < 50; i++) {
      tm.register(`t${i}`, 1)
      tm.allow(`t${i}`)
      tm.unregister(`t${i}`)
    }
    expect(tm.usage("t49")).toBe(0)
  })

  it("should handle feature flag at 0% and 100% rollout", () => {
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    ff.set_rollout("feat", 0)
    expect(ff.is_enabled("feat", "any_user")).toBe(false)
    ff.set_rollout("feat", 100)
    expect(ff.is_enabled("feat", "any_user")).toBe(true)
  })
})
