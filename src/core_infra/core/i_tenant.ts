/**
 * Tenant manager interface.
 *
 * Defines the contract for multi-tenant resource isolation.
 */
export interface ITenantManager {
  /**
   * Register a new tenant.
   *
   * @param tenant_id - The unique tenant identifier.
   * @param quota - The resource quota for this tenant.
   */
  register(tenant_id: string, quota: number): void

  /**
   * Check if tenant is allowed to use a resource unit.
   *
   * @param tenant_id - The tenant identifier.
   * @returns True if within quota.
   */
  allow(tenant_id: string): boolean

  /**
   * Release a resource unit for a tenant.
   *
   * @param tenant_id - The tenant identifier.
   */
  release(tenant_id: string): void

  /**
   * Get current usage for a tenant.
   *
   * @param tenant_id - The tenant identifier.
   * @returns Current usage count.
   */
  usage(tenant_id: string): number

  /**
   * Remove a tenant.
   *
   * @param tenant_id - The tenant identifier.
   */
  unregister(tenant_id: string): void
}
