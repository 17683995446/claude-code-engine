import { log_info, log_warn } from "./global_logger.ts"
import type { IAsyncResourcePool } from "../core/i_async_infra.ts"

/**
 * AsyncResourcePool - 异步资源池。
 *
 * 当池为空时，acquire 会异步等待资源释放而非立即返回 undefined。
 * 支持超时机制，避免无限等待。
 */
export class AsyncResourcePool<T> implements IAsyncResourcePool<T> {
  private pool: T[] = []
  private max_size: number
  private factory: () => T
  private waiters: Array<{ resolve: (r: T | undefined) => void; timer: ReturnType<typeof setTimeout> }> = []

  constructor(max_size: number, factory: () => T) {
    log_info(`async_pool_created: max=${max_size}`)
    this.max_size = max_size
    this.factory = factory
    for (let i: number = 0; i < max_size; i++) {
      this.pool.push(factory())
    }
  }

  async acquire(timeout_ms: number = 0): Promise<T | undefined> {
    log_info(`async_pool_acquire: available=${this.pool.length} waiters=${this.waiters.length}`)
    if (this.pool.length > 0) {
      return this.pool.pop()!
    }

    if (timeout_ms <= 0) {
      log_warn("async_pool_exhausted_no_wait")
      return undefined
    }

    return new Promise<T | undefined>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve)
        if (idx >= 0) {
          this.waiters.splice(idx, 1)
        }
        log_warn("async_pool_acquire_timeout")
        resolve(undefined)
      }, timeout_ms)

      this.waiters.push({ resolve, timer })
      log_info(`async_pool_waiting: count=${this.waiters.length}`)
    })
  }

  release(resource: T): void {
    log_info("async_pool_release")
    const waiter = this.waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      log_info("async_pool_handoff_to_waiter")
      waiter.resolve(resource)
      return
    }
    if (this.pool.length < this.max_size) {
      this.pool.push(resource)
    } else {
      log_warn("async_pool_release_overflow")
    }
  }

  available(): number {
    log_info(`async_pool_available: ${this.pool.length}`)
    return this.pool.length
  }

  size(): number {
    log_info(`async_pool_size: ${this.max_size}`)
    return this.max_size
  }
}
