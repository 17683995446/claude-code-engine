import { describe, it, expect } from "bun:test"
import { MemoryMetrics } from "../../../src/core_infra/infra/memory_metrics.ts"

describe("memory_metrics", () => {
  it("should record and export", () => {
    const m = new MemoryMetrics()
    m.counter("req_total", 1)
    m.counter("req_total", 1)
    m.gauge("active", 5)
    m.histogram("latency", 10)
    m.histogram("latency", 20)
    const out = m.export()
    expect(out).toContain("req_total 2")
    expect(out).toContain("active 5")
    expect(out).toContain("# TYPE latency histogram")
    expect(out).toContain('latency_bucket{le="10"} 1')
    expect(out).toContain('latency_bucket{le="+Inf"} 2')
    expect(out).toContain("latency_sum 30")
    expect(out).toContain("latency_count 2")
  })
})
