import { log_info, log_warn } from "./global_logger.ts"
import type { IAdaptiveCircuitBreaker } from "../core/i_adaptive_circuit.ts"

type CircuitState = "closed" | "open" | "half_open"

export class AdaptiveCircuitBreaker implements IAdaptiveCircuitBreaker {
  private state: CircuitState = "closed"
  private failures: number = 0
  private successes: number = 0
  private threshold: number
  private min_threshold: number
  private max_threshold: number
  private last_failure_time: number = 0
  private timeout_ms: number

  constructor(threshold: number, timeout_ms: number, min_threshold?: number, max_threshold?: number) {
    log_info(`adaptive_circuit_created: threshold=${threshold}`)
    this.threshold = threshold
    this.timeout_ms = timeout_ms
    this.min_threshold = min_threshold ?? 1
    this.max_threshold = max_threshold ?? 100
  }

  execute<T>(operation: () => T, fallback: T): T {
    log_info(`adaptive_circuit_execute: state=${this.state}`)
    if (this.state === "open") {
      if (Date.now() - this.last_failure_time > this.timeout_ms) {
        log_info("adaptive_circuit_half_open")
        this.state = "half_open"
      } else {
        log_warn("adaptive_circuit_open_fallback")
        return fallback
      }
    }
    try {
      const result: T = operation()
      this.record_success()
      return result
    } catch (e) {
      this.record_failure()
      return fallback
    }
  }

  get_state(): string {
    log_info(`adaptive_circuit_state: ${this.state}`)
    return this.state
  }

  get_threshold(): number {
    log_info(`adaptive_circuit_threshold: ${this.threshold}`)
    return this.threshold
  }

  private record_success(): void {
    log_info("adaptive_circuit_success")
    this.successes += 1
    this.failures = 0
    if (this.state === "half_open") {
      this.state = "closed"
      this.adjust_threshold(1)
    }
  }

  private record_failure(): void {
    log_warn(`adaptive_circuit_failure: ${this.failures + 1}`)
    this.failures += 1
    this.successes = 0
    this.last_failure_time = Date.now()
    if (this.failures >= this.threshold) {
      log_warn("adaptive_circuit_tripped")
      this.state = "open"
      this.adjust_threshold(-1)
    }
  }

  private adjust_threshold(delta: number): void {
    this.threshold = Math.max(this.min_threshold, Math.min(this.max_threshold, this.threshold + delta))
    log_info(`adaptive_circuit_adjust: threshold=${this.threshold}`)
  }
}
