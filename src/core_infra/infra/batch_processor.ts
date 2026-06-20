import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IBatchProcessor, BatchResult, BatchItemResult } from "../core/i_batch_processor.ts"

export class BatchProcessor<T, R> implements IBatchProcessor<T, R> {
  private items: T[] = []
  private readonly processor: (item: T) => Promise<R>
  private readonly concurrency: number

  constructor(processor: (item: T) => Promise<R>, concurrency: number = 4) {
    log_info(`batch_processor_created: concurrency=${concurrency}`)
    this.processor = processor
    this.concurrency = concurrency
  }

  submit(items: T[]): void {
    log_info(`batch_processor_submit: ${items.length}`)
    this.items.push(...items)
  }

  clear(): void {
    log_info(`batch_processor_clear: ${this.items.length}`)
    this.items = []
  }

  async execute(): Promise<BatchResult<R>> {
    log_info(`batch_processor_execute: ${this.items.length}`)
    const results: BatchItemResult<R>[] = []
    let succeeded: number = 0
    let failed: number = 0
    const queue: T[] = [...this.items]
    this.items = []
    while (queue.length > 0) {
      const chunk: T[] = queue.splice(0, this.concurrency)
      const chunk_results: BatchItemResult<R>[] = await this.run_chunk(chunk)
      for (const r of chunk_results) {
        results.push(r)
        if (r.success) succeeded++
        else failed++
      }
    }
    log_info(`batch_processor_done: total=${results.length} ok=${succeeded} fail=${failed}`)
    return { total: results.length, succeeded, failed, results }
  }

  private async run_chunk(chunk: T[]): Promise<BatchItemResult<R>[]> {
    log_info(`batch_processor_chunk: ${chunk.length}`)
    const promises: Promise<BatchItemResult<R>>[] = chunk.map((item: T) =>
      this.run_single(item)
    )
    return await Promise.all(promises)
  }

  private async run_single(item: T): Promise<BatchItemResult<R>> {
    log_info(`batch_processor_single_start`)
    try {
      const data: R = await this.processor(item)
      log_info(`batch_processor_single_ok`)
      return { success: true, data, error: null }
    } catch (err) {
      log_error(`batch_processor_single_fail: ${err}`)
      return { success: false, data: null, error: err as Error }
    }
  }
}
