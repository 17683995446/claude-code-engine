/**
 * Service locator / DI container interface.
 */
export interface IContainer {
  /**
   * Register a service implementation for an interface token.
   *
   * @param token - The interface token.
   * @param implementation - The constructor.
   */
  register<T>(token: symbol, implementation: new () => T): void

  /**
   * Register a factory function for an interface token.
   *
   * @param token - The interface token.
   * @param factory - The factory function.
   */
  register_factory<T>(token: symbol, factory: () => T): void

  /**
   * Resolve a service by token.
   *
   * @param token - The interface token.
   * @returns The service instance.
   * @throws Error if not registered.
   */
  resolve<T>(token: symbol): T
}
