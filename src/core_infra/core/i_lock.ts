/**
 * Lock interface for concurrency control.
 */
export interface ILock {
  /**
   * Acquire the lock.
   *
   * @returns True if acquired.
   */
  acquire(): boolean

  /**
   * Release the lock.
   */
  release(): void

  /**
   * Check if the lock is held.
   *
   * @returns True if held.
   */
  is_locked(): boolean
}

/**
 * Semaphore interface for limited concurrency.
 */
export interface ISemaphore {
  /**
   * Acquire a permit.
   *
   * @returns True if acquired.
   */
  acquire(): boolean

  /**
   * Release a permit.
   */
  release(): void

  /**
   * Get available permits.
   *
   * @returns The number of available permits.
   */
  available(): number
}
