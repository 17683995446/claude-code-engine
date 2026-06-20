/**
 * Repository interface.
 *
 * Defines the contract for in-memory collections with persistence.
 */
export interface IRepository<T> {
  /**
   * Add an item to the repository.
   *
   * @param id - The item identifier.
   * @param item - The item to add.
   */
  add(id: string, item: T): void

  /**
   * Get an item by id.
   *
   * @param id - The item identifier.
   * @returns The item, or null if not found.
   */
  get(id: string): T | null

  /**
   * List all items.
   *
   * @returns Array of all items.
   */
  list(): T[]

  /**
   * Persist all items to storage.
   */
  persist(): Promise<void>

  /**
   * Restore items from storage.
   */
  restore(): Promise<void>
}
