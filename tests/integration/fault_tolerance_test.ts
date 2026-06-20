import { describe, it, expect } from "bun:test"
import { QueryEngine } from "../../src/core_infra/core/query_engine.ts"
import { MemorySearchEngine } from "../../src/core_infra/infra/memory_search_engine.ts"
import { ExponentialRetryPolicy } from "../../src/core_infra/infra/exponential_retry_policy.ts"
import { AdaptiveRateLimiter } from "../../src/core_infra/infra/adaptive_rate_limiter.ts"
import { MemoryDegradation } from "../../src/core_infra/infra/memory_degradation.ts"
import { MemoryResourcePool } from "../../src/core_infra/infra/memory_resource_pool.ts"
import { validate_number_range } from "../../src/core_infra/infra/validator.ts"
import { MemoryTenantManager } from "../../src/core_infra/infra/memory_tenant_manager.ts"
import { MemoryFeatureFlag } from "../../src/core_infra/infra/memory_feature_flag.ts"
import { MemoryWorkflowEngine } from "../../src/core_infra/infra/memory_workflow_engine.ts"
import { CircuitBreaker } from "../../src/core_infra/infra/circuit_breaker.ts"
import { AdaptiveCircuitBreaker } from "../../src/core_infra/infra/adaptive_circuit_breaker.ts"
import { SimpleEventBus } from "../../src/core_infra/infra/simple_event_bus.ts"
import { HealthChecker } from "../../src/core_infra/infra/health_checker.ts"
import { TransactionManager } from "../../src/core_infra/infra/transaction_manager.ts"
import { FileStorage } from "../../src/core_infra/infra/file_storage.ts"
import { SnapshotManager } from "../../src/core_infra/infra/snapshot_manager.ts"
import { MemoryConsistencyChecker } from "../../src/core_infra/infra/memory_consistency_checker.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import type { Message } from "../../src/core_infra/core/message_types.ts"
import type { ShellCommand } from "../../src/services_entry/services/shell_types.ts"

// ============================================================
// C4: 异常容错专项测试
// 超时、断连、并发竞争、内存压力、边界极值、状态腐蚀
// ============================================================

// ---- BUG#22: QueryEngine.get_messages 返回内部引用 ----
describe("C4 BUG#22: QueryEngine.get_messages internal reference leak", () => {
  it("should not allow external mutation of internal messages", () => {
    const config = { cwd: "/tmp", max_turns: 10, initial_messages: [] }
    const engine = new QueryEngine(config as any)
    engine.add_message({ id: "1", content: "hello", role: "user", timestamp: Date.now() } as Message)

    const msgs = engine.get_messages()
    expect(msgs.length).toBe(1)

    // External mutation should NOT affect internal state
    msgs.push({ id: "2", content: "injected", role: "user", timestamp: Date.now() } as Message)
    msgs.splice(0, 1)

    const msgs2 = engine.get_messages()
    expect(msgs2.length).toBe(1)
    expect(msgs2[0].id).toBe("1")
  })
})

// ---- BUG#23: MemorySearchEngine.search 空白字符分割产生空token ----
describe("C4 BUG#23: MemorySearchEngine whitespace tokenization", () => {
  it("should handle leading/trailing whitespace in search query", () => {
    const engine = new MemorySearchEngine()
    engine.index("doc1", "hello world")
    engine.index("doc2", "hello there")

    // Search with leading/trailing whitespace should work
    const results = engine.search(" hello ")
    expect(results.length).toBe(2)
    expect(results).toContain("doc1")
    expect(results).toContain("doc2")
  })

  it("should handle multiple spaces between words", () => {
    const engine = new MemorySearchEngine()
    engine.index("doc1", "hello world")

    const results = engine.search("hello   world")
    expect(results.length).toBe(1)
    expect(results).toContain("doc1")
  })
})

// ---- BUG#24: MemorySearchEngine.index 空白字符产生空token污染索引 ----
describe("C4 BUG#24: MemorySearchEngine index whitespace pollution", () => {
  it("should not pollute index with empty tokens from whitespace", () => {
    const engine = new MemorySearchEngine()
    engine.index("doc1", "  hello  world  ")

    // Searching for a real word should still work
    const results = engine.search("hello")
    expect(results.length).toBe(1)
    expect(results).toContain("doc1")
  })
})

