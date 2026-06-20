import { log_info, log_warn } from "./global_logger.ts"
import type { IResourcePool } from "../core/i_resource_pool.ts"

export class MemoryResourcePool<T> implements IResourcePool<T> {
  private pool: T[] = []
  private max_size: number
  private factory: () => T

  constructor(max_size: number, factory: () => T) {
    log_info(`resource_pool_created: max=${max_size}`)
    this.max_size = max_size
    this.factory = factory
    for (let i: number = 0; i < max_size; i++) {
      this.pool.push(factory())
    }
  }

  acquire(): T | undefined {
    log_info(`resource_pool_acquire: available=${this.pool.length}`)
    if (this.pool.length === 0) {
      log_warn("resource_pool_exhausted")
      return undefined
    }
    return this.pool.pop()
  }

  release(resource: T): void {
    log_info("resource_pool_release")
    if (this.pool.length < this.max_size) {
      this.pool.push(resource)
    }
  }

  available(): number {
    log_info(`resource_pool_available: ${this.pool.length}`)
    return this.pool.length
  }

  size(): number {
    log_info(`resource_pool_size: ${this.max_size}`)
    return this.max_size
  }
}
