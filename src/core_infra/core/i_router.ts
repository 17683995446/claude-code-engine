/**
 * Router interface.
 *
 * Defines the contract for dynamic gateway routing.
 */
export interface IRouter {
  /**
   * Register a route.
   *
   * @param pattern - The path pattern.
   * @param handler - The handler name.
   */
  register(pattern: string, handler: string): void

  /**
   * Match a path to a handler.
   *
   * @param path - The request path.
   * @returns The handler name, or undefined if no match.
   */
  match(path: string): string | undefined

  /**
   * Remove a route.
   *
   * @param pattern - The path pattern.
   */
  remove(pattern: string): void
}
