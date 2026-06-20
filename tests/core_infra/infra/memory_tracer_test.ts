import { describe, it, expect } from "bun:test"
import { MemoryTracer } from "../../../src/core_infra/infra/memory_tracer.ts"

describe("memory_tracer", () => {
  it("should start and end span", () => {
    const tracer = new MemoryTracer()
    const id = tracer.start("op1")
    expect(id.length).toBeGreaterThan(0)
    tracer.end(id)
    const spans = tracer.spans()
    expect(spans.length).toBe(1)
    expect(spans[0].name).toBe("op1")
    expect(spans[0].end).toBeDefined()
  })
})
