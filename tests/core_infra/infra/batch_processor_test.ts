import { describe, it, expect } from "bun:test"
import { BatchProcessor } from "../../../src/core_infra/infra/batch_processor.ts"

describe("batch_processor normal", () => {
  it("should process all items", async () => {
    const processor: BatchProcessor<number, number> = new BatchProcessor(
      async (n: number) => n * 2,
      2
    )
    processor.submit([1, 2, 3])
    const result = await processor.execute()
    expect(result.total).toBe(3)
    expect(result.succeeded).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.results[0].data).toBe(2)
  })
})

describe("batch_processor boundary", () => {
  it("should handle empty submit", async () => {
    const processor: BatchProcessor<number, number> = new BatchProcessor(
      async (n: number) => n * 2,
      2
    )
    const result = await processor.execute()
    expect(result.total).toBe(0)
    expect(result.succeeded).toBe(0)
  })
})

describe("batch_processor invalid", () => {
  it("should isolate failures", async () => {
    const processor: BatchProcessor<number, number> = new BatchProcessor(
      async (n: number) => {
        if (n === 2) throw new Error("fail")
        return n * 2
      },
      2
    )
    processor.submit([1, 2, 3])
    const result = await processor.execute()
    expect(result.total).toBe(3)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results[1].success).toBe(false)
  })
})

describe("batch_processor null edge", () => {
  it("should clear items", async () => {
    const processor: BatchProcessor<number, number> = new BatchProcessor(
      async (n: number) => n * 2,
      2
    )
    processor.submit([1, 2])
    processor.clear()
    const result = await processor.execute()
    expect(result.total).toBe(0)
  })
})

describe("batch_processor concurrency", () => {
  it("should respect concurrency limit", async () => {
    let max_parallel: number = 0
    let current: number = 0
    const processor: BatchProcessor<number, number> = new BatchProcessor(
      async (n: number) => {
        current++
        if (current > max_parallel) max_parallel = current
        await new Promise((res) => setTimeout(res, 5))
        current--
        return n
      },
      2
    )
    processor.submit([1, 2, 3, 4])
    await processor.execute()
    expect(max_parallel).toBeLessThanOrEqual(2)
  })
})
