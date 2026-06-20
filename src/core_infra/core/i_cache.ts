/**
 * Cache interface.
 *
 * Defines the contract for key-value caching with TTL.
 */
export interface ICache {
  /**
   * Get a value by key.
   *
   * @param key - The cache key.
   * @returns The value, or undefined if missing/expired.
   */
  get(key: string): string | undefined

  /**
   * Set a value with optional TTL.
   *
   * @param key - The cache key.
   * @param value - The value to store.
   * @param ttl_ms - Time-to-live in milliseconds.
   */
  set(key: string, value: string, ttl_ms?: number): void

  /**
   * Remove a key.
   *
   * @param key - The cache key.
   */
  remove(key: string): void

  /**
   * Clear all entries.
   */
  clear(): void
}
