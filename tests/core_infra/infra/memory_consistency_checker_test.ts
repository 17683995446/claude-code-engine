import { describe, it, expect } from "bun:test"
import { MemoryConsistencyChecker } from "../../../src/core_infra/infra/memory_consistency_checker.ts"

describe("memory_consistency_checker", () => {
  it("should compute consistent checksum", () => {
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const a: string = cc.checksum("hello")
    const b: string = cc.checksum("hello")
    expect(a).toBe(b)
  })

  it("should detect different data", () => {
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const a: string = cc.checksum("hello")
    const b: string = cc.checksum("world")
    expect(a).not.toBe(b)
  })

  it("should verify matching checksum", () => {
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const sum: string = cc.checksum("data")
    expect(cc.verify("data", sum)).toBe(true)
  })

  it("should detect corruption", () => {
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const sum: string = cc.checksum("original")
    expect(cc.is_corrupted("tampered", sum)).toBe(true)
  })

  it("should not flag valid data", () => {
    const cc: MemoryConsistencyChecker = new MemoryConsistencyChecker()
    const sum: string = cc.checksum("valid")
    expect(cc.is_corrupted("valid", sum)).toBe(false)
  })
})
