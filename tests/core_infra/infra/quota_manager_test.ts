import { describe, it, expect } from "bun:test"
import { QuotaManager } from "../../../src/core_infra/infra/quota_manager.ts"

describe("quota_manager normal", () => {
  it("should acquire within limit", () => {
    const qm: QuotaManager = new QuotaManager(10)
    const ok: boolean = qm.acquire("t1", "r1", 5)
    expect(ok).toBe(true)
    expect(qm.get_usage("t1", "r1")).toBe(5)
  })
})

describe("quota_manager boundary", () => {
  it("should reject over limit", () => {
    const qm: QuotaManager = new QuotaManager(10)
    qm.acquire("t1", "r1", 8)
    const ok: boolean = qm.acquire("t1", "r1", 3)
    expect(ok).toBe(false)
  })
})

describe("quota_manager invalid", () => {
  it("should release quota", () => {
    const qm: QuotaManager = new QuotaManager(10)
    qm.acquire("t1", "r1", 8)
    qm.release("t1", "r1", 3)
    expect(qm.get_usage("t1", "r1")).toBe(5)
  })
})

describe("quota_manager null edge", () => {
  it("should not go negative on release", () => {
    const qm: QuotaManager = new QuotaManager(10)
    qm.release("t1", "r1", 5)
    expect(qm.get_usage("t1", "r1")).toBe(0)
  })
})

describe("quota_manager tenant isolation", () => {
  it("should isolate tenants", () => {
    const qm: QuotaManager = new QuotaManager(10)
    qm.acquire("t1", "r1", 10)
    const ok: boolean = qm.acquire("t2", "r1", 5)
    expect(ok).toBe(true)
  })
})

describe("quota_manager custom_limit", () => {
  it("should respect custom limit", () => {
    const qm: QuotaManager = new QuotaManager(100)
    qm.set_limit("t1", "r1", 5)
    const ok: boolean = qm.acquire("t1", "r1", 6)
    expect(ok).toBe(false)
  })
})
