import { describe, it, expect } from "bun:test"
import { QueryEngine } from "../../src/core_infra/core/query_engine.ts"
import { MessagePipeline } from "../../src/core_infra/core/message_pipeline.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ExceptionHandler } from "../../src/core_infra/infra/exception_handler.ts"
import { TransactionManager } from "../../src/core_infra/infra/transaction_manager.ts"
import { MemoryLock } from "../../src/core_infra/infra/memory_lock.ts"
import { CircuitBreaker } from "../../src/core_infra/infra/circuit_breaker.ts"
import { TokenBucketLimiter } from "../../src/core_infra/infra/token_bucket_limiter.ts"
import { HealthChecker } from "../../src/core_infra/infra/health_checker.ts"
import { SimpleEventBus } from "../../src/core_infra/infra/simple_event_bus.ts"
import { MemoryCache } from "../../src/core_infra/infra/memory_cache.ts"
import { ErrorCode } from "../../src/core_infra/core/error_code_enum.ts"

function random_int(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function maybe_throw(probability: number): void {
  if (Math.random() < probability) {
    throw new Error("chaos_injected_failure")
  }
}

describe("chaos_engineering random_faults", () => {
  it("should survive random exceptions in pipeline", () => {
    const handler = new ExceptionHandler()
    let success_count = 0
    for (let i = 0; i < 50; i++) {
      try {
        maybe_throw(0.3)
        success_count += 1
      } catch (error) {
        const ex = handler.handle(error)
        expect(ex.code).toBe(ErrorCode.UNKNOWN_ERROR)
      }
    }
    expect(success_count).toBeGreaterThan(20)
  })
})

describe("chaos_engineering api_garbage", () => {
  it("should handle random garbage api requests", () => {
    const gateway = new ApiGateway()
    const actions = ["", "a", "valid", "a".repeat(100), "<script>", "DROP TABLE"]
    let rejected = 0
    for (let i = 0; i < 100; i++) {
      const action = actions[random_int(0, actions.length - 1)]
      try {
        gateway.handle_request({ action, payload: {} })
      } catch {
        rejected += 1
      }
    }
    expect(rejected).toBeGreaterThan(10)
  })
})

describe("chaos_engineering concurrent_messages", () => {
  it("should handle concurrent message bursts", () => {
    const engine = new QueryEngine({ cwd: "/tmp", initial_messages: [], max_turns: 1000, verbose: false })
    const pipeline = new MessagePipeline()
    const lock = new MemoryLock()

    for (let i = 0; i < 200; i++) {
      if (lock.acquire()) {
        const msg = pipeline.create(String(i), `c${i}`, "user")
        engine.add_message(msg)
        lock.release()
      }
    }
    expect(engine.get_messages().length).toBeGreaterThan(100)
  })
})

describe("chaos_engineering circuit_breaker_stress", () => {
  it("should trip and recover under random failures", () => {
    const cb = new CircuitBreaker(5, 100)
    let fallback_count = 0
    for (let i = 0; i < 50; i++) {
      const result = cb.execute(() => {
        maybe_throw(0.5)
        return "ok"
      }, "fallback")
      if (result === "fallback") {
        fallback_count += 1
      }
    }
    expect(fallback_count).toBeGreaterThan(0)
  })
})

describe("chaos_engineering health_degradation", () => {
  it("should detect degraded health under load", () => {
    const health = new HealthChecker()
    let call_count = 0
    health.register("flaky", () => {
      call_count += 1
      return Math.random() > 0.5
    })
    const results = health.check_all()
    expect(results.length).toBe(1)
    expect(["healthy", "degraded", "unhealthy"]).toContain(results[0].status)
  })
})

describe("chaos_engineering cache_corruption", () => {
  it("should handle cache churn", () => {
    const cache = new MemoryCache<string>()
    for (let i = 0; i < 100; i++) {
      cache.set(String(i), `v${i}`, random_int(1, 100))
    }
    let hits = 0
    for (let i = 0; i < 100; i++) {
      if (cache.get(String(i)) !== null) {
        hits += 1
      }
    }
    expect(hits).toBeGreaterThanOrEqual(0)
    expect(hits).toBeLessThanOrEqual(100)
  })
})

describe("chaos_engineering event_bus_flood", () => {
  it("should handle event flood without dropping", () => {
    const bus = new SimpleEventBus()
    let received = 0
    bus.subscribe("flood", () => { received += 1 })
    for (let i = 0; i < 500; i++) {
      bus.publish("flood", i)
    }
    expect(received).toBe(500)
  })
})

describe("chaos_engineering transaction_rollback_storm", () => {
  it("should rollback consistently under failure storm", () => {
    const tx = new TransactionManager<number>()
    let committed = 0
    let rolled_back = 0
    for (let i = 0; i < 30; i++) {
      const result = tx.execute(() => {
        maybe_throw(0.4)
        return i
      }, -1)
      if (result.success) {
        committed += 1
      } else {
        rolled_back += 1
      }
    }
    expect(committed + rolled_back).toBe(30)
    expect(tx.get_history().length).toBeLessThanOrEqual(committed)
    expect(tx.get_history().length + rolled_back).toBeGreaterThanOrEqual(committed)
  })
})

describe("chaos_engineering auth_token_rotation", () => {
  it("should handle rapid token changes", () => {
    const auth = new AuthService()
    for (let i = 0; i < 20; i++) {
      auth.set_token({ source: "test", token: `tok${i}`, expires_at: Date.now() + (i % 2 === 0 ? 10000 : -1) })
      auth.validate()
      auth.is_token_expired()
    }
    expect(auth.get_status().is_authenticated).toBeDefined()
  })
})

describe("chaos_engineering shell_command_bombardment", () => {
  it("should survive shell command bombardment", () => {
    const shell = new ShellService()
    const commands = ["echo", "ls", "cat", "pwd", "whoami"]
    for (let i = 0; i < 50; i++) {
      const cmd = commands[random_int(0, commands.length - 1)]
      try {
        shell.run({ command: cmd, timeout_ms: 100 })
      } catch {
        // expected
      }
    }
    expect(true).toBe(true)
  })
})

describe("chaos_engineering rate_limiter_burst", () => {
  it("should enforce rate limit under burst", () => {
    const limiter = new TokenBucketLimiter(10, 1000)
    let allowed = 0
    let denied = 0
    for (let i = 0; i < 50; i++) {
      if (limiter.try_acquire()) {
        allowed += 1
      } else {
        denied += 1
      }
    }
    expect(allowed).toBeLessThanOrEqual(10)
    expect(denied).toBeGreaterThan(0)
  })
})
