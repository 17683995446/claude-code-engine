import type { IContainer } from "./i_container.ts"

/**
 * Plugin interface.
 *
 * Defines the contract for dynamic plugin modules.
 */
export interface IPlugin {
  readonly name: string
  readonly version: string

  /**
   * Activate the plugin with access to the DI container.
   *
   * @param container - The DI container.
   */
  activate(container: IContainer): void

  /**
   * Deactivate the plugin.
   */
  deactivate(): void
}
