/**
 * Consistency checker interface.
 *
 * Defines the contract for data integrity verification.
 */
export interface IConsistencyChecker {
  /**
   * Compute checksum for a data string.
   *
   * @param data - The data to checksum.
   * @returns The checksum string.
   */
  checksum(data: string): string

  /**
   * Verify data matches expected checksum.
   *
   * @param data - The data to verify.
   * @param expected - The expected checksum.
   * @returns True if consistent.
   */
  verify(data: string, expected: string): boolean

  /**
   * Detect corruption by comparing current and stored checksum.
   *
   * @param data - The current data.
   * @param stored_checksum - The stored checksum.
   * @returns True if corruption detected.
   */
  is_corrupted(data: string, stored_checksum: string): boolean
}
