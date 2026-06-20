import { log_info, log_warn } from "./global_logger.ts"
import type { IDegradationStrategy } from "../core/i_degradation.ts"

interface FeaturePriority {
  feature: string
  priority: number
}

export class MemoryDegradation implements IDegradationStrategy {
  private features: FeaturePriority[] = []
  private current_load: number = 0
  private threshold_low: number = 60
  private threshold_high: number = 85

  register(feature: string, priority: number): void {
    log_info(`degradation_register: ${feature} priority=${priority}`)
    const existing_idx: number = this.features.findIndex((f) => f.feature === feature)
    if (existing_idx >= 0) {
      this.features[existing_idx] = { feature, priority }
    } else {
      this.features.push({ feature, priority })
    }
    this.features.sort((a, b) => a.priority - b.priority)
  }

  report_load(load: number): void {
    log_info(`degradation_load: ${load}`)
    this.current_load = Math.max(0, Math.min(100, load))
  }

  is_active(feature: string): boolean {
    log_info(`degradation_check: ${feature}`)
    const fp: FeaturePriority | undefined = this.features.find((f) => f.feature === feature)
    if (!fp) {
      return true
    }
    if (this.current_load < this.threshold_low) {
      return true
    }
    if (this.current_load >= this.threshold_high) {
      return fp.priority <= 0
    }
    return fp.priority <= 1
  }

  get_degraded(): string[] {
    log_info("degradation_list")
    return this.features
      .filter((f) => !this.is_active(f.feature))
      .map((f) => f.feature)
  }
}
