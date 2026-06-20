import { log_info, log_warn } from "./global_logger.ts"
import type { HealthStatus } from "../core/i_health.js"

/**
 * 健康检查探针函数。
 */
export type HealthProbe = () => boolean | Promise<boolean>

/**
 * 健康检查结果。
 */
export interface HealthCheckResult {
  name: string
  status: HealthStatus
  message: string
  timestamp: number
  latency_ms: number
}

/**
 * 健康检查报告。
 */
export interface HealthReport {
  status: HealthStatus
  checks: HealthCheckResult[]
  timestamp: number
  uptime_ms: number
}

/**
 * HealthEndpoint - 健康检查端点。
 *
 * 支持注册多个探针，聚合健康状态。
 * 提供 readiness 和 liveness 两种检查模式。
 */
export class HealthEndpoint {
  private probes: Map<string, HealthProbe> = new Map()
  private start_time: number

  constructor() {
    log_info("health_endpoint_created")
    this.start_time = Date.now()
  }

  add_probe(name: string, probe: HealthProbe): void {
    log_info(`health_add_probe: ${name}`)
    this.probes.set(name, probe)
  }

  remove_probe(name: string): void {
    log_info(`health_remove_probe: ${name}`)
    this.probes.delete(name)
  }

  async check(): Promise<HealthReport> {
    log_info("health_check_run")
    const checks: HealthCheckResult[] = []

    for (const [name, probe] of this.probes) {
      const check_start = Date.now()
      let ok = false
      let message = "ok"

      try {
        const result = await probe()
        ok = result
        if (!ok) {
          message = "probe_returned_false"
        }
      } catch (e) {
        ok = false
        message = String(e)
      }

      const latency_ms = Date.now() - check_start
      const status: HealthStatus = ok ? "healthy" : "unhealthy"

      if (!ok) {
        log_warn(`health_probe_failed: ${name} ${message}`)
      }

      checks.push({ name, status, message, timestamp: Date.now(), latency_ms })
    }

    const overall: HealthStatus = this.compute_overall(checks)
    return {
      status: overall,
      checks,
      timestamp: Date.now(),
      uptime_ms: Date.now() - this.start_time,
    }
  }

  async liveness(): Promise<HealthStatus> {
    log_info("health_liveness")
    // Liveness 只检查进程是否存活，不检查依赖
    return "healthy"
  }

  async readiness(): Promise<HealthReport> {
    log_info("health_readiness")
    // Readiness 检查所有探针
    return this.check()
  }

  private compute_overall(checks: HealthCheckResult[]): HealthStatus {
    if (checks.length === 0) {
      return "healthy"
    }
    const all_healthy = checks.every((c) => c.status === "healthy")
    if (all_healthy) {
      return "healthy"
    }
    const any_healthy = checks.some((c) => c.status === "healthy")
    if (any_healthy) {
      return "degraded"
    }
    return "unhealthy"
  }
}
