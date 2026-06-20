import {
  create_message,
  normalize_message,
} from "../../../src/core_infra/core/message_pipeline.js"
import type { Message } from "../../../src/core_infra/core/message_types.js"
import { describe, it, expect } from "bun:test"

describe("message_pipeline normal", () => {
  it("should create message", () => {
    const msg: Message = create_message("1", "hello", "user")
    expect(msg.content).toBe("hello")
    expect(msg.role).toBe("user")
  })
})

describe("message_pipeline boundary", () => {
  it("should create message with empty content", () => {
    const msg: Message = create_message("1", "", "user")
    expect(msg.content).toBe("")
  })

  it("should normalize trimmed content", () => {
    const msg: Message = create_message("1", "  hello  ", "user")
    const normalized: Message = normalize_message(msg)
    expect(normalized.content).toBe("hello")
  })
})

describe("message_pipeline invalid", () => {
  it("should handle very long content", () => {
    const long_content: string = "a".repeat(10000)
    const msg: Message = create_message("1", long_content, "user")
    expect(msg.content.length).toBe(10000)
  })
})

describe("message_pipeline null edge", () => {
  it("should create system role message", () => {
    const msg: Message = create_message("1", "sys", "system")
    expect(msg.role).toBe("system")
  })
})
