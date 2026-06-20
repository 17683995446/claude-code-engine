import { describe, it, expect } from "bun:test"
import { MetricsCollector } from "../../../src/core_infra/infra/metrics_collector.ts"

describe("metrics_collector normal", () => {
  it("should record and aggregate", () => {
    const collector = new MetricsCollector()
    collector.record("query", 10)
    collector.record("query", 20)
    const snapshots = collector.get_snapshots()
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].count).toBe(2)
    expect(snapshots[0].avg_time_ms).toBe(15)
    expect(snapshots[0].max_time_ms).toBe(20)
  })
})

describe("metrics_collector clear", () => {
  it("should clear all metrics", () => {
    const collector = new MetricsCollector()
    collector.record("x", 1)
    collector.clear()
    expect(collector.get_snapshots().length).toBe(0)
  })
})

describe("metrics_collector multiple", () => {
  it("should track multiple metrics", () => {
    const collector = new MetricsCollector()
    collector.record("a", 5)
    collector.record("b", 10)
    expect(collector.get_snapshots().length).toBe(2)
  })
})
