import { log_info, log_error } from "./global_logger.js"
import type { IContainer } from "../core/i_container.js"

type Factory<T> = () => T

export class DiContainer implements IContainer {
  private registry: Map<symbol, new () => unknown> = new Map()
  private factories: Map<symbol, Factory<unknown>> = new Map()
  private singletons: Map<symbol, unknown> = new Map()

  register<T>(token: symbol, implementation: new () => T): void {
    log_info(`di_container_register: ${token.toString()}`)
    this.registry.set(token, implementation)
  }

  register_factory<T>(token: symbol, factory: Factory<T>): void {
    log_info(`di_container_register_factory: ${token.toString()}`)
    this.factories.set(token, factory)
  }

  resolve<T>(token: symbol): T {
    log_info(`di_container_resolve: ${token.toString()}`)
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T
    }
    const factory = this.factories.get(token)
    if (factory) {
      const instance: T = factory() as T
      this.singletons.set(token, instance)
      log_info(`di_container_resolved_factory: ${token.toString()}`)
      return instance
    }
    const ctor = this.registry.get(token)
    if (!ctor) {
      log_error(`di_container_not_found: ${token.toString()}`)
      throw new Error(`Service not registered: ${token.toString()}`)
    }
    const instance: T = new ctor()
    this.singletons.set(token, instance)
    log_info(`di_container_resolved: ${token.toString()}`)
    return instance
  }
}

let GLOBAL_CONTAINER: DiContainer | null = null

export function get_global_container(): DiContainer {
  if (!GLOBAL_CONTAINER) {
    log_info("di_container_global_init")
    GLOBAL_CONTAINER = new DiContainer()
  }
  return GLOBAL_CONTAINER
}

export function reset_global_container(): void {
  log_info("di_container_global_reset")
  GLOBAL_CONTAINER = null
}
