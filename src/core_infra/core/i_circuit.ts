/**
 * Rate limiter interface.
 */
export interface IRateLimiter {
  /**
   * Try to acquire a permit.
   *
   * @returns True if allowed.
   */
  try_acquire(): boolean

  /**
   * Get remaining permits.
   *
   * @returns The remaining count.
   */
  remaining(): number
}

/**
 * Circuit breaker state.
 */
export type CircuitState = "closed" | "open" | "half_open"

/**
 * Circuit breaker interface.
 *
 * @deprecated 使用 IAsyncCircuitBreaker（i_async_infra.ts）替代。
 * 同步版本仍可用于简单场景，但新代码应优先使用异步版本。
 */
export interface ICircuitBreaker {
  /**
   * Execute an operation through the circuit breaker.
   *
   * @param operation - The operation to execute.
   * @returns The result or fallback.
   */
  execute<T>(operation: () => T, fallback: T): T

  /**
   * Get the current circuit state.
   *
   * @returns The circuit state.
   */
  get_state(): CircuitState

  /**
   * Record a success.
   */
  record_success(): void

  /**
   * Record a failure.
   */
  record_failure(): void
}
