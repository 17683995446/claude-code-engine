/**
 * Reloadable configuration interface.
 */
export interface IReloadable {
  /**
   * Reload configuration from source.
   *
   * @returns True if reload succeeded.
   */
  reload(): boolean

  /**
   * Get the last reload timestamp.
   *
   * @returns The timestamp in ms.
   */
  last_reloaded_at(): number
}
