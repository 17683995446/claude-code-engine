import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IPluginManager } from "../core/i_plugin_manager.ts"
import type { IPlugin } from "../core/i_plugin.ts"
import type { IContainer } from "../core/i_container.ts"

export class PluginManager implements IPluginManager {
  private plugins: Map<string, IPlugin> = new Map()
  private readonly container: IContainer

  constructor(container: IContainer) {
    log_info("plugin_manager_created")
    this.container = container
  }

  load(plugin: IPlugin): void {
    log_info(`plugin_manager_load: ${plugin.name}`)
    if (this.plugins.has(plugin.name)) {
      log_warn(`plugin_manager_already_loaded: ${plugin.name}`)
      return
    }
    try {
      plugin.activate(this.container)
      this.plugins.set(plugin.name, plugin)
      log_info(`plugin_manager_activated: ${plugin.name}`)
    } catch (err) {
      log_error(`plugin_manager_activate_fail: ${plugin.name} ${err}`)
    }
  }

  unload(name: string): void {
    log_info(`plugin_manager_unload: ${name}`)
    const plugin: IPlugin | undefined = this.plugins.get(name)
    if (!plugin) {
      log_warn(`plugin_manager_not_found: ${name}`)
      return
    }
    try {
      plugin.deactivate()
    } catch (err) {
      log_error(`plugin_manager_deactivate_fail: ${name} ${err}`)
    }
    this.plugins.delete(name)
    log_info(`plugin_manager_unloaded: ${name}`)
  }

  list(): string[] {
    log_info(`plugin_manager_list: ${this.plugins.size}`)
    return Array.from(this.plugins.keys())
  }

  is_loaded(name: string): boolean {
    log_info(`plugin_manager_is_loaded: ${name}`)
    return this.plugins.has(name)
  }
}
