/**
 * Migration interface.
 *
 * Defines the contract for data schema migrations.
 */
export interface IMigration {
  /**
   * Unique version identifier.
   */
  readonly version: string

  /**
   * Apply the migration.
   */
  up(): Promise<void>

  /**
   * Revert the migration.
   */
  down(): Promise<void>
}
