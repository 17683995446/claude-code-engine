import { describe, it, expect, afterEach } from "bun:test"
import { PrometheusMetrics } from "../../src/core_infra/infra/prometheus_metrics.ts"
import { HealthEndpoint } from "../../src/core_infra/infra/health_endpoint.ts"
import { StructuredLogger } from "../../src/core_infra/infra/structured_logger.ts"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../src/core_infra/infra/http_client.ts"
import {
  metrics_middleware,
  structured_logging_middleware,
  setup_observability_routes,
} from "../../src/core_infra/infra/observability.ts"
import { json_response } from "../../src/core_infra/infra/http_middlewares.ts"

// ============================================================
// U5: 可观测性测试
// Prometheus metrics、健康端点、结构化日志、可观测性 HTTP 集成
// ============================================================

let server: HttpServer | null = null

afterEach(() => {
  if (server) {
    server.stop()
    server = null
  }
})

// ---- Prometheus 指标测试 ----
describe("U5 PrometheusMetrics", () => {
  it("should register and increment counters", () => {
    const m = new PrometheusMetrics()
    m.register_counter("requests_total", "Total requests")
    m.counter("requests_total", 1)
    m.counter("requests_total", 2)

    const output = m.export_prometheus()
    expect(output).toContain("# HELP requests_total Total requests")
    expect(output).toContain("# TYPE requests_total counter")
    expect(output).toContain("requests_total 3")
  })

  it("should register and set gauges", () => {
    const m = new PrometheusMetrics()
    m.register_gauge("memory_usage", "Memory usage in bytes")
    m.gauge("memory_usage", 1024)

    const output = m.export_prometheus()
    expect(output).toContain("# TYPE memory_usage gauge")
    expect(output).toContain("memory_usage 1024")
  })

  it("should register and record histograms", () => {
    const m = new PrometheusMetrics()
    m.register_histogram("latency_seconds", "Request latency", [0.1, 0.5, 1])
    m.histogram("latency_seconds", 0.05)
    m.histogram("latency_seconds", 0.3)
    m.histogram("latency_seconds", 0.8)
    m.histogram("latency_seconds", 1.5)

    const output = m.export_prometheus()
    expect(output).toContain("# TYPE latency_seconds histogram")
    expect(output).toContain('latency_seconds_bucket{le="0.1"} 1')
    expect(output).toContain('latency_seconds_bucket{le="0.5"} 2')
    expect(output).toContain('latency_seconds_bucket{le="1"} 3')
    expect(output).toContain('latency_seconds_bucket{le="+Inf"} 4')
    expect(output).toContain("latency_seconds_sum 2.65")
    expect(output).toContain("latency_seconds_count 4")
  })

  it("should auto-register on first use", () => {
    const m = new PrometheusMetrics()
    m.counter("auto_counter", 5)
    m.gauge("auto_gauge", 10)
    m.histogram("auto_histogram", 0.5)

    const output = m.export_prometheus()
    expect(output).toContain("auto_counter 5")
    expect(output).toContain("auto_gauge 10")
    expect(output).toContain("auto_histogram_count 1")
  })

  it("should export all metric types together", () => {
    const m = new PrometheusMetrics()
    m.register_counter("c1", "counter 1")
    m.register_gauge("g1", "gauge 1")
    m.register_histogram("h1", "histogram 1", [1, 2])

    m.counter("c1", 10)
    m.gauge("g1", 20)
    m.histogram("h1", 0.5)
    m.histogram("h1", 1.5)

    const output = m.export_prometheus()
    expect(output).toContain("c1 10")
    expect(output).toContain("g1 20")
    expect(output).toContain("h1_count 2")
  })
})

// ---- 健康端点测试 ----
describe("U5 HealthEndpoint", () => {
  it("should return healthy when no probes", async () => {
    const health = new HealthEndpoint()
    const report = await health.check()
    expect(report.status).toBe("healthy")
    expect(report.checks.length).toBe(0)
    expect(report.uptime_ms).toBeGreaterThanOrEqual(0)
  })

  it("should return healthy when all probes pass", async () => {
    const health = new HealthEndpoint()
    health.add_probe("db", () => true)
    health.add_probe("cache", () => true)

    const report = await health.check()
    expect(report.status).toBe("healthy")
    expect(report.checks.length).toBe(2)
    expect(report.checks[0].status).toBe("healthy")
    expect(report.checks[1].status).toBe("healthy")
  })

  it("should return unhealthy when probe fails", async () => {
    const health = new HealthEndpoint()
    health.add_probe("db", () => true)
    health.add_probe("cache", () => false)

    const report = await health.check()
    expect(report.status).toBe("degraded")
    expect(report.checks[1].status).toBe("unhealthy")
  })

  it("should return unhealthy when probe throws", async () => {
    const health = new HealthEndpoint()
    health.add_probe("failing", () => {
      throw new Error("connection_refused")
    })

    const report = await health.check()
    expect(report.status).toBe("unhealthy")
    expect(report.checks[0].status).toBe("unhealthy")
    expect(report.checks[0].message).toContain("connection_refused")
  })

  it("should support async probes", async () => {
    const health = new HealthEndpoint()
    health.add_probe("async_probe", async () => {
      await new Promise((r) => setTimeout(r, 10))
      return true
    })

    const report = await health.check()
    expect(report.status).toBe("healthy")
    expect(report.checks[0].latency_ms).toBeGreaterThanOrEqual(5)
  })

  it("liveness should always return healthy", async () => {
    const health = new HealthEndpoint()
    const status = await health.liveness()
    expect(status).toBe("healthy")
  })

  it("readiness should run all probes", async () => {
    const health = new HealthEndpoint()
    health.add_probe("service", () => true)

    const report = await health.readiness()
    expect(report.status).toBe("healthy")
    expect(report.checks.length).toBe(1)
  })

  it("should support removing probes", async () => {
    const health = new HealthEndpoint()
    health.add_probe("temp", () => false)
    expect((await health.check()).status).toBe("unhealthy")

    health.remove_probe("temp")
    expect((await health.check()).status).toBe("healthy")
  })
})

