import { log_info, log_error, log_warn } from "./global_logger.js"
import type { ITransaction, TransactionResult } from "../core/i_transaction.js"

export class TransactionManager<T> implements ITransaction<T> {
  private active: boolean = false
  private history: T[] = []
  private readonly max_history: number

  constructor(max_history: number = 1000) {
    log_info(`transaction_manager_created: max_history=${max_history}`)
    this.max_history = max_history
  }

  execute(operation: () => T): TransactionResult<T> {
    log_info("transaction_execute_start")
    this.active = true
    try {
      const result: T = operation()
      this.history.push(result)
      if (this.history.length > this.max_history) {
        log_warn(`transaction_history_rotate: ${this.history.length}`)
        this.history.shift()
      }
      log_info("transaction_execute_done")
      return { success: true, data: result, error: null }
    } catch (error) {
      log_error(`transaction_execute_failed: ${error}`)
      return { success: false, data: null, error: String(error) }
    } finally {
      this.active = false
    }
  }

  rollback(): void {
    log_info("transaction_rollback")
    if (this.history.length > 0) {
      this.history.pop()
    }
    this.active = false
  }

  is_active(): boolean {
    log_info(`transaction_is_active: ${this.active}`)
    return this.active
  }

  get_history(): T[] {
    log_info(`transaction_history: ${this.history.length}`)
    return [...this.history]
  }

  clear_history(): void {
    log_info("transaction_clear_history")
    this.history = []
  }
}
