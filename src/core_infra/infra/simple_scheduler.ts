import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IScheduler, IScheduledTask } from "../core/i_scheduler.ts"

export class SimpleScheduler implements IScheduler {
  private tasks: Map<string, IScheduledTask> = new Map()
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map()
  private running: boolean = false

  register(task: IScheduledTask): void {
    log_info(`scheduler_register: ${task.id}`)
    this.tasks.set(task.id, task)
    if (this.running && task.enabled) {
      this.start_task(task)
    }
  }

  unregister(id: string): void {
    log_info(`scheduler_unregister: ${id}`)
    this.stop_task(id)
    this.tasks.delete(id)
  }

  start(): void {
    log_info(`scheduler_start: ${this.tasks.size}`)
    this.running = true
    for (const task of this.tasks.values()) {
      if (task.enabled) this.start_task(task)
    }
  }

  stop(): void {
    log_info(`scheduler_stop`)
    this.running = false
    for (const id of this.timers.keys()) {
      this.stop_task(id)
    }
  }

  is_running(): boolean {
    log_info(`scheduler_is_running: ${this.running}`)
    return this.running
  }

  private start_task(task: IScheduledTask): void {
    log_info(`scheduler_start_task: ${task.id}`)
    if (this.timers.has(task.id)) return
    const timer = setInterval(async () => {
      try {
        log_info(`scheduler_execute: ${task.id}`)
        await task.execute()
      } catch (err) {
        log_error(`scheduler_execute_fail: ${task.id} ${err}`)
      }
    }, task.interval_ms)
    this.timers.set(task.id, timer)
  }

  private stop_task(id: string): void {
    log_info(`scheduler_stop_task: ${id}`)
    const timer = this.timers.get(id)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(id)
    }
  }
}
