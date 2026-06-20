import { log_info, log_warn } from "./global_logger.ts"
import type { IFeatureFlag } from "../core/i_feature_flag.ts"

interface FeatureConfig {
  enabled: boolean
  percent: number
}

export class MemoryFeatureFlag implements IFeatureFlag {
  private features: Map<string, FeatureConfig> = new Map()

  enable(feature: string): void {
    log_info(`feature_enable: ${feature}`)
    const cfg: FeatureConfig = this.features.get(feature) ?? { enabled: false, percent: 0 }
    cfg.enabled = true
    cfg.percent = 100
    this.features.set(feature, cfg)
  }

  disable(feature: string): void {
    log_info(`feature_disable: ${feature}`)
    const cfg: FeatureConfig = this.features.get(feature) ?? { enabled: false, percent: 0 }
    cfg.enabled = false
    this.features.set(feature, cfg)
  }

  is_enabled(feature: string, subject_id: string): boolean {
    log_info(`feature_check: ${feature} subject=${subject_id}`)
    const cfg: FeatureConfig | undefined = this.features.get(feature)
    if (!cfg) {
      return false
    }
    if (!cfg.enabled) {
      return false
    }
    if (cfg.percent >= 100) {
      return true
    }
    const hash: number = this.hash(subject_id + feature)
    const bucket: number = Math.abs(hash) % 100
    return bucket < cfg.percent
  }

  set_rollout(feature: string, percent: number): void {
    log_info(`feature_rollout: ${feature}=${percent}%`)
    const existing: FeatureConfig | undefined = this.features.get(feature)
    const cfg: FeatureConfig = existing ?? { enabled: true, percent: 0 }
    cfg.percent = Math.max(0, Math.min(100, percent))
    this.features.set(feature, cfg)
  }

  private hash(input: string): number {
    let h: number = 0
    for (let i: number = 0; i < input.length; i++) {
      h = ((h << 5) - h + input.charCodeAt(i)) | 0
    }
    return h
  }
}
