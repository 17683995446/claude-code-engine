import { Tool } from "../../../src/core_infra/core/tool.js"
import type { ToolInput, ToolOutput } from "../../../src/core_infra/core/tool_types.js"
import { describe, it, expect } from "bun:test"

class TestTool extends Tool {
  execute(input: ToolInput): ToolOutput {
    return { success: true, result: input.name }
  }
}

describe("tool normal", () => {
  it("should create tool", () => {
    const tool = new TestTool("test")
    expect(tool.validate()).toBe(true)
  })

  it("should execute tool", () => {
    const tool = new TestTool("test")
    const output: ToolOutput = tool.execute({ name: "x", schema: {} })
    expect(output.success).toBe(true)
  })
})

describe("tool boundary", () => {
  it("should handle empty name", () => {
    const tool = new TestTool("")
    expect(tool.validate()).toBe(false)
  })
})

describe("tool invalid", () => {
  it("should return result from input", () => {
    const tool = new TestTool("test")
    const output: ToolOutput = tool.execute({ name: "result", schema: {} })
    expect(output.result).toBe("result")
  })
})

describe("tool null edge", () => {
  it("should handle empty schema", () => {
    const tool = new TestTool("test")
    const output: ToolOutput = tool.execute({ name: "x", schema: {} })
    expect(output.success).toBe(true)
  })
})
