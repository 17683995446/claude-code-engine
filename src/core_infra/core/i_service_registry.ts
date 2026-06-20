/**
 * Service registry interface.
 *
 * Defines the contract for service discovery.
 */
export interface IServiceRegistry {
  /**
   * Register a service instance.
   *
   * @param name - The service name.
   * @param endpoint - The service endpoint.
   */
  register(name: string, endpoint: string): void

  /**
   * Deregister a service instance.
   *
   * @param name - The service name.
   * @param endpoint - The service endpoint.
   */
  deregister(name: string, endpoint: string): void

  /**
   * Discover healthy instances of a service.
   *
   * @param name - The service name.
   * @returns Array of healthy endpoints.
   */
  discover(name: string): string[]

  /**
   * Mark an endpoint as healthy or unhealthy.
   *
   * @param name - The service name.
   * @param endpoint - The service endpoint.
   * @param healthy - Whether the endpoint is healthy.
   */
  health(name: string, endpoint: string, healthy: boolean): void
}
