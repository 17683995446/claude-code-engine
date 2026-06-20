/**
 * Chaos engine interface.
 *
 * Defines the contract for fault injection testing.
 */
export interface IChaosEngine {
  /**
   * Inject a random failure with given probability.
   *
   * @param probability - Failure probability (0-1).
   */
  inject(probability: number): void

  /**
   * Inject a latency delay.
   *
   * @param max_ms - Maximum delay in milliseconds.
   */
  delay(max_ms: number): Promise<void>

  /**
   * Enable or disable chaos mode.
   *
   * @param enabled - Whether chaos is enabled.
   */
  set_enabled(enabled: boolean): void
}
