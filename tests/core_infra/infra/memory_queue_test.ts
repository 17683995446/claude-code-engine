import { describe, it, expect } from "bun:test"
import { MemoryQueue } from "../../../src/core_infra/infra/memory_queue.ts"

describe("memory_queue", () => {
  it("should enqueue and dequeue", () => {
    const q = new MemoryQueue<string>()
    q.enqueue("a")
    q.enqueue("b")
    expect(q.size()).toBe(2)
    expect(q.dequeue()).toBe("a")
    expect(q.size()).toBe(1)
    q.clear()
    expect(q.size()).toBe(0)
  })
})
