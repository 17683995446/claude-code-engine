import { describe, it, expect } from "bun:test"
import { DiContainer } from "../../src/core_infra/infra/di_container.ts"
import { QueryEngine } from "../../src/core_infra/core/query_engine.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"
import { BatchProcessor } from "../../src/core_infra/infra/batch_processor.ts"
import { TokenBucketLimiter } from "../../src/core_infra/infra/token_bucket_limiter.ts"
import { QuotaManager } from "../../src/core_infra/infra/quota_manager.ts"
import { MemoryCache } from "../../src/core_infra/infra/memory_cache.ts"
import { CircuitBreaker } from "../../src/core_infra/infra/circuit_breaker.ts"
import { HealthChecker } from "../../src/core_infra/infra/health_checker.ts"
import { TenantManager } from "../../src/core_infra/infra/tenant_manager.ts"
import { AuditLogger } from "../../src/core_infra/infra/audit_logger.ts"
import { ExceptionHandler } from "../../src/core_infra/infra/exception_handler.ts"
import { AppException } from "../../src/core_infra/infra/exception_handler.ts"
import { ErrorCode } from "../../src/core_infra/core/error_code_enum.ts"

describe("stress_test full_pipeline", () => {
  it("should handle 1000 rapid requests", async () => {
    const gateway: ApiGateway = new ApiGateway()
    const limiter: TokenBucketLimiter = new TokenBucketLimiter(2000, 2000)
    const quota: QuotaManager = new QuotaManager(5000)
    const cache: MemoryCache<string> = new MemoryCache(60000)
    const breaker: CircuitBreaker = new CircuitBreaker(100, 1000)
    const health: HealthChecker = new HealthChecker()
    const tenant: TenantManager = new TenantManager()
    const audit: AuditLogger = new AuditLogger(10000)
    const handler: ExceptionHandler = new ExceptionHandler()

    health.register("api", () => true)
    tenant.register_with_quota("stress", { max_requests_per_minute: 10000, max_messages: 10000, max_storage_mb: 1024 })

    let success: number = 0
    let failed: number = 0

    const processor: BatchProcessor<number, void> = new BatchProcessor(
      async (i: number) => {
        try {
          if (!quota.acquire("stress", "api", 1)) {
            failed++
            return
          }
          if (!limiter.try_acquire()) {
            failed++
            quota.release("stress", "api", 1)
            return
          }
          const res = breaker.execute(() => gateway.handle_request({ action: `req_${i}`, payload: {} }), { success: false, error_code: ErrorCode.API_RATE_LIMITED, data: null })
          if (res.success) {
            success++
            cache.set(`k_${i}`, "ok", 1000)
          } else {
            failed++
          }
          audit.record({ timestamp: Date.now(), level: "info", actor: "stress", action: `req_${i}`, resource: "api", result: res.success ? "success" : "failure" })
          quota.release("stress", "api", 1)
        } catch (err) {
          failed++
          handler.handle(err as Error)
        }
      },
      50
    )

    processor.submit(Array.from({ length: 1000 }, (_, i) => i))
    await processor.execute()

    expect(success + failed).toBe(1000)
    expect(success).toBeGreaterThan(900)
    expect(health.overall_status()).toBe("healthy")
    expect(tenant.check_quota("stress", { messages: 0, requests: 0, storage_mb: 0 })).toBe(true)
  })
})

describe("stress_test memory_stability", () => {
  it("should not leak memory under churn", async () => {
    const msg: MessageService = new MessageService()
    const initial: number = msg.get_all().length

    for (let i: number = 0; i < 500; i++) {
      msg.add(`msg_${i}`, "user")
      if (i % 50 === 0) {
        msg.normalize_all()
      }
    }

    const final: number = msg.get_all().length
    expect(final).toBe(500)
    expect(final - initial).toBe(500)
  })
})

describe("stress_test recovery", () => {
  it("should recover after failure storm", async () => {
    const breaker: CircuitBreaker = new CircuitBreaker(5, 10)
    let calls: number = 0

    for (let i: number = 0; i < 7; i++) {
      breaker.execute(() => {
        throw new Error("fail")
      }, false)
    }
    expect(breaker.get_state()).toBe("open")

    await new Promise((res) => setTimeout(res, 20))

    for (let i: number = 0; i < 10; i++) {
      const ok: boolean = breaker.execute(() => {
        calls++
        return true
      }, false)
      if (ok) break
    }

    expect(calls).toBeGreaterThan(0)
  })
})
