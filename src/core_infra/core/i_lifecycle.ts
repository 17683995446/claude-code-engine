/**
 * Lifecycle interface for modules.
 */
export interface ILifecycle {
  /**
   * Initialize the module.
   */
  init(): void

  /**
   * Start the module.
   */
  start(): void

  /**
   * Stop the module.
   */
  stop(): void

  /**
   * Check if the module is running.
   *
   * @returns True if running.
   */
  is_running(): boolean
}
