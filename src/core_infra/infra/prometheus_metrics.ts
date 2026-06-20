import { log_info } from "./global_logger.ts"
import type { IMetrics } from "../core/i_metrics.ts"

/**
 * Prometheus 指标格式接口。
 *
 * 扩展 IMetrics，添加 Prometheus 格式导出能力。
 */
export interface IPrometheusExporter extends IMetrics {
  /**
   * 导出 Prometheus 格式的指标文本。
   *
   * @returns Prometheus exposition format 文本。
   */
  export_prometheus(): string
}

/**
 * 指标类型。
 */
type MetricType = "counter" | "gauge" | "histogram"

/**
 * 指标元数据。
 */
interface MetricMeta {
  name: string
  type: MetricType
  help: string
  labels: Record<string, string>
}

/**
 * 直方图分桶配置。
 */
interface HistogramBuckets {
  bounds: number[]
  counts: number[]
  sum: number
  total: number
}

/**
 * PrometheusMetrics - Prometheus 格式指标收集器。
 *
 * 支持 counter、gauge、histogram 三种指标类型。
 * 支持标签和分桶。
 * 输出符合 Prometheus exposition format。
 */
export class PrometheusMetrics implements IPrometheusExporter {
  private counters: Map<string, number> = new Map()
  private gauges: Map<string, number> = new Map()
  private histograms: Map<string, HistogramBuckets> = new Map()
  private meta: Map<string, MetricMeta> = new Map()
  private default_buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

  register_counter(name: string, help: string = ""): void {
    log_info(`prom_register_counter: ${name}`)
    this.meta.set(name, { name, type: "counter", help, labels: {} })
  }

  register_gauge(name: string, help: string = ""): void {
    log_info(`prom_register_gauge: ${name}`)
    this.meta.set(name, { name, type: "gauge", help, labels: {} })
  }

  register_histogram(name: string, help: string = "", buckets?: number[]): void {
    log_info(`prom_register_histogram: ${name}`)
    this.meta.set(name, { name, type: "histogram", help, labels: {} })
    const bounds: number[] = buckets ?? this.default_buckets
    this.histograms.set(name, {
      bounds: [...bounds, Infinity],
      counts: new Array(bounds.length + 1).fill(0),
      sum: 0,
      total: 0,
    })
  }

  counter(name: string, value: number): void {
    const curr = this.counters.get(name) || 0
    this.counters.set(name, curr + value)
    if (!this.meta.has(name)) {
      this.meta.set(name, { name, type: "counter", help: "", labels: {} })
    }
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value)
    if (!this.meta.has(name)) {
      this.meta.set(name, { name, type: "gauge", help: "", labels: {} })
    }
  }

  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.register_histogram(name)
    }
    const h = this.histograms.get(name)!
    h.sum += value
    h.total += 1
    for (let i = 0; i < h.bounds.length; i++) {
      if (value <= h.bounds[i]) {
        h.counts[i] += 1
      }
    }
  }

  export(): string {
    return this.export_prometheus()
  }

  export_prometheus(): string {
    log_info("prom_export")
    const lines: string[] = []

    for (const [name, meta] of this.meta) {
      if (meta.help) {
        lines.push(`# HELP ${name} ${meta.help}`)
      }
      lines.push(`# TYPE ${name} ${meta.type}`)

      if (meta.type === "counter") {
        const value = this.counters.get(name) ?? 0
        lines.push(`${name} ${value}`)
      } else if (meta.type === "gauge") {
        const value = this.gauges.get(name) ?? 0
        lines.push(`${name} ${value}`)
      } else if (meta.type === "histogram") {
        const h = this.histograms.get(name)
        if (h) {
          for (let i = 0; i < h.bounds.length; i++) {
            const bound = h.bounds[i]
            const le = bound === Infinity ? "+Inf" : String(bound)
            lines.push(`${name}_bucket{le="${le}"} ${h.counts[i]}`)
          }
          lines.push(`${name}_sum ${h.sum}`)
          lines.push(`${name}_count ${h.total}`)
        }
      }
    }

    return lines.join("\n")
  }
}
