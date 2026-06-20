import { log_info, log_warn } from "./global_logger.ts"
import type { IAdaptiveRateLimiter } from "../core/i_adaptive_circuit.ts"

export class AdaptiveRateLimiter implements IAdaptiveRateLimiter {
  private tokens: number
  private current_max: number
  private absolute_max: number
  private last_refill: number
  private refill_rate_ms: number
  private errors: number = 0
  private successes: number = 0
  private window_size: number = 10

  constructor(absolute_max: number, refill_rate_ms: number) {
    log_info(`adaptive_limiter_created: max=${absolute_max}`)
    this.absolute_max = absolute_max
    this.current_max = absolute_max
    this.tokens = absolute_max
    this.last_refill = Date.now()
    this.refill_rate_ms = refill_rate_ms
  }

  try_acquire(): boolean {
    this.refill()
    log_info(`adaptive_limiter_try: tokens=${this.tokens}`)
    if (this.tokens <= 0) {
      log_warn("adaptive_limiter_denied")
      return false
    }
    this.tokens -= 1
    return true
  }

  report_error(): void {
    log_warn("adaptive_limiter_error_reported")
    this.errors += 1
    this.adjust_rate()
  }

  report_success(): void {
    log_info("adaptive_limiter_success_reported")
    this.successes += 1
    this.adjust_rate()
  }

  get_current_rate(): number {
    log_info(`adaptive_limiter_rate: ${this.current_max}`)
    return this.current_max
  }

  private refill(): void {
    const now: number = Date.now()
    const elapsed: number = now - this.last_refill
    const to_add: number = Math.floor(elapsed / this.refill_rate_ms)
    if (to_add > 0) {
      this.tokens = Math.min(this.current_max, this.tokens + to_add)
      this.last_refill = now
    }
  }

  private adjust_rate(): void {
    const total: number = this.errors + this.successes
    if (total < this.window_size) {
      return
    }
    const error_rate: number = this.errors / total
    if (error_rate > 0.5) {
      this.current_max = Math.max(1, Math.floor(this.current_max * 0.8))
      log_info(`adaptive_limiter_reduce: ${this.current_max}`)
    } else if (error_rate < 0.1 && this.current_max < this.absolute_max) {
      this.current_max = Math.min(this.absolute_max, Math.ceil(this.current_max * 1.1))
      log_info(`adaptive_limiter_increase: ${this.current_max}`)
    }
    this.errors = 0
    this.successes = 0
  }
}
