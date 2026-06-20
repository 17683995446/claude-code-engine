import { log_info } from "./global_logger.ts"
import type { HttpMiddleware, HttpContext } from "./http_router.ts"
import { PrometheusMetrics } from "./prometheus_metrics.ts"
import { HealthEndpoint } from "./health_endpoint.ts"
import { StructuredLogger } from "./structured_logger.ts"
import { json_response } from "./http_middlewares.ts"

/**
 * 可观测性中间件集合。
 *
 * 将 metrics、health、structured logging 集成到 HTTP 层。
 */

/**
 * 指标采集中间件。
 *
 * 记录请求计数、延迟直方图、状态码分布。
 */
export function metrics_middleware(metrics: PrometheusMetrics): HttpMiddleware {
  metrics.register_counter("http_requests_total", "Total HTTP requests")
  metrics.register_histogram("http_request_duration_seconds", "HTTP request duration", [
    0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
  ])

  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    const start: number = Date.now()
    const response = await next()
    const duration_s: number = (Date.now() - start) / 1000

    metrics.counter("http_requests_total", 1)
    metrics.histogram("http_request_duration_seconds", duration_s)
    metrics.gauge(`http_response_status_${response.status}`, 1)

    return response
  }
}

/**
 * 结构化日志中间件。
 *
 * 为每个请求创建带 trace_id 的结构化日志。
 */
export function structured_logging_middleware(): HttpMiddleware {
  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    const logger = new StructuredLogger()
    const trace_id = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    logger.set_trace_id(trace_id)
    ctx.state["logger"] = logger
    ctx.state["trace_id"] = trace_id

    const start: number = Date.now()
    logger.info("http_request_start", {
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
    })

    const response = await next()
    const duration_ms: number = Date.now() - start

    logger.info("http_request_end", {
      method: ctx.method,
      path: ctx.path,
      status: response.status,
      duration_ms,
    })

    response.headers.set("x-trace-id", trace_id)
    return response
  }
}

/**
 * 创建可观测性路由。
 *
 * 添加 /metrics、/health、/ready 端点。
 */
export function setup_observability_routes(
  metrics: PrometheusMetrics,
  health: HealthEndpoint,
): Array<{ method: "GET"; path: string; handler: (ctx: HttpContext) => Promise<Response> | Response }> {
  const routes: Array<{ method: "GET"; path: string; handler: (ctx: HttpContext) => Promise<Response> | Response }> = []

  // Prometheus metrics 端点
  routes.push({
    method: "GET",
    path: "/metrics",
    handler: () => {
      const text = metrics.export_prometheus()
      return new Response(text, {
        status: 200,
        headers: { "content-type": "text/plain; version=0.0.4" },
      })
    },
  })

  // 健康检查端点（liveness）
  routes.push({
    method: "GET",
    path: "/health",
    handler: async () => {
      const status = await health.liveness()
      return json_response({ status }, 200)
    },
  })

  // 就绪检查端点（readiness）
  routes.push({
    method: "GET",
    path: "/ready",
    handler: async () => {
      const report = await health.readiness()
      const status_code = report.status === "healthy" ? 200 : report.status === "degraded" ? 200 : 503
      return json_response(report, status_code)
    },
  })

  log_info("observability_routes_setup")
  return routes
}
