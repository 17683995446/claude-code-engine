import { ShellService } from "../../../../code/src/services_entry/services/shell_service.ts"
import type { ShellCommand } from "../../../../code/src/services_entry/services/shell_types.ts"
import { describe, it, expect } from "bun:test"

function make_cmd(overrides: Partial<ShellCommand> = {}): ShellCommand {
  return {
    command: "echo hello",
    timeout_ms: 5000,
    ...overrides,
  }
}

describe("shell_service normal", () => {
  it("should run valid command", () => {
    const service = new ShellService()
    const result = service.run(make_cmd())
    expect(result.exit_code).toBe(0)
  })

  it("should record history", () => {
    const service = new ShellService()
    service.run(make_cmd())
    expect(service.get_history().length).toBe(1)
  })
})

describe("shell_service boundary", () => {
  it("should reject empty command", () => {
    const service = new ShellService()
    const result = service.run(make_cmd({ command: "" }))
    expect(result.exit_code).toBe(1)
  })

  it("should reject zero timeout", () => {
    const service = new ShellService()
    const result = service.run(make_cmd({ timeout_ms: 0 }))
    expect(result.exit_code).toBe(1)
  })
})

describe("shell_service invalid", () => {
  it("should reject negative timeout", () => {
    const service = new ShellService()
    const result = service.run(make_cmd({ timeout_ms: -1 }))
    expect(result.exit_code).toBe(1)
  })
})

describe("shell_service null edge", () => {
  it("should start with empty history", () => {
    const service = new ShellService()
    expect(service.get_history().length).toBe(0)
  })
})
