import { log_info, log_warn } from "./global_logger.ts"
import type { IRetryPolicy } from "../core/i_retry_policy.ts"

export class ExponentialRetryPolicy implements IRetryPolicy {
  private max_retries: number
  private base_delay_ms: number
  private max_delay_ms: number

  constructor(max_retries: number, base_delay_ms?: number, max_delay_ms?: number) {
    log_info(`retry_policy_created: max=${max_retries}`)
    this.max_retries = max_retries
    this.base_delay_ms = base_delay_ms ?? 10
    this.max_delay_ms = max_delay_ms ?? 1000
  }

  execute<T>(operation: () => T): T {
    let last_error: Error | undefined
    for (let attempt: number = 0; attempt <= this.max_retries; attempt++) {
      log_info(`retry_attempt: ${attempt}`)
      try {
        const result: T = operation()
        return result
      } catch (e) {
        last_error = e as Error
        log_warn(`retry_fail_attempt: ${attempt} ${e}`)
        if (attempt < this.max_retries) {
          const delay: number = this.compute_delay(attempt)
          log_info(`retry_wait: ${delay}ms`)
          this.sleep(delay)
        }
      }
    }
    if (last_error) {
      throw last_error
    }
    throw new Error("retry_exhausted: no operation attempted")
  }

  get_max_retries(): number {
    log_info(`retry_max: ${this.max_retries}`)
    return this.max_retries
  }

  private compute_delay(attempt: number): number {
    const jitter: number = Math.random() * this.base_delay_ms
    const exponential: number = this.base_delay_ms * Math.pow(2, attempt)
    return Math.min(this.max_delay_ms, Math.floor(exponential + jitter))
  }

  private sleep(ms: number): void {
    const start: number = Date.now()
    while (Date.now() - start < ms) {
      // busy wait for deterministic testing
    }
  }
}
