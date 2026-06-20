import { log_info, log_warn } from "./global_logger.ts"
import type { IMessageQueue } from "../core/i_message_queue.ts"

export class MemoryQueue<T> implements IMessageQueue<T> {
  private items: T[] = []

  enqueue(msg: T): void {
    log_info(`memory_queue_enqueue: ${this.items.length + 1}`)
    this.items.push(msg)
  }

  dequeue(): T | undefined {
    log_info(`memory_queue_dequeue: ${this.items.length}`)
    return this.items.shift()
  }

  size(): number {
    log_info(`memory_queue_size: ${this.items.length}`)
    return this.items.length
  }

  clear(): void {
    log_info(`memory_queue_clear: ${this.items.length}`)
    this.items = []
  }
}
