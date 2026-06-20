import { ShellService } from "../../../../code/src/services_entry/services/shell_service.ts"
import { describe, it, expect } from "bun:test"

describe("shell_service_extended normal", () => {
  it("should get history", () => {
    const service = new ShellService()
    expect(service.get_history().length).toBe(0)
  })
})

describe("shell_service_extended boundary", () => {
  it("should validate service", () => {
    const service = new ShellService()
    expect(service.validate()).toBe(true)
  })
})

describe("shell_service_extended invalid", () => {
  it("should convert to object", () => {
    const service = new ShellService()
    expect(service.to_object().history_count).toBe(0)
  })
})

describe("shell_service_extended null edge", () => {
  it("should handle empty history", () => {
    const service = new ShellService()
    service.run({ command: "", timeout_ms: 0 })
    expect(service.get_history().length).toBe(0)
  })
})
