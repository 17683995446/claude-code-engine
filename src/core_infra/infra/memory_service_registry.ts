import { log_info, log_warn } from "./global_logger.ts"
import type { IServiceRegistry } from "../core/i_service_registry.ts"

export class MemoryServiceRegistry implements IServiceRegistry {
  private services: Map<string, Map<string, boolean>> = new Map()

  register(name: string, endpoint: string): void {
    log_info(`registry_register: ${name}=${endpoint}`)
    if (!this.services.has(name)) {
      this.services.set(name, new Map())
    }
    this.services.get(name)!.set(endpoint, true)
  }

  deregister(name: string, endpoint: string): void {
    log_info(`registry_deregister: ${name}=${endpoint}`)
    const eps = this.services.get(name)
    if (eps) {
      eps.delete(endpoint)
    }
  }

  discover(name: string): string[] {
    log_info(`registry_discover: ${name}`)
    const eps = this.services.get(name)
    if (!eps) {
      return []
    }
    const result: string[] = []
    for (const [ep, healthy] of eps) {
      if (healthy) {
        result.push(ep)
      }
    }
    return result
  }

  health(name: string, endpoint: string, healthy: boolean): void {
    log_info(`registry_health: ${name}=${endpoint} healthy=${healthy}`)
    const eps = this.services.get(name)
    if (eps && eps.has(endpoint)) {
      eps.set(endpoint, healthy)
    } else {
      log_warn(`registry_health_unknown: ${name}=${endpoint}`)
    }
  }
}
