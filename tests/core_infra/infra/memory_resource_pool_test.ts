import { describe, it, expect } from "bun:test"
import { MemoryResourcePool } from "../../../src/core_infra/infra/memory_resource_pool.ts"

describe("memory_resource_pool", () => {
  it("should acquire resources", () => {
    const pool: MemoryResourcePool<number> = new MemoryResourcePool(3, () => 0)
    expect(pool.acquire()).toBe(0)
    expect(pool.acquire()).toBe(0)
    expect(pool.available()).toBe(1)
  })

  it("should return undefined when exhausted", () => {
    const pool: MemoryResourcePool<number> = new MemoryResourcePool(1, () => 0)
    pool.acquire()
    expect(pool.acquire()).toBeUndefined()
  })

  it("should release back to pool", () => {
    const pool: MemoryResourcePool<string> = new MemoryResourcePool(2, () => "x")
    const r: string | undefined = pool.acquire()
    expect(pool.available()).toBe(1)
    if (r) {
      pool.release(r)
    }
    expect(pool.available()).toBe(2)
  })

  it("should report total size", () => {
    const pool: MemoryResourcePool<number> = new MemoryResourcePool(5, () => 0)
    expect(pool.size()).toBe(5)
  })

  it("should not exceed max on release", () => {
    let counter: number = 0
    const pool: MemoryResourcePool<number> = new MemoryResourcePool(2, () => { counter += 1; return counter })
    const r1: number | undefined = pool.acquire()
    const r2: number | undefined = pool.acquire()
    if (r1) {
      pool.release(r1)
    }
    if (r2) {
      pool.release(r2)
    }
    expect(pool.available()).toBe(2)
    pool.release(999)
    expect(pool.available()).toBe(2)
  })
})
