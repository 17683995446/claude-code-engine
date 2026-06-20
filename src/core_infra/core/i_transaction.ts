/**
 * Transaction result type.
 */
export type TransactionResult<T> = {
  success: boolean
  data: T | null
  error: string | null
}

/**
 * Transaction boundary interface.
 */
export interface ITransaction<T> {
  /**
   * Execute operations within a transaction boundary.
   *
   * @param operation - The operation to execute.
   * @returns The transaction result.
   */
  execute(operation: () => T): TransactionResult<T>

  /**
   * Rollback the transaction.
   */
  rollback(): void

  /**
   * Check if the transaction is active.
   *
   * @returns True if active.
   */
  is_active(): boolean
}
