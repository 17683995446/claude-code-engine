import { describe, it, expect } from "bun:test"
import { DistributedLock } from "../../../src/core_infra/infra/distributed_lock.ts"

describe("distributed_lock", () => {
  it("should acquire and release", () => {
    const lock = new DistributedLock()
    expect(lock.acquire()).toBe(true)
    expect(lock.is_locked()).toBe(true)
    expect(lock.acquire()).toBe(false)
    lock.release()
    expect(lock.is_locked()).toBe(false)
  })
})
