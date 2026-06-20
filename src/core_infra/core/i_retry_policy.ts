/**
 * Retry policy interface.
 *
 * Defines the contract for configurable retry strategies.
 *
 * @deprecated 使用 IAsyncRetryPolicy（i_async_infra.ts）替代。
 * 同步版本使用 busy-wait 阻塞事件循环，新代码应优先使用异步版本。
 */
export interface IRetryPolicy {
  /**
   * Execute an operation with retries.
   *
   * @param operation - The operation to execute.
   * @returns The operation result.
   * @throws The last error if all retries exhausted.
   */
  execute<T>(operation: () => T): T

  /**
   * Get the configured max retries.
   *
   * @returns The max retry count.
   */
  get_max_retries(): number
}
