/**
 * Service registry interface.
 */
export interface IRegistry {
  /**
   * Register a service with a name.
   *
   * @param name - The service name.
   * @param instance - The service instance.
   */
  register_service<T>(name: string, instance: T): void

  /**
   * Discover a service by name.
   *
   * @param name - The service name.
   * @returns The service instance or null.
   */
  discover<T>(name: string): T | null

  /**
   * List all registered service names.
   *
   * @returns The array of names.
   */
  list_services(): string[]
}
