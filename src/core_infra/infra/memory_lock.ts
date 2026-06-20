import { log_info } from "./global_logger.js"
import type { ILock, ISemaphore } from "../core/i_lock.js"

export class MemoryLock implements ILock {
  private locked: boolean = false

  acquire(): boolean {
    log_info("memory_lock_acquire")
    if (this.locked) {
      return false
    }
    this.locked = true
    return true
  }

  release(): void {
    log_info("memory_lock_release")
    this.locked = false
  }

  is_locked(): boolean {
    log_info(`memory_lock_is_locked: ${this.locked}`)
    return this.locked
  }
}

export class MemorySemaphore implements ISemaphore {
  private permits: number
  private max: number

  constructor(permits: number) {
    log_info(`memory_semaphore_created: ${permits}`)
    this.permits = permits
    this.max = permits
  }

  acquire(): boolean {
    log_info(`memory_semaphore_acquire: ${this.permits}`)
    if (this.permits <= 0) {
      return false
    }
    this.permits -= 1
    return true
  }

  release(): void {
    log_info(`memory_semaphore_release: ${this.permits}`)
    if (this.permits < this.max) {
      this.permits += 1
    }
  }

  available(): number {
    log_info(`memory_semaphore_available: ${this.permits}`)
    return this.permits
  }
}
