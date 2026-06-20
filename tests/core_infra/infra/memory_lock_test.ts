import { describe, it, expect } from "bun:test"
import { MemoryLock, MemorySemaphore } from "../../../src/core_infra/infra/memory_lock.ts"

describe("memory_lock normal", () => {
  it("should acquire and release", () => {
    const lock = new MemoryLock()
    expect(lock.acquire()).toBe(true)
    expect(lock.is_locked()).toBe(true)
    lock.release()
    expect(lock.is_locked()).toBe(false)
  })
})

describe("memory_lock contention", () => {
  it("should reject second acquire", () => {
    const lock = new MemoryLock()
    lock.acquire()
    expect(lock.acquire()).toBe(false)
  })
})

describe("memory_semaphore normal", () => {
  it("should manage permits", () => {
    const sem = new MemorySemaphore(2)
    expect(sem.available()).toBe(2)
    expect(sem.acquire()).toBe(true)
    expect(sem.available()).toBe(1)
    sem.release()
    expect(sem.available()).toBe(2)
  })
})

describe("memory_semaphore exhaustion", () => {
  it("should reject when exhausted", () => {
    const sem = new MemorySemaphore(1)
    sem.acquire()
    expect(sem.acquire()).toBe(false)
  })
})
