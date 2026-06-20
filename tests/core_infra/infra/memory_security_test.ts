import { describe, it, expect } from "bun:test"
import { MemorySecurity } from "../../../src/core_infra/infra/memory_security.ts"

describe("memory_security", () => {
  it("should sanitize html tags", () => {
    const s: MemorySecurity = new MemorySecurity()
    expect(s.sanitize("<script>")).toBe("&lt;script&gt;")
  })

  it("should validate strong token", () => {
    const s: MemorySecurity = new MemorySecurity()
    expect(s.validate_token("Ab1Cd2Ef")).toBe(true)
  })

  it("should reject short token", () => {
    const s: MemorySecurity = new MemorySecurity()
    expect(s.validate_token("Ab1")).toBe(false)
  })

  it("should reject weak token", () => {
    const s: MemorySecurity = new MemorySecurity()
    expect(s.validate_token("abcdefgh")).toBe(false)
  })

  it("should detect dangerous input", () => {
    const s: MemorySecurity = new MemorySecurity()
    expect(s.is_dangerous("<script>alert(1)</script>")).toBe(true)
  })

  it("should allow safe input", () => {
    const s: MemorySecurity = new MemorySecurity()
    expect(s.is_dangerous("hello world")).toBe(false)
  })
})
