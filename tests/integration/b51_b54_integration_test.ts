import { describe, it, expect } from "bun:test"
import { MemoryConfigCenter } from "../../src/core_infra/infra/memory_config_center.ts"
import { MemoryServiceRegistry } from "../../src/core_infra/infra/memory_service_registry.ts"
import { MemoryTracer } from "../../src/core_infra/infra/memory_tracer.ts"
import { MemoryMetrics } from "../../src/core_infra/infra/memory_metrics.ts"

describe("b51_b54_integration", () => {
  it("should integrate config + registry + tracer + metrics", async () => {
    const cfg = new MemoryConfigCenter()
    const reg = new MemoryServiceRegistry()
    const tracer = new MemoryTracer()
    const metrics = new MemoryMetrics()

    await cfg.load()
    cfg.set("svc_name", "api")
    expect(cfg.get("svc_name")).toBe("api")

    reg.register("api", "http://localhost:3000")
    expect(reg.discover("api").length).toBe(1)

    const span = tracer.start("request")
    metrics.counter("requests", 1)
    metrics.gauge("active", 1)
    metrics.histogram("latency", 50)
    tracer.end(span)

    expect(tracer.spans().length).toBe(1)
    expect(tracer.spans()[0].end).toBeDefined()

    const out = metrics.export()
    expect(out).toContain("requests 1")
    expect(out).toContain("active 1")
    expect(out).toContain("latency_count 1")
    expect(out).toContain("latency_sum 50")
  })
})
