import { log_info, log_warn } from "./global_logger.js"
import type { ILifecycle } from "../core/i_lifecycle.js"

export class LifecycleManager implements ILifecycle {
  private running: boolean = false
  private modules: ILifecycle[] = []

  register(module: ILifecycle): void {
    log_info("lifecycle_manager_register")
    this.modules.push(module)
  }

  init(): void {
    log_info("lifecycle_manager_init")
    for (const m of this.modules) {
      try {
        m.init()
      } catch (e) {
        log_warn(`lifecycle_init_error: ${e}`)
      }
    }
  }

  start(): void {
    log_info("lifecycle_manager_start")
    for (const m of this.modules) {
      try {
        m.start()
      } catch (e) {
        log_warn(`lifecycle_start_error: ${e}`)
      }
    }
    this.running = true
  }

  stop(): void {
    log_info("lifecycle_manager_stop")
    for (const m of this.modules) {
      try {
        m.stop()
      } catch (e) {
        log_warn(`lifecycle_stop_error: ${e}`)
      }
    }
    this.running = false
  }

  is_running(): boolean {
    log_info(`lifecycle_manager_is_running: ${this.running}`)
    return this.running
  }
}
