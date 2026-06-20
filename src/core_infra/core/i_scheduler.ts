/**
 * Scheduled task interface.
 */
export interface IScheduledTask {
  readonly id: string
  readonly interval_ms: number
  enabled: boolean
  execute(): Promise<void>
}

/**
 * Scheduler interface.
 *
 * Manages periodic task execution.
 */
export interface IScheduler {
  /**
   * Register a scheduled task.
   *
   * @param task - The task to register.
   */
  register(task: IScheduledTask): void

  /**
   * Unregister a task by id.
   *
   * @param id - The task id.
   */
  unregister(id: string): void

  /**
   * Start the scheduler.
   */
  start(): void

  /**
   * Stop the scheduler.
   */
  stop(): void

  /**
   * Check if the scheduler is running.
   *
   * @returns True if running.
   */
  is_running(): boolean
}
