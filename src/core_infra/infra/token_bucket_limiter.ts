import { log_info, log_warn } from "./global_logger.js"
import type { IRateLimiter } from "../core/i_circuit.js"

export class TokenBucketLimiter implements IRateLimiter {
  private tokens: number
  private max: number
  private last_refill: number
  private refill_rate_ms: number

  constructor(max_tokens: number, refill_rate_ms: number) {
    log_info(`token_bucket_created: max=${max_tokens}`)
    this.tokens = max_tokens
    this.max = max_tokens
    this.last_refill = Date.now()
    this.refill_rate_ms = refill_rate_ms
  }

  try_acquire(): boolean {
    this.refill()
    log_info(`token_bucket_try: ${this.tokens}`)
    if (this.tokens <= 0) {
      log_warn("token_bucket_denied")
      return false
    }
    this.tokens -= 1
    return true
  }

  remaining(): number {
    this.refill()
    log_info(`token_bucket_remaining: ${this.tokens}`)
    return this.tokens
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.last_refill
    const to_add = Math.floor(elapsed / this.refill_rate_ms)
    if (to_add > 0) {
      this.tokens = Math.min(this.max, this.tokens + to_add)
      this.last_refill = now
    }
  }
}