// ---- BUG#25: ExponentialRetryPolicy 负数max_retries抛出undefined ----
describe("C4 BUG#25: ExponentialRetryPolicy negative max_retries", () => {
  it("should throw proper error when max_retries is negative", () => {
    const policy = new ExponentialRetryPolicy(-1, 1, 10)
    expect(() => {
      policy.execute(() => { throw new Error("fail") })
    }).toThrow()
  })

  it("should throw the original error not undefined", () => {
    const policy = new ExponentialRetryPolicy(-1, 1, 10)
    let thrown: unknown = null
    try {
      policy.execute(() => { throw new Error("specific_error") })
    } catch (e) {
      thrown = e
    }
    expect(thrown).not.toBe(undefined)
    expect(thrown).not.toBe(null)
    expect(thrown instanceof Error).toBe(true)
  })
})

// ---- BUG#26: AdaptiveRateLimiter 降速后tokens未同步降低 ----
describe("C4 BUG#26: AdaptiveRateLimiter tokens not capped on rate reduction", () => {
  it("should immediately enforce new lower rate after error feedback", () => {
    const rl = new AdaptiveRateLimiter(10, 1000)
    // Acquire some tokens to build up usage
    for (let i = 0; i < 5; i++) {
      rl.try_acquire()
    }
    // Report enough errors to trigger rate reduction
    for (let i = 0; i < 10; i++) {
      rl.report_error()
    }
    const new_rate = rl.get_current_rate()
    expect(new_rate).toBeLessThan(10)
    // After rate reduction, available tokens should not exceed new rate
    // Try to acquire - should be limited by new rate
    let acquired = 0
    for (let i = 0; i < 15; i++) {
      if (rl.try_acquire()) {
        acquired += 1
      }
    }
    // Should not be able to acquire more than the new rate allows
    expect(acquired).toBeLessThanOrEqual(new_rate)
  })
})

// ---- BUG#27: MemoryDegradation.register 重复注册产生重复条目 ----
describe("C4 BUG#27: MemoryDegradation duplicate registration", () => {
  it("should not produce duplicate entries in get_degraded", () => {
    const deg = new MemoryDegradation()
    deg.register("feature_a", 2)
    deg.register("feature_a", 2) // duplicate
    deg.report_load(90) // high load - priority 2 is degraded

    const degraded = deg.get_degraded()
    // Should have at most 1 entry for feature_a, not 2
    const count = degraded.filter((f) => f === "feature_a").length
    expect(count).toBe(1)
  })
})

// ---- BUG#28: MemoryResourcePool.release 重复释放 ----
describe("C4 BUG#28: MemoryResourcePool double release", () => {
  it("should not allow double release to inflate available count", () => {
    const pool = new MemoryResourcePool<number>(2, () => Math.random())
    expect(pool.available()).toBe(2)

    const r1 = pool.acquire()
    expect(pool.available()).toBe(1)

    // Double release the same resource
    pool.release(r1!)
    pool.release(r1!) // duplicate

    // available should be 2 (max), not 3
    expect(pool.available()).toBe(2)
    // But the pool should only contain 1 unique resource + 1 duplicate
    // Acquire twice - the second acquire would get the duplicate
    const a1 = pool.acquire()
    const a2 = pool.acquire()
    expect(pool.available()).toBe(0)
    // Both should be valid (not undefined)
    expect(a1).not.toBe(undefined)
    expect(a2).not.toBe(undefined)
  })
})

// ---- BUG#29: validate_number_range NaN通过验证 ----
describe("C4 BUG#29: validate_number_range NaN bypass", () => {
  it("should reject NaN as out of range", () => {
    expect(() => {
      validate_number_range(NaN, "test", 0, 100)
    }).toThrow()
  })

  it("should reject NaN in realistic config validation scenario", () => {
    // Simulate a config that accidentally has NaN
    const bad_value = parseFloat("not_a_number")
    expect(() => {
      validate_number_range(bad_value, "timeout", 1, 10000)
    }).toThrow()
  })
})

// ---- BUG#30: MemoryTenantManager.register 重复注册重置used ----
describe("C4 BUG#30: MemoryTenantManager re-register resets usage", () => {
  it("should preserve usage count when re-registering existing tenant", () => {
    const tm = new MemoryTenantManager()
    tm.register("tenant_a", 10)
    expect(tm.allow("tenant_a")).toBe(true)
    expect(tm.allow("tenant_a")).toBe(true)
    expect(tm.usage("tenant_a")).toBe(2)

    // Re-register should not reset usage to 0
    tm.register("tenant_a", 5)
    expect(tm.usage("tenant_a")).toBe(2)
  })
})

