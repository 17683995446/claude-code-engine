import { render_app } from "../../../../../src/services_entry/entry/api_components/components/app_component.ts"
import type { Message } from "../../../../../src/core_infra/core/message_types.ts"
import { describe, it, expect } from "bun:test"

describe("app_component normal", () => {
  it("should render messages", () => {
    const messages: Message[] = [
      { id: "1", content: "hi", role: "user", timestamp: 0 },
    ]
    const result: string = render_app(messages)
    expect(result).toContain("[user] hi")
  })
})

describe("app_component boundary", () => {
  it("should render many messages", () => {
    const messages: Message[] = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      content: "x",
      role: "user",
      timestamp: i,
    }))
    const result: string = render_app(messages)
    expect(result.split("\n").length).toBe(100)
  })
})

describe("app_component invalid", () => {
  it("should handle empty content", () => {
    const messages: Message[] = [
      { id: "1", content: "", role: "assistant", timestamp: 0 },
    ]
    const result: string = render_app(messages)
    expect(result).toBe("[assistant] ")
  })
})

describe("app_component null edge", () => {
  it("should handle empty array", () => {
    const result: string = render_app([])
    expect(result).toBe("")
  })
})
