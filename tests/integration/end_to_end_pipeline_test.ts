import { describe, it, expect } from "bun:test"
import { QueryEngine } from "../../src/core_infra/core/query_engine.ts"
import { MessagePipeline } from "../../src/core_infra/core/message_pipeline.ts"
import { ToolScheduler } from "../../src/core_infra/core/tool_scheduler.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"
import { LoggerService } from "../../src/core_infra/infra/logger_service.ts"
import { ConfigLoader } from "../../src/core_infra/infra/config_loader.ts"
import { ConfigValidator } from "../../src/core_infra/infra/config_validator.ts"
import { DiContainer } from "../../src/core_infra/infra/di_container.ts"
import { LifecycleManager } from "../../src/core_infra/infra/lifecycle_manager.ts"
import { ServiceRegistry } from "../../src/core_infra/infra/service_registry.ts"
import { ConfigReloader } from "../../src/core_infra/infra/config_reloader.ts"
import { ExceptionHandler } from "../../src/core_infra/infra/exception_handler.ts"
import { TransactionManager } from "../../src/core_infra/infra/transaction_manager.ts"
import { MemoryLock } from "../../src/core_infra/infra/memory_lock.ts"
import { InputSanitizer } from "../../src/core_infra/infra/input_sanitizer.ts"
import { SimpleTracer } from "../../src/core_infra/infra/simple_tracer.ts"
import { MetricsCollector } from "../../src/core_infra/infra/metrics_collector.ts"
import { MemoryCache } from "../../src/core_infra/infra/memory_cache.ts"
import { SimpleEventBus } from "../../src/core_infra/infra/simple_event_bus.ts"
import { HealthChecker } from "../../src/core_infra/infra/health_checker.ts"
import { TokenBucketLimiter } from "../../src/core_infra/infra/token_bucket_limiter.ts"
import { CircuitBreaker } from "../../src/core_infra/infra/circuit_breaker.ts"
import { LogLevel } from "../../src/core_infra/infra/log_level_enum.ts"
import { ErrorCode } from "../../src/core_infra/core/error_code_enum.ts"
import { TOKENS } from "../../src/core_infra/infra/service_tokens.ts"

describe("end_to_end_pipeline full_system", () => {
  it("should orchestrate all modules through interfaces", () => {
    // 1. Logger
    const logger = new LoggerService(LogLevel.DEBUG)
    expect(logger.validate()).toBe(true)

    // 2. Config system
    const config_loader = new ConfigLoader()
    const config_validator = new ConfigValidator()
    expect(typeof config_loader.load).toBe("function")
    expect(typeof config_validator.validate_present).toBe("function")

    // 3. DI Container
    const container = new DiContainer()
    container.register(TOKENS.IAuthService, AuthService)
    const auth_from_di = container.resolve(TOKENS.IAuthService)
    expect(auth_from_di).toBeInstanceOf(AuthService)

    // 4. Lifecycle
    const lifecycle = new LifecycleManager()
    lifecycle.init()
    lifecycle.start()
    expect(lifecycle.is_running()).toBe(true)
    lifecycle.stop()

    // 5. Service Registry
    const registry = new ServiceRegistry()
    registry.register_service("shell", new ShellService())
    expect(registry.discover("shell")).toBeInstanceOf(ShellService)

    // 6. Config Reloader
    const reloader = new ConfigReloader(config_loader, "/tmp/fake.yaml")
    expect(reloader.reload()).toBe(false)

    // 7. Exception Handler
    const ex_handler = new ExceptionHandler()
    const ex_result = ex_handler.handle(new Error("1001: bad"))
    expect(ex_result.code).toBe(ErrorCode.INVALID_ARGUMENT)

    // 8. Transaction
    const tx = new TransactionManager<string>()
    const tx_result = tx.execute(() => "committed")
    expect(tx_result.success).toBe(true)

    // 9. Lock
    const lock = new MemoryLock()
    expect(lock.acquire()).toBe(true)
    lock.release()

    // 10. Sanitizer
    const sanitizer = new InputSanitizer()
    expect(sanitizer.is_safe("<script>")).toBe(false)
    expect(sanitizer.sanitize("<hello>")).toBe("hello")

    // 11. Tracer
    const tracer = new SimpleTracer()
    const span_id = tracer.start_span("e2e")
    tracer.end_span(span_id)
    expect(tracer.get_spans().length).toBe(1)

    // 12. Metrics
    const metrics = new MetricsCollector()
    metrics.record("e2e_op", 15)
    expect(metrics.get_snapshots()[0].count).toBe(1)

    // 13. Cache
    const cache = new MemoryCache<string>()
    cache.set("key", "value", 1000)
    expect(cache.get("key")).toBe("value")

    // 14. Event Bus
    const bus = new SimpleEventBus()
    let event_received = false
    bus.subscribe("done", () => { event_received = true })
    bus.publish("done", null)
    expect(event_received).toBe(true)

    // 15. Health
    const health = new HealthChecker()
    health.register("all_ok", () => true)
    expect(health.overall_status()).toBe("healthy")

    // 16. Rate Limiter
    const limiter = new TokenBucketLimiter(5, 1000)
    expect(limiter.try_acquire()).toBe(true)

    // 17. Circuit Breaker
    const cb = new CircuitBreaker(3, 1000)
    expect(cb.execute(() => "success", "fallback")).toBe("success")

    // 18. Core Engine + Services integration
    const engine = new QueryEngine({ cwd: "/tmp", initial_messages: [], max_turns: 10, verbose: false })
    const pipeline = new MessagePipeline()
    const msg = pipeline.create("1", "test", "user")
    engine.add_message(msg)
    expect(engine.get_messages().length).toBe(1)

    const auth = new AuthService()
    auth.set_token({ source: "test", token: "key", expires_at: Date.now() + 10000 })
    expect(auth.validate()).toBe(true)

    const shell = new ShellService()
    const shell_result = shell.run({ command: "echo", timeout_ms: 1000 })
    expect(shell_result.exit_code).toBe(0)

    const msg_service = new MessageService()
    msg_service.add("hello", "user")
    expect(msg_service.get_all().length).toBe(1)

    const gateway = new ApiGateway()
    const api_result = gateway.handle_request({ action: "query", payload: {} })
    expect(api_result.success).toBe(true)

    const tool_scheduler = new ToolScheduler()
    const tool_call = tool_scheduler.schedule("read", { path: "/tmp" })
    expect(tool_scheduler.execute(tool_call)).toContain("read")
  })
})

describe("end_to_end_pipeline stress", () => {
  it("should handle high volume through all layers", () => {
    const engine = new QueryEngine({ cwd: "/tmp", initial_messages: [], max_turns: 1000, verbose: false })
    const pipeline = new MessagePipeline()
    const metrics = new MetricsCollector()
    const cache = new MemoryCache<number>()
    const bus = new SimpleEventBus()

    let event_count = 0
    bus.subscribe("msg_added", () => { event_count += 1 })

    for (let i = 0; i < 100; i++) {
      const start = Date.now()
      const msg = pipeline.create(String(i), `content_${i}`, i % 2 === 0 ? "user" : "assistant")
      engine.add_message(msg)
      cache.set(String(i), i, 5000)
      bus.publish("msg_added", msg)
      metrics.record("add_message", Date.now() - start)
    }

    expect(engine.get_messages().length).toBe(100)
    expect(event_count).toBe(100)
    expect(cache.size()).toBe(100)
    expect(metrics.get_snapshots()[0].count).toBe(100)
  })
})