// ---- BUG#31: MemoryFeatureFlag.set_rollout 静默重新启用已禁用功能 ----
describe("C4 BUG#31: MemoryFeatureFlag set_rollout silently re-enables", () => {
  it("should not re-enable a disabled feature when setting rollout", () => {
    const ff = new MemoryFeatureFlag()
    ff.enable("feat_x")
    expect(ff.is_enabled("feat_x", "user1")).toBe(true)

    ff.disable("feat_x")
    expect(ff.is_enabled("feat_x", "user1")).toBe(false)

    // Setting rollout percent should NOT re-enable the feature
    ff.set_rollout("feat_x", 50)
    expect(ff.is_enabled("feat_x", "user1")).toBe(false)
  })
})

// ---- 超时场景测试 ----
describe("C4 timeout scenarios", () => {
  it("circuit breaker should timeout and enter half_open", async () => {
    const cb = new CircuitBreaker(2, 50)
    cb.execute(() => { throw new Error("fail") }, "fallback")
    cb.execute(() => { throw new Error("fail") }, "fallback")
    expect(cb.get_state()).toBe("open")

    // Immediately should return fallback
    const r1 = cb.execute(() => "ok", "fallback")
    expect(r1).toBe("fallback")

    // After timeout, should enter half_open and try again
    await new Promise((r) => setTimeout(r, 60))
    const r2 = cb.execute(() => "recovered", "fallback")
    expect(r2).toBe("recovered")
    expect(cb.get_state()).toBe("closed")
  })

  it("adaptive circuit breaker should recover after timeout", async () => {
    const cb = new AdaptiveCircuitBreaker(2, 50, 1, 5)
    cb.execute(() => { throw new Error("fail") }, "f")
    cb.execute(() => { throw new Error("fail") }, "f")
    expect(cb.get_state()).toBe("open")

    await new Promise((r) => setTimeout(r, 60))
    const result = cb.execute(() => "ok", "f")
    expect(result).toBe("ok")
    expect(cb.get_state()).toBe("closed")
  })
})

// ---- 并发竞争测试 ----
describe("C4 concurrent race conditions", () => {
  it("transaction manager should handle nested execute calls safely", () => {
    const tx = new TransactionManager<number>()
    const result = tx.execute(() => {
      // Nested execute is not truly nested - just sequential
      return 42
    })
    expect(result.success).toBe(true)
    expect(tx.get_history().length).toBe(1)
  })

  it("event bus should handle subscribe during publish", () => {
    const bus = new SimpleEventBus()
    let count = 0
    bus.subscribe("event", () => { count += 1 })
    bus.subscribe("event", () => {
      // This handler subscribes another handler during publish
      // The new handler should NOT be called for this publish cycle
      bus.subscribe("event", () => { count += 100 })
    })
    bus.publish("event", "payload")
    // Only 2 original handlers should fire, not the newly subscribed one
    expect(count).toBe(1)
    // The new handler should be called on the NEXT publish
    bus.publish("event", "payload")
    expect(count).toBe(102)
  })

  it("resource pool should handle acquire-release-acquire cycle", () => {
    const pool = new MemoryResourcePool<string>(1, () => "resource")
    const r1 = pool.acquire()
    expect(r1).toBe("resource")
    expect(pool.available()).toBe(0)

    const r2 = pool.acquire()
    expect(r2).toBe(undefined)

    pool.release(r1!)
    expect(pool.available()).toBe(1)

    const r3 = pool.acquire()
    expect(r3).toBe("resource")
  })
})

