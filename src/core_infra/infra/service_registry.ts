import { log_info, log_warn } from "./global_logger.js"
import type { IRegistry } from "../core/i_registry.js"

export class ServiceRegistry implements IRegistry {
  private services: Map<string, unknown> = new Map()

  register_service<T>(name: string, instance: T): void {
    log_info(`service_registry_register: ${name}`)
    this.services.set(name, instance)
  }

  discover<T>(name: string): T | null {
    log_info(`service_registry_discover: ${name}`)
    if (!this.services.has(name)) {
      log_warn(`service_registry_not_found: ${name}`)
      return null
    }
    return this.services.get(name) as T
  }

  list_services(): string[] {
    log_info(`service_registry_list: ${this.services.size}`)
    return Array.from(this.services.keys())
  }
}
