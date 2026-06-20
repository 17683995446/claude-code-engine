/**
 * Storage interface.
 *
 * Defines the contract for persistent key-value storage.
 */
export interface IStorage {
  /**
   * Save data under a key.
   *
   * @param key - The storage key.
   * @param data - The data to save.
   */
  save(key: string, data: unknown): Promise<void>

  /**
   * Load data by key.
   *
   * @param key - The storage key.
   * @returns The loaded data, or null if missing.
   */
  load(key: string): Promise<unknown | null>

  /**
   * Delete data by key.
   *
   * @param key - The storage key.
   */
  delete(key: string): Promise<void>

  /**
   * List all keys with a given prefix.
   *
   * @param prefix - The key prefix to match.
   * @returns Array of matching keys.
   */
  list_keys(prefix: string): Promise<string[]>

  /**
   * Close the storage and release any underlying resources.
   *
   * For in-memory implementations this is a no-op.
   * For persistent implementations (e.g. SQLite) this closes connections.
   */
  close(): void
}
