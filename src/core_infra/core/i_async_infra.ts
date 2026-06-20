import type { CircuitState } from "./i_circuit.ts"

/**
 * 异步基础设施接口集合。
 *
 * 集中定义所有异步组件的接口，与同步接口（i_*.ts）对应。
 * 新代码应优先使用异步接口。
 */

/**
 * 异步熔断器接口。
 */
export interface IAsyncCircuitBreaker {
  execute<T>(operation: () => Promise<T>, fallback: T): Promise<T>
  get_state(): CircuitState
  record_success(): void
  record_failure(): void
}

/**
 * 异步重试策略接口。
 */
export interface IAsyncRetryPolicy {
  execute<T>(operation: () => Promise<T>): Promise<T>
  get_max_retries(): number
}

/**
 * 异步资源池接口。
 */
export interface IAsyncResourcePool<T> {
  acquire(timeout_ms?: number): Promise<T | undefined>
  release(resource: T): void
  available(): number
  size(): number
}

/**
 * 异步任务队列接口。
 */
export interface IAsyncTaskQueue<T> {
  submit(task: () => Promise<T>, priority?: number): Promise<T>
  wait_all(): Promise<void>
  pending(): number
  active(): number
}

/**
 * 异步锁接口。
 */
export interface IAsyncLock {
  acquire(timeout_ms?: number): Promise<boolean>
  release(): void
  is_locked(): boolean
}

/**
 * 异步信号量接口。
 */
export interface IAsyncSemaphore {
  acquire(timeout_ms?: number): Promise<boolean>
  release(): void
  available(): number
}
