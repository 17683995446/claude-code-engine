import { log_info } from "./global_logger.js"
import type { IMetricsCollector, IMetricSnapshot } from "../core/i_metrics.js"

type MetricData = {
  count: number
  total: number
  max: number
}

export class MetricsCollector implements IMetricsCollector {
  private metrics: Map<string, MetricData> = new Map()

  record(name: string, duration_ms: number): void {
    log_info(`metrics_record: ${name}=${duration_ms}ms`)
    const existing = this.metrics.get(name)
    if (existing) {
      existing.count += 1
      existing.total += duration_ms
      if (duration_ms > existing.max) {
        existing.max = duration_ms
      }
    } else {
      this.metrics.set(name, { count: 1, total: duration_ms, max: duration_ms })
    }
  }

  get_snapshots(): IMetricSnapshot[] {
    log_info(`metrics_snapshots: ${this.metrics.size}`)
    const results: IMetricSnapshot[] = []
    for (const [name, data] of this.metrics) {
      results.push({
        name,
        count: data.count,
        total_time_ms: data.total,
        avg_time_ms: data.count > 0 ? Math.round(data.total / data.count) : 0,
        max_time_ms: data.max,
      })
    }
    return results
  }

  clear(): void {
    log_info("metrics_clear")
    this.metrics.clear()
  }
}
