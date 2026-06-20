/**
 * Quota manager interface.
 *
 * Defines the contract for per-tenant per-resource quota enforcement.
 */
export interface IQuotaManager {
  /**
   * Attempt to acquire quota.
   *
   * @param tenant - The tenant identifier.
   * @param resource - The resource name.
   * @param cost - The cost to acquire.
   * @returns True if acquired.
   */
  acquire(tenant: string, resource: string, cost: number): boolean

  /**
   * Release quota back to the pool.
   *
   * @param tenant - The tenant identifier.
   * @param resource - The resource name.
   * @param cost - The cost to release.
   */
  release(tenant: string, resource: string, cost: number): void

  /**
   * Get current usage for a tenant/resource.
   *
   * @param tenant - The tenant identifier.
   * @param resource - The resource name.
   * @returns Current usage.
   */
  get_usage(tenant: string, resource: string): number

  /**
   * Set quota limit for a tenant/resource.
   *
   * @param tenant - The tenant identifier.
   * @param resource - The resource name.
   * @param limit - The maximum allowed usage.
   */
  set_limit(tenant: string, resource: string, limit: number): void
}
