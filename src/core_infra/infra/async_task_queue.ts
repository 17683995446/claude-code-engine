import { log_info, log_warn } from "./global_logger.ts"
import type { IAsyncTaskQueue } from "../core/i_async_infra.ts"

interface QueueItem<T> {
  task: () => Promise<T>
  priority: number
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  seq: number
}

/**
 * AsyncTaskQueue - 异步任务队列。
 *
 * 支持并发度控制和优先级调度。
 * 任务按优先级（降序）+ 提交顺序（FIFO）调度。
 * 当并发度未满时立即执行，否则排队等待。
 */
export class AsyncTaskQueue<T> implements IAsyncTaskQueue<T> {
  private queue: QueueItem<T>[] = []
  private concurrency: number
  private active_count: number = 0
  private seq_counter: number = 0
  private all_done_resolvers: Array<() => void> = []

  constructor(concurrency: number = 1) {
    log_info(`async_queue_created: concurrency=${concurrency}`)
    this.concurrency = Math.max(1, concurrency)
  }

  submit(task: () => Promise<T>, priority: number = 0): Promise<T> {
    log_info(`async_queue_submit: priority=${priority}`)
    const seq: number = this.seq_counter++
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, priority, resolve, reject, seq })
      // 按优先级降序，同优先级按提交顺序
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return a.seq - b.seq
      })
      this.schedule()
    })
  }

  async wait_all(): Promise<void> {
    log_info("async_queue_wait_all")
    if (this.active_count === 0 && this.queue.length === 0) {
      return
    }
    return new Promise<void>((resolve) => {
      this.all_done_resolvers.push(resolve)
    })
  }

  pending(): number {
    return this.queue.length
  }

  active(): number {
    return this.active_count
  }

  private schedule(): void {
    while (this.active_count < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!
      this.active_count += 1
      log_info(`async_queue_start: seq=${item.seq} active=${this.active_count}`)

      item.task()
        .then((result) => {
          this.complete_task(item, false)
          item.resolve(result)
        })
        .catch((err) => {
          this.complete_task(item, false)
          item.reject(err)
        })
    }
  }

  private complete_task(_item: QueueItem<T>, _error: boolean): void {
    this.active_count -= 1
    log_info(`async_queue_done: seq=${_item.seq} active=${this.active_count}`)
    if (this.queue.length > 0) {
      this.schedule()
    } else if (this.active_count === 0) {
      this.notify_all_done()
    }
  }

  private notify_all_done(): void {
    const resolvers = this.all_done_resolvers
    this.all_done_resolvers = []
    for (const r of resolvers) {
      r()
    }
  }
}
