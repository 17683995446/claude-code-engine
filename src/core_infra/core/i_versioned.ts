/**
 * Versioned interface.
 *
 * Implemented by services that expose a version contract.
 */
export interface IVersioned {
  /**
   * The semantic version of this service.
   *
   * @returns Version string, e.g. "1.0.0".
   */
  readonly version: string

  /**
   * Check if the service supports a given API version.
   *
   * @param api_version - The requested API version.
   * @returns True if compatible.
   */
  supports(api_version: string): boolean
}
