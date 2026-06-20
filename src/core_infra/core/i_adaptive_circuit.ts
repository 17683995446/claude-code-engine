/**
 * Adaptive circuit breaker interface.
 *
 * Extends circuit breaker with dynamic threshold adjustment.
 */
export interface IAdaptiveCircuitBreaker {
  /**
   * Execute an operation with adaptive protection.
   *
   * @param operation - The operation to execute.
   * @param fallback - The fallback value.
   * @returns The result or fallback.
   */
  execute<T>(operation: () => T, fallback: T): T

  /**
   * Get current circuit state.
   *
   * @returns The state string.
   */
  get_state(): string

  /**
   * Get current dynamic threshold.
   *
   * @returns The threshold value.
   */
  get_threshold(): number
}

/**
 * Adaptive rate limiter interface.
 *
 * Adjusts rate based on error rate feedback.
 */
export interface IAdaptiveRateLimiter {
  /**
   * Try to acquire a permit.
   *
   * @returns True if allowed.
   */
  try_acquire(): boolean

  /**
   * Report an error to trigger rate reduction.
   */
  report_error(): void

  /**
   * Report success to allow rate increase.
   */
  report_success(): void

  /**
   * Get current max rate.
   *
   * @returns The current max tokens.
   */
  get_current_rate(): number
}
