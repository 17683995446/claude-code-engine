/**
 * Config center interface.
 *
 * Defines the contract for dynamic configuration management.
 */
export interface IConfigCenter {
  /**
   * Get a config value by key.
   *
   * @param key - The config key.
   * @returns The value, or undefined if not found.
   */
  get(key: string): string | undefined

  /**
   * Set a config value.
   *
   * @param key - The config key.
   * @param value - The config value.
   */
  set(key: string, value: string): void

  /**
   * Load config from a source.
   */
  load(): Promise<void>

  /**
   * Watch for config changes.
   *
   * @param callback - Called when config changes.
   */
  watch(callback: (key: string, value: string) => void): void
}
