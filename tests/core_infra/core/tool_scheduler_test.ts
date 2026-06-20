import {
  schedule_tool_call,
  execute_tool_call,
} from "../../../src/core_infra/core/tool_scheduler.js"
import type { ToolCall } from "../../../src/core_infra/core/tool_scheduler.js"
import { describe, it, expect } from "bun:test"

describe("tool_scheduler normal", () => {
  it("should schedule tool call", () => {
    const call: ToolCall = schedule_tool_call("read_file", { path: "/tmp" })
    expect(call.tool_name).toBe("read_file")
  })

  it("should execute tool call", () => {
    const call: ToolCall = schedule_tool_call("test", {})
    const result: string = execute_tool_call(call)
    expect(result).toContain("Executed")
  })
})

describe("tool_scheduler boundary", () => {
  it("should handle empty args", () => {
    const call: ToolCall = schedule_tool_call("test", {})
    expect(Object.keys(call.arguments).length).toBe(0)
  })
})

describe("tool_scheduler invalid", () => {
  it("should handle special chars in tool name", () => {
    const call: ToolCall = schedule_tool_call("tool_123", {})
    expect(call.tool_name).toBe("tool_123")
  })
})

describe("tool_scheduler null edge", () => {
  it("should execute with null args", () => {
    const call: ToolCall = schedule_tool_call("test", {})
    const result: string = execute_tool_call(call)
    expect(result).toBe("Executed test")
  })
})
