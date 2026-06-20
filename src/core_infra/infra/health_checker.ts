import { log_info, log_warn } from "./global_logger.js"
import type { IHealthChecker, IHealthResult, HealthStatus } from "../core/i_health.js"

export class HealthChecker implements IHealthChecker {
  private probes: Map<string, () => boolean> = new Map()

  register(name: string, probe: () => boolean): void {
    log_info(`health_register: ${name}`)
    this.probes.set(name, probe)
  }

  check_all(): IHealthResult[] {
    log_info("health_check_all")
    const results: IHealthResult[] = []
    for (const [name, probe] of this.probes) {
      results.push(this.run_probe(name, probe))
    }
    return results
  }

  private run_probe(name: string, probe: () => boolean): IHealthResult {
    let ok: boolean = false
    try {
      ok = probe()
    } catch (e) {
      log_warn(`health_check_exception: ${name} ${e}`)
      ok = false
    }
    const status: HealthStatus = ok ? "healthy" : "unhealthy"
    if (!ok) {
      log_warn(`health_check_failed: ${name}`)
    }
    const message: string = ok ? "ok" : "failed"
    return { name, status, message, timestamp: Date.now() }
  }

  overall_status(): HealthStatus {
    log_info("health_overall_status")
    if (this.probes.size === 0) {
      log_warn("health_no_probes")
      return "unhealthy"
    }
    const results = this.check_all()
    if (results.every((r) => r.status === "healthy")) {
      return "healthy"
    }
    if (results.some((r) => r.status === "healthy")) {
      return "degraded"
    }
    return "unhealthy"
  }
}
