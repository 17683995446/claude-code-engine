import { log_info, log_warn } from "./global_logger.ts"
import type { IMetrics } from "../core/i_metrics.ts"

interface HistogramBucket {
  bounds: number[]
  counts: number[]
  sum: number
  total: number
}

/**
 * MemoryMetrics - 内存指标收集器。
 *
 * 使用固定分桶的直方图，避免无界内存增长。
 */
export class MemoryMetrics implements IMetrics {
  private counters: Map<string, number> = new Map()
  private gauges: Map<string, number> = new Map()
  private histograms: Map<string, HistogramBucket> = new Map()
  private readonly default_bounds: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  private readonly max_samples: number = 10000

  counter(name: string, value: number): void {
    log_info(`metrics_counter: ${name}+=${value}`)
    const curr = this.counters.get(name) || 0
    this.counters.set(name, curr + value)
  }

  gauge(name: string, value: number): void {
    log_info(`metrics_gauge: ${name}=${value}`)
    this.gauges.set(name, value)
  }

  histogram(name: string, value: number): void {
    log_info(`metrics_histogram: ${name}=${value}`)
    if (!this.histograms.has(name)) {
      const bounds: number[] = [...this.default_bounds, Infinity]
      this.histograms.set(name, {
        bounds,
        counts: new Array(bounds.length).fill(0),
        sum: 0,
        total: 0,
      })
    }
    const h = this.histograms.get(name)!
    h.sum += value
    h.total += 1
    for (let i = 0; i < h.bounds.length; i++) {
      if (value <= h.bounds[i]) {
        h.counts[i] += 1
      }
    }
    if (h.total > this.max_samples) {
      log_warn(`metrics_histogram_rotate: ${name} total=${h.total}`)
    }
  }

  export(): string {
    log_info("metrics_export")
    const lines: string[] = []
    for (const [n, v] of this.counters) {
      lines.push(`# TYPE ${n} counter`)
      lines.push(`${n} ${v}`)
    }
    for (const [n, v] of this.gauges) {
      lines.push(`# TYPE ${n} gauge`)
      lines.push(`${n} ${v}`)
    }
    for (const [n, h] of this.histograms) {
      lines.push(`# TYPE ${n} histogram`)
      for (let i = 0; i < h.bounds.length; i++) {
        const le = h.bounds[i] === Infinity ? "+Inf" : String(h.bounds[i])
        lines.push(`${n}_bucket{le="${le}"} ${h.counts[i]}`)
      }
      lines.push(`${n}_sum ${h.sum}`)
      lines.push(`${n}_count ${h.total}`)
    }
    return lines.join("\n")
  }
}
