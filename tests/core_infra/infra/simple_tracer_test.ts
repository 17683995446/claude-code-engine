import { describe, it, expect } from "bun:test"
import { SimpleTracer } from "../../../src/core_infra/infra/simple_tracer.ts"

describe("simple_tracer normal", () => {
  it("should track spans", () => {
    const tracer = new SimpleTracer()
    const id = tracer.start_span("test")
    tracer.end_span(id)
    expect(tracer.get_spans().length).toBe(1)
    expect(tracer.get_spans()[0].name).toBe("test")
  })
})

describe("simple_tracer clear", () => {
  it("should clear spans", () => {
    const tracer = new SimpleTracer()
    const id = tracer.start_span("x")
    tracer.end_span(id)
    tracer.clear()
    expect(tracer.get_spans().length).toBe(0)
  })
})

describe("simple_tracer unknown", () => {
  it("should ignore unknown span id", () => {
    const tracer = new SimpleTracer()
    tracer.end_span("unknown")
    expect(tracer.get_spans().length).toBe(0)
  })
})
