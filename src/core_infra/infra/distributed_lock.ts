import { log_info, log_warn } from "./global_logger.ts"
import type { ILock } from "../core/i_lock.ts"

export class DistributedLock implements ILock {
  private held: boolean = false
  private owner: string = ""

  acquire(): boolean {
    log_info("distributed_lock_acquire")
    if (this.held) {
      log_warn("distributed_lock_busy")
      return false
    }
    this.held = true
    this.owner = `pid_${Math.random()}`
    return true
  }

  release(): void {
    log_info("distributed_lock_release")
    this.held = false
    this.owner = ""
  }

  is_locked(): boolean {
    log_info(`distributed_lock_status: ${this.held}`)
    return this.held
  }
}
