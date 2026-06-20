/**
 * Resource pool interface.
 *
 * Defines the contract for managing finite reusable resources.
 */
export interface IResourcePool<T> {
  /**
   * Acquire a resource from the pool.
   *
   * @returns The resource, or undefined if pool exhausted.
   */
  acquire(): T | undefined

  /**
   * Release a resource back to the pool.
   *
   * @param resource - The resource to return.
   */
  release(resource: T): void

  /**
   * Get current available count.
   *
   * @returns Available resources.
   */
  available(): number

  /**
   * Get total pool size.
   *
   * @returns Total size.
   */
  size(): number
}
