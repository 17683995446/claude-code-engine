import { describe, it, expect } from "bun:test"
import { MemorySearchEngine } from "../../../src/core_infra/infra/memory_search_engine.ts"

describe("memory_search_engine", () => {
  it("should index and search", () => {
    const engine = new MemorySearchEngine()
    engine.index("doc1", "hello world")
    engine.index("doc2", "hello bun")
    const result = engine.search("hello")
    expect(result.length).toBe(2)
    expect(result).toContain("doc1")
    expect(result).toContain("doc2")
    engine.remove("doc1")
    expect(engine.search("hello").length).toBe(1)
  })
})
