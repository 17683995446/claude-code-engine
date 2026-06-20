import type { IVersioned } from "./i_versioned.ts"

/**
 * Version registry interface.
 *
 * Manages versioned services and resolves compatible implementations.
 */
export interface IVersionRegistry {
  /**
   * Register a versioned service under a name.
   *
   * @param name - The service name.
   * @param service - The versioned service instance.
   */
  register(name: string, service: IVersioned): void

  /**
   * Resolve the best matching service for a version.
   *
   * @param name - The service name.
   * @param api_version - The requested API version.
   * @returns The matching service, or null if none.
   */
  resolve(name: string, api_version: string): IVersioned | null

  /**
   * List all registered versions for a service.
   *
   * @param name - The service name.
   * @returns Array of version strings.
   */
  list_versions(name: string): string[]
}