// ---- 内存压力测试 ----
describe("C4 memory pressure scenarios", () => {
  it("search engine should handle large number of documents", () => {
    const engine = new MemorySearchEngine()
    for (let i = 0; i < 500; i++) {
      engine.index(`doc_${i}`, `content word_${i % 10} common_word`)
    }
    const results = engine.search("common_word")
    expect(results.length).toBe(500)
  })

  it("message service should handle rapid churn without ID collision", () => {
    const svc = new MessageService()
    const ids = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const msg = svc.add(`content_${i}`, "user")
      expect(ids.has(msg.id)).toBe(false)
      ids.add(msg.id)
    }
    // Clear and add more - IDs should not collide
    svc.clear()
    for (let i = 0; i < 200; i++) {
      const msg = svc.add(`content_after_clear_${i}`, "assistant")
      expect(ids.has(msg.id)).toBe(false)
      ids.add(msg.id)
    }
    expect(ids.size).toBe(400)
  })

  it("consistency checker should handle large data without overflow", () => {
    const checker = new MemoryConsistencyChecker()
    const large_data = "x".repeat(100000)
    const checksum = checker.checksum(large_data)
    expect(checksum).toMatch(/^[0-9a-f]+$/)
    expect(checker.verify(large_data, checksum)).toBe(true)
    expect(checker.is_corrupted(large_data + "y", checksum)).toBe(true)
  })

  it("tenant manager should handle many tenants", () => {
    const tm = new MemoryTenantManager()
    for (let i = 0; i < 100; i++) {
      tm.register(`tenant_${i}`, 5)
    }
    for (let i = 0; i < 100; i++) {
      expect(tm.allow(`tenant_${i}`)).toBe(true)
    }
    for (let i = 0; i < 100; i++) {
      expect(tm.usage(`tenant_${i}`)).toBe(1)
    }
  })
})

// ---- 状态腐蚀恢复测试 ----
describe("C4 state corruption recovery", () => {
  it("snapshot manager should handle missing snapshot gracefully", async () => {
    const storage = new FileStorage()
    const snap = new SnapshotManager(storage)
    // Restore non-existent snapshot should not throw
    await snap.restore("nonexistent")
    // Delete non-existent snapshot should not throw
    await snap.delete("nonexistent")
    const list = await snap.list()
    expect(list.length).toBe(0)
  })

  it("workflow engine should detect and mark deadlocked tasks", () => {
    const wf = new MemoryWorkflowEngine()
    wf.define_task("a", ["b"], "action_a")
    wf.define_task("b", ["a"], "action_b")
    // Circular dependency - both should be marked failed
    const order = wf.execute()
    expect(order.length).toBe(0)
    expect(wf.get_status("a")).toBe("failed")
    expect(wf.get_status("b")).toBe("failed")
  })

  it("workflow engine should handle self-dependency", () => {
    const wf = new MemoryWorkflowEngine()
    wf.define_task("self", ["self"], "action")
    const order = wf.execute()
    expect(order.length).toBe(0)
    expect(wf.get_status("self")).toBe("failed")
  })

  it("health checker should handle probe that returns non-boolean", () => {
    const hc = new HealthChecker()
    hc.register("probe1", () => true as any)
    hc.register("probe2", () => false as any)
    const results = hc.check_all()
    expect(results.length).toBe(2)
    const healthy = results.filter((r) => r.status === "healthy")
    const unhealthy = results.filter((r) => r.status === "unhealthy")
    expect(healthy.length).toBe(1)
    expect(unhealthy.length).toBe(1)
  })
})

// ---- 级联故障测试 ----
describe("C4 cascading failure scenarios", () => {
  it("circuit breaker + retry policy combined should degrade gracefully", () => {
    const cb = new CircuitBreaker(3, 1000)
    const retry = new ExponentialRetryPolicy(2, 1, 10)

    let call_count = 0
    const operation = () => {
      call_count += 1
      throw new Error("service_down")
    }

    // Circuit breaker should trip before retry exhausts
    let results: string[] = []
    for (let i = 0; i < 5; i++) {
      const result = cb.execute(() => {
        return retry.execute(operation)
      }, "fallback")
      results.push(result)
    }
    // After 3 failures, circuit opens and returns fallback immediately
    expect(results.every((r) => r === "fallback")).toBe(true)
    expect(cb.get_state()).toBe("open")
  })

  it("degradation + feature flag combined should handle overload", () => {
    const deg = new MemoryDegradation()
    const ff = new MemoryFeatureFlag()

    deg.register("premium_feature", 0)
    deg.register("standard_feature", 1)
    deg.register("basic_feature", 2)

    // Normal load - all features active
    deg.report_load(30)
    expect(deg.is_active("premium_feature")).toBe(true)
    expect(deg.is_active("standard_feature")).toBe(true)
    expect(deg.is_active("basic_feature")).toBe(true)

    // High load - only priority 0 (highest) stays active
    deg.report_load(90)
    expect(deg.is_active("premium_feature")).toBe(true)
    expect(deg.is_active("standard_feature")).toBe(false)
    expect(deg.is_active("basic_feature")).toBe(false)

    // Medium load - priority 0 and 1 active
    deg.report_load(70)
    expect(deg.is_active("premium_feature")).toBe(true)
    expect(deg.is_active("standard_feature")).toBe(true)
    expect(deg.is_active("basic_feature")).toBe(false)
  })
})

