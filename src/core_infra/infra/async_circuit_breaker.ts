import { log_info, log_warn } from "./global_logger.ts"
import type { IAsyncCircuitBreaker } from "../core/i_async_infra.ts"
import type { CircuitState } from "../core/i_circuit.ts"

/**
 * AsyncCircuitBreaker - 异步熔断器。
 *
 * 支持异步操作的熔断保护，与同步版 CircuitBreaker 语义一致。
 * 当操作失败次数达到阈值时熔断，超时后进入半开状态尝试恢复。
 */
export class AsyncCircuitBreaker implements IAsyncCircuitBreaker {
  private state: CircuitState = "closed"
  private failures: number = 0
  private threshold: number
  private last_failure_time: number = 0
  private timeout_ms: number

  constructor(threshold: number, timeout_ms: number) {
    log_info(`async_circuit_created: threshold=${threshold}`)
    this.threshold = threshold
    this.timeout_ms = timeout_ms
  }

  async execute<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    log_info(`async_circuit_execute: state=${this.state}`)
    if (this.state === "open") {
      if (Date.now() - this.last_failure_time > this.timeout_ms) {
        log_info("async_circuit_half_open")
        this.state = "half_open"
      } else {
        log_warn("async_circuit_open_fallback")
        return fallback
      }
    }
    try {
      const result: T = await operation()
      this.record_success()
      return result
    } catch (error) {
      this.record_failure()
      return fallback
    }
  }

  get_state(): CircuitState {
    log_info(`async_circuit_state: ${this.state}`)
    return this.state
  }

  record_success(): void {
    log_info("async_circuit_success")
    this.failures = 0
    if (this.state === "half_open") {
      this.state = "closed"
    }
  }

  record_failure(): void {
    log_warn(`async_circuit_failure: ${this.failures + 1}`)
    this.failures += 1
    this.last_failure_time = Date.now()
    if (this.failures >= this.threshold) {
      log_warn("async_circuit_tripped_open")
      this.state = "open"
    }
  }
}
