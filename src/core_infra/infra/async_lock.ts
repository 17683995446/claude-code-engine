import { log_info, log_warn } from "./global_logger.ts"
import type { IAsyncLock, IAsyncSemaphore } from "../core/i_async_infra.ts"

/**
 * AsyncLock - 异步互斥锁。
 *
 * 基于 Promise 队列实现，不阻塞事件循环。
 * 支持超时机制。
 */
export class AsyncLock implements IAsyncLock {
  private locked: boolean = false
  private waiters: Array<{ resolve: (v: boolean) => void; timer: ReturnType<typeof setTimeout> }> = []

  async acquire(timeout_ms: number = 0): Promise<boolean> {
    log_info(`async_lock_acquire: locked=${this.locked}`)
    if (!this.locked) {
      this.locked = true
      return true
    }

    if (timeout_ms <= 0) {
      log_warn("async_lock_acquire_failed_no_wait")
      return false
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve)
        if (idx >= 0) {
          this.waiters.splice(idx, 1)
        }
        log_warn("async_lock_acquire_timeout")
        resolve(false)
      }, timeout_ms)

      this.waiters.push({ resolve, timer })
    })
  }

  release(): void {
    log_info("async_lock_release")
    if (!this.locked) {
      log_warn("async_lock_release_not_locked")
      return
    }

    const waiter = this.waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      log_info("async_lock_handoff")
      waiter.resolve(true)
      // 锁直接传递给等待者，保持 locked=true
    } else {
      this.locked = false
    }
  }

  is_locked(): boolean {
    return this.locked
  }
}

/**
 * AsyncSemaphore - 异步信号量。
 *
 * 允许多个并发访问，但限制总数。
 */
export class AsyncSemaphore implements IAsyncSemaphore {
  private permits: number
  private max: number
  private waiters: Array<{ resolve: (v: boolean) => void; timer: ReturnType<typeof setTimeout> }> = []

  constructor(permits: number) {
    log_info(`async_semaphore_created: permits=${permits}`)
    if (permits <= 0) {
      throw new Error(`invalid_permits: ${permits}`)
    }
    this.permits = permits
    this.max = permits
  }

  async acquire(timeout_ms: number = 0): Promise<boolean> {
    log_info(`async_semaphore_acquire: available=${this.permits}`)
    if (this.permits > 0) {
      this.permits -= 1
      return true
    }

    if (timeout_ms <= 0) {
      log_warn("async_semaphore_denied_no_wait")
      return false
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve)
        if (idx >= 0) {
          this.waiters.splice(idx, 1)
        }
        log_warn("async_semaphore_acquire_timeout")
        resolve(false)
      }, timeout_ms)

      this.waiters.push({ resolve, timer })
    })
  }

  release(): void {
    log_info("async_semaphore_release")
    const waiter = this.waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      log_info("async_semaphore_handoff")
      waiter.resolve(true)
      // 许可直接传递给等待者，permits 不变
    } else {
      if (this.permits < this.max) {
        this.permits += 1
      } else {
        log_warn("async_semaphore_release_overflow")
      }
    }
  }

  available(): number {
    return this.permits
  }
}
