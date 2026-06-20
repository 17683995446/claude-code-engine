/**
 * Degradation strategy interface.
 *
 * Defines the contract for automatic graceful degradation.
 */
export interface IDegradationStrategy {
  /**
   * Register a feature with its priority level.
   *
   * @param feature - The feature name.
   * @param priority - Lower number = higher priority (0 = core).
   */
  register(feature: string, priority: number): void

  /**
   * Report system load (0-100).
   *
   * @param load - The current load percentage.
   */
  report_load(load: number): void

  /**
   * Check if a feature should be active under current load.
   *
   * @param feature - The feature name.
   * @returns True if active.
   */
  is_active(feature: string): boolean

  /**
   * Get list of currently degraded features.
   *
   * @returns The degraded feature names.
   */
  get_degraded(): string[]
}
