import { log_info, log_warn } from "./global_logger.ts"
import type { IChaosEngine } from "../core/i_chaos_engine.ts"

export class ChaosEngine implements IChaosEngine {
  private enabled: boolean = true

  inject(probability: number): void {
    log_info(`chaos_inject: ${probability}`)
    if (!this.enabled) {
      return
    }
    if (Math.random() < probability) {
      log_warn("chaos_failure_injected")
      throw new Error("chaos_injected_failure")
    }
  }

  async delay(max_ms: number): Promise<void> {
    log_info(`chaos_delay: ${max_ms}`)
    if (!this.enabled) {
      return
    }
    const ms = Math.floor(Math.random() * max_ms)
    await new Promise((res) => setTimeout(res, ms))
  }

  set_enabled(enabled: boolean): void {
    log_info(`chaos_enabled: ${enabled}`)
    this.enabled = enabled
  }
}
