/**
 * Batch item result type.
 */
export type BatchItemResult<T> = {
  success: boolean
  data: T | null
  error: Error | null
}

/**
 * Batch result type.
 */
export type BatchResult<T> = {
  total: number
  succeeded: number
  failed: number
  results: BatchItemResult<T>[]
}

/**
 * Batch processor interface.
 *
 * Defines the contract for executing operations in bulk.
 */
export interface IBatchProcessor<T, R> {
  /**
   * Submit items for batch processing.
   *
   * @param items - The items to process.
   */
  submit(items: T[]): void

  /**
   * Execute all submitted items.
   *
   * @returns The aggregated batch result.
   */
  execute(): Promise<BatchResult<R>>

  /**
   * Clear all pending items.
   */
  clear(): void
}
