import { describe, it, expect } from "bun:test"
import { MemoryCache } from "../../../src/core_infra/infra/memory_cache.ts"

describe("memory_cache", () => {
  it("should get missing key as undefined", () => {
    const c: MemoryCache = new MemoryCache()
    expect(c.get("missing")).toBeUndefined()
  })

  it("should set and get value", () => {
    const c: MemoryCache = new MemoryCache()
    c.set("k", "v")
    expect(c.get("k")).toBe("v")
  })

  it("should expire after ttl", async () => {
    const c: MemoryCache = new MemoryCache()
    c.set("k", "v", 10)
    expect(c.get("k")).toBe("v")
    await new Promise((r) => setTimeout(r, 20))
    expect(c.get("k")).toBeUndefined()
  })

  it("should remove key", () => {
    const c: MemoryCache = new MemoryCache()
    c.set("k", "v")
    c.remove("k")
    expect(c.get("k")).toBeUndefined()
  })

  it("should clear all", () => {
    const c: MemoryCache = new MemoryCache()
    c.set("a", "1")
    c.set("b", "2")
    c.clear()
    expect(c.get("a")).toBeUndefined()
    expect(c.get("b")).toBeUndefined()
  })
})
