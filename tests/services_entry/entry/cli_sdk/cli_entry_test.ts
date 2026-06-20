import { run_cli } from "../../../../src/services_entry/entry/cli_sdk/cli_entry.ts"
import type { QueryEngineConfig } from "../../../../src/core_infra/core/query_engine_config.ts"
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

describe("cli_entry normal", () => {
  it("should start cli", () => {
    const result: string = run_cli(make_config())
    expect(result).toBe("cli started")
  })
})

describe("cli_entry boundary", () => {
  it("should reject empty cwd", () => {
    const result: string = run_cli(make_config({ cwd: "" }))
    expect(result).toBe("invalid config")
  })
})

describe("cli_entry invalid", () => {
  it("should reject negative max_turns", () => {
    const result: string = run_cli(make_config({ max_turns: -1 }))
    expect(result).toBe("invalid config")
  })
})

describe("cli_entry null edge", () => {
  it("should handle empty messages", () => {
    const result: string = run_cli(make_config({ initial_messages: [] }))
    expect(result).toBe("cli started")
  })
})
