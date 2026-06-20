import type { IPlugin } from "./i_plugin.ts"

/**
 * Plugin manager interface.
 *
 * Manages dynamic plugin lifecycle.
 */
export interface IPluginManager {
  /**
   * Load and activate a plugin.
   *
   * @param plugin - The plugin to load.
   */
  load(plugin: IPlugin): void

  /**
   * Unload and deactivate a plugin by name.
   *
   * @param name - The plugin name.
   */
  unload(name: string): void

  /**
   * List all loaded plugin names.
   *
   * @returns Array of plugin names.
   */
  list(): string[]

  /**
   * Check if a plugin is loaded.
   *
   * @param name - The plugin name.
   * @returns True if loaded.
   */
  is_loaded(name: string): boolean
}
