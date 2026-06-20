import { log_info, log_warn } from "./global_logger.js"
import type { ICircuitBreaker, CircuitState } from "../core/i_circuit.js"

export class CircuitBreaker implements ICircuitBreaker {
  private state: CircuitState = "closed"
  private failures: number = 0
  private threshold: number
  private last_failure_time: number = 0
  private timeout_ms: number

  constructor(threshold: number, timeout_ms: number) {
    log_info(`circuit_breaker_created: threshold=${threshold}`)
    this.threshold = threshold
    this.timeout_ms = timeout_ms
  }

  execute<T>(operation: () => T, fallback: T): T {
    log_info(`circuit_execute: state=${this.state}`)
    if (this.state === "open") {
      if (Date.now() - this.last_failure_time > this.timeout_ms) {
        log_info("circuit_half_open")
        this.state = "half_open"
      } else {
        log_warn("circuit_open_fallback")
        return fallback
      }
    }
    try {
      const result = operation()
      this.record_success()
      return result
    } catch (error) {
      this.record_failure()
      return fallback
    }
  }

  get_state(): CircuitState {
    log_info(`circuit_state: ${this.state}`)
    return this.state
  }

  record_success(): void {
    log_info("circuit_success")
    this.failures = 0
    if (this.state === "half_open") {
      this.state = "closed"
    }
  }

  record_failure(): void {
    log_warn(`circuit_failure: ${this.failures + 1}`)
    this.failures += 1
    this.last_failure_time = Date.now()
    if (this.failures >= this.threshold) {
      log_warn("circuit_tripped_open")
      this.state = "open"
    }
  }
}
