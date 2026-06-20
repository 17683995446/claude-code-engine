/**
 * Snapshot interface.
 *
 * Defines the contract for capturing and restoring system snapshots.
 */
export interface ISnapshot {
  /**
   * Capture a snapshot with a name.
   *
   * @param name - The snapshot name.
   */
  capture(name: string): Promise<void>

  /**
   * Restore a snapshot by name.
   *
   * @param name - The snapshot name.
   */
  restore(name: string): Promise<void>

  /**
   * List all available snapshots.
   *
   * @returns Array of snapshot names.
   */
  list(): Promise<string[]>

  /**
   * Delete a snapshot by name.
   *
   * @param name - The snapshot name.
   */
  delete(name: string): Promise<void>
}
