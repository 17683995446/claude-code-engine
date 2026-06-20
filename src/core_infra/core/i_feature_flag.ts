/**
 * Feature flag interface.
 *
 * Defines the contract for gradual rollout and gray release.
 */
export interface IFeatureFlag {
  /**
   * Enable a feature globally.
   *
   * @param feature - The feature name.
   */
  enable(feature: string): void

  /**
   * Disable a feature globally.
   *
   * @param feature - The feature name.
   */
  disable(feature: string): void

  /**
   * Check if feature is enabled for a subject.
   *
   * @param feature - The feature name.
   * @param subject_id - The subject identifier (user/tenant).
   * @returns True if enabled.
   */
  is_enabled(feature: string, subject_id: string): boolean

  /**
   * Set rollout percentage (0-100).
   *
   * @param feature - The feature name.
   * @param percent - The rollout percentage.
   */
  set_rollout(feature: string, percent: number): void
}