// ---- 结构化日志测试 ----
describe("U5 StructuredLogger", () => {
  it("should log with trace_id and request_id", () => {
    const logger = new StructuredLogger()
    logger.set_trace_id("trace_123")
    logger.set_request_id("req_456")
    // 不抛出异常即可
    logger.info("test_message", { key: "value" })
  })

  it("should support child loggers with inherited context", () => {
    const parent = new StructuredLogger()
    parent.set_trace_id("trace_parent")
    parent.set_default_fields({ service: "api" })

    const child = parent.child({ module: "auth" })
    // child 应该继承 trace_id 和 default_fields，并添加自己的
    child.info("child_message", { action: "login" })
  })

  it("should support all log levels", () => {
    const logger = new StructuredLogger()
    logger.debug("debug_msg")
    logger.info("info_msg")
    logger.warn("warn_msg")
    logger.error("error_msg")
  })

  it("should merge default fields with per-call fields", () => {
    const logger = new StructuredLogger()
    logger.set_default_fields({ env: "test", version: "1.0" })
    logger.info("message", { env: "override", extra: "data" })
    // per-call fields 应该覆盖 default fields
  })
})

// ---- 可观测性 HTTP 集成测试 ----
describe("U5 observability HTTP integration", () => {
  it("should expose /metrics endpoint", async () => {
    const metrics = new PrometheusMetrics()
    const health = new HealthEndpoint()

    server = new HttpServer({ port: 0 })
    server.use(metrics_middleware(metrics))

    const routes = setup_observability_routes(metrics, health)
    for (const route of routes) {
      server.get(route.path, route.handler)
    }

    server.get("/api/test", () => json_response({ ok: true }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    // 发送一些请求
    await client.get("/api/test")
    await client.get("/api/test")

    // 获取 metrics
    const response = await client.get("/metrics")
    expect(response.status).toBe(200)
    expect(response.text).toContain("http_requests_total")
    expect(response.text).toContain("http_request_duration_seconds")
  })

  it("should expose /health endpoint", async () => {
    const metrics = new PrometheusMetrics()
    const health = new HealthEndpoint()

    server = new HttpServer({ port: 0 })
    const routes = setup_observability_routes(metrics, health)
    for (const route of routes) {
      server.get(route.path, route.handler)
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/health")
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: "healthy" })
  })

  it("should expose /ready endpoint with probe results", async () => {
    const metrics = new PrometheusMetrics()
    const health = new HealthEndpoint()
    health.add_probe("db", () => true)
    health.add_probe("cache", () => true)

    server = new HttpServer({ port: 0 })
    const routes = setup_observability_routes(metrics, health)
    for (const route of routes) {
      server.get(route.path, route.handler)
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/ready")
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty("status", "healthy")
    expect(response.body).toHaveProperty("checks")
    expect(response.body.checks.length).toBe(2)
  })

  it("should return 503 when readiness fails", async () => {
    const metrics = new PrometheusMetrics()
    const health = new HealthEndpoint()
    health.add_probe("failing", () => false)

    server = new HttpServer({ port: 0 })
    const routes = setup_observability_routes(metrics, health)
    for (const route of routes) {
      server.get(route.path, route.handler)
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/ready")
    expect(response.status).toBe(503)
    expect(response.body).toHaveProperty("status", "unhealthy")
  })

  it("structured logging middleware should add trace_id header", async () => {
    server = new HttpServer({ port: 0 })
    server.use(structured_logging_middleware())
    server.get("/test", () => json_response({ ok: true }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/test")
    expect(response.status).toBe(200)
    expect(response.headers["x-trace-id"]).toMatch(/^trace_\d+_/)
  })

  it("metrics middleware should record request metrics", async () => {
    const metrics = new PrometheusMetrics()
    server = new HttpServer({ port: 0 })
    server.use(metrics_middleware(metrics))
    server.get("/test", () => json_response({ ok: true }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    await client.get("/test")
    await client.get("/test")
    await client.get("/test")

    const output = metrics.export_prometheus()
    expect(output).toContain("http_requests_total 3")
    expect(output).toContain("http_request_duration_seconds_count 3")
  })

  it("should integrate all observability features", async () => {
    const metrics = new PrometheusMetrics()
    const health = new HealthEndpoint()
    health.add_probe("api", () => true)

    server = new HttpServer({ port: 0 })
    server.use(structured_logging_middleware())
    server.use(metrics_middleware(metrics))

    const routes = setup_observability_routes(metrics, health)
    for (const route of routes) {
      server.get(route.path, route.handler)
    }
    server.get("/api/data", () => json_response({ data: "hello" }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    // 正常请求
    const data_resp = await client.get("/api/data")
    expect(data_resp.status).toBe(200)
    expect(data_resp.headers["x-trace-id"]).toBeDefined()

    // 健康检查
    const health_resp = await client.get("/health")
    expect(health_resp.status).toBe(200)

    // 就绪检查
    const ready_resp = await client.get("/ready")
    expect(ready_resp.status).toBe(200)
    expect(ready_resp.body.status).toBe("healthy")

    // 指标
    const metrics_resp = await client.get("/metrics")
    expect(metrics_resp.status).toBe(200)
    expect(metrics_resp.text).toContain("http_requests_total")
    expect(metrics_resp.text).toContain("http_request_duration_seconds")
  })
})