// ---- 边界极值测试 ----
describe("C4 boundary extreme values", () => {
  it("consistency checker should handle empty string", () => {
    const checker = new MemoryConsistencyChecker()
    const checksum = checker.checksum("")
    expect(checksum).toMatch(/^[0-9a-f]+$/)
    expect(checker.verify("", checksum)).toBe(true)
  })

  it("consistency checker should handle unicode", () => {
    const checker = new MemoryConsistencyChecker()
    const data = "你好世界 🌍 𝕏"
    const checksum = checker.checksum(data)
    expect(checker.verify(data, checksum)).toBe(true)
    expect(checker.is_corrupted(data + "!", checksum)).toBe(true)
  })

  it("feature flag should handle empty subject_id", () => {
    const ff = new MemoryFeatureFlag()
    ff.enable("feat")
    expect(ff.is_enabled("feat", "")).toBe(true)
  })

  it("feature flag set_rollout 0 should disable for all", () => {
    const ff = new MemoryFeatureFlag()
    ff.enable("feat")
    ff.set_rollout("feat", 0)
    // percent=0 means no one gets it (bucket < 0 is always false)
    let enabled_count = 0
    for (let i = 0; i < 100; i++) {
      if (ff.is_enabled("feat", `user_${i}`)) {
        enabled_count += 1
      }
    }
    expect(enabled_count).toBe(0)
  })

  it("tenant manager should handle zero quota", () => {
    const tm = new MemoryTenantManager()
    tm.register("zero_tenant", 0)
    expect(tm.allow("zero_tenant")).toBe(false)
    expect(tm.usage("zero_tenant")).toBe(0)
  })

  it("resource pool with max_size 0 should always return undefined", () => {
    const pool = new MemoryResourcePool<number>(0, () => 42)
    expect(pool.acquire()).toBe(undefined)
    expect(pool.available()).toBe(0)
    expect(pool.size()).toBe(0)
  })
})

// ---- 长时间运行疲劳测试 ----
describe("C4 fatigue: long running operations", () => {
  it("should handle 1000 event bus publish cycles", () => {
    const bus = new SimpleEventBus()
    let count = 0
    bus.subscribe("tick", () => { count += 1 })
    for (let i = 0; i < 1000; i++) {
      bus.publish("tick", i)
    }
    expect(count).toBe(1000)
  })

  it("should handle 500 transaction execute+rollback cycles", () => {
    const tx = new TransactionManager<number>()
    for (let i = 0; i < 500; i++) {
      tx.execute(() => i)
      tx.rollback()
    }
    // After 500 execute+rollback cycles, history should be empty
    expect(tx.get_history().length).toBe(0)
  })

  it("should handle 200 snapshot capture/restore/delete cycles", async () => {
    const storage = new FileStorage()
    const snap = new SnapshotManager(storage)
    for (let i = 0; i < 200; i++) {
      const name = `snap_${i}`
      await snap.capture(name)
      await snap.restore(name)
      await snap.delete(name)
    }
    const list = await snap.list()
    expect(list.length).toBe(0)
  })

  it("should handle mixed module stress: 300 operations across 5 modules", () => {
    const msg_svc = new MessageService()
    const shell = new ShellService()
    const search = new MemorySearchEngine()
    const bus = new SimpleEventBus()
    const hc = new HealthChecker()

    let bus_count = 0
    bus.subscribe("stress", () => { bus_count += 1 })
    hc.register("probe1", () => true)

    for (let i = 0; i < 300; i++) {
      msg_svc.add(`msg_${i}`, i % 2 === 0 ? "user" : "assistant")
      const cmd: ShellCommand = { command: `echo ${i}`, timeout_ms: 1000 }
      shell.run(cmd)
      search.index(`doc_${i}`, `content ${i} word`)
      bus.publish("stress", i)
      if (i % 50 === 0) {
        hc.check_all()
      }
    }

    expect(msg_svc.get_all().length).toBe(300)
    expect(shell.get_history().length).toBe(300)
    expect(bus_count).toBe(300)
    const health = hc.overall_status()
    expect(health).toBe("healthy")
  })
})
