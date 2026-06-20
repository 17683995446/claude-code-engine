import { QueryEngine } from "../../../src/core_infra/core/query_engine.js"
import type { QueryEngineConfig } from "../../../src/core_infra/core/query_engine_config.js"
import type { Message } from "../../../src/core_infra/core/message_types.js"
import { describe, it, expect } from "bun:test"

function make_config(overrides: Partial<QueryEngineConfig> = {}): QueryEngineConfig {
  return {
    cwd: "/tmp",
    initial_messages: [],
    max_turns: 10,
    verbose: false,
    ...overrides,
  }
}

describe("query_engine normal", () => {
  it("should create engine", () => {
    const engine = new QueryEngine(make_config())
    expect(engine.validate()).toBe(true)
  })

  it("should add message", () => {
    const engine = new QueryEngine(make_config())
    const msg: Message = { id: "1", content: "hi", role: "user", timestamp: 0 }
    engine.add_message(msg)
    expect(engine.get_messages().length).toBe(1)
  })
})

describe("query_engine boundary", () => {
  it("should handle empty cwd", () => {
    const engine = new QueryEngine(make_config({ cwd: "" }))
    expect(engine.validate()).toBe(false)
  })

  it("should handle many messages", () => {
    const engine = new QueryEngine(make_config())
    for (let i = 0; i < 100; i++) {
      engine.add_message({ id: String(i), content: "x", role: "user", timestamp: i })
    }
    expect(engine.get_messages().length).toBe(100)
  })
})

describe("query_engine invalid", () => {
  it("should reject negative max_turns config", () => {
    const engine = new QueryEngine(make_config({ max_turns: -1 }))
    expect(engine.to_object().message_count).toBe(0)
  })
})

describe("query_engine null edge", () => {
  it("should handle empty initial messages", () => {
    const engine = new QueryEngine(make_config({ initial_messages: [] }))
    expect(engine.get_messages().length).toBe(0)
  })
})
