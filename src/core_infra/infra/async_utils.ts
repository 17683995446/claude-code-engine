import { log_info } from "./global_logger.ts"

/**
 * 异步工具函数集合。
 *
 * 提供基于 Promise 的异步操作原语，替代同步 busy-wait。
 */

/**
 * 异步休眠指定毫秒数。
 *
 * 使用真正的 setTimeout，不阻塞事件循环。
 *
 * @param ms - 休眠毫秒数。
 */
export function async_sleep(ms: number): Promise<void> {
  log_info(`async_sleep: ${ms}ms`)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带超时的异步操作。
 *
 * 如果操作在超时时间内未完成，抛出 TimeoutError。
 *
 * @param operation - 异步操作。
 * @param timeout_ms - 超时毫秒。
 * @param operation_name - 操作名称（用于错误信息）。
 */
export async function with_timeout<T>(
  operation: () => Promise<T>,
  timeout_ms: number,
  operation_name: string = "operation",
): Promise<T> {
  log_info(`with_timeout: ${operation_name} timeout=${timeout_ms}ms`)
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout: ${operation_name} exceeded ${timeout_ms}ms`))
    }, timeout_ms)

    operation()
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * 带截止时间的异步操作。
 *
 * 与 with_timeout 类似，但接受一个绝对时间戳作为截止时间。
 *
 * @param operation - 异步操作。
 * @param deadline - 截止时间戳（Date.now() 基准）。
 * @param operation_name - 操作名称。
 */
export async function with_deadline<T>(
  operation: () => Promise<T>,
  deadline: number,
  operation_name: string = "operation",
): Promise<T> {
  const remaining: number = deadline - Date.now()
  if (remaining <= 0) {
    throw new Error(`deadline_exceeded: ${operation_name}`)
  }
  return with_timeout(operation, remaining, operation_name)
}

/**
 * 异步重试执行。
 *
 * 简化版异步重试，无需创建 RetryPolicy 实例。
 *
 * @param operation - 异步操作。
 * @param max_retries - 最大重试次数。
 * @param delay_ms - 重试间隔毫秒。
 */
export async function retry_async<T>(
  operation: () => Promise<T>,
  max_retries: number = 3,
  delay_ms: number = 100,
): Promise<T> {
  log_info(`retry_async: max=${max_retries} delay=${delay_ms}ms`)
  let last_error: Error | undefined
  for (let attempt: number = 0; attempt <= max_retries; attempt++) {
    try {
      return await operation()
    } catch (e) {
      last_error = e as Error
      log_info(`retry_async_fail: attempt=${attempt} ${e}`)
      if (attempt < max_retries) {
        await async_sleep(delay_ms)
      }
    }
  }
  throw last_error ?? new Error("retry_async_exhausted")
}
