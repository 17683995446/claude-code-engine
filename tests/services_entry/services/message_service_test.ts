import { MessageService } from "../../../../code/src/services_entry/services/message_service.ts"
import type { Message } from "../../../../code/src/core_infra/core/message_types.ts"
import { describe, it, expect } from "bun:test"

describe("message_service normal", () => {
  it("should add message", () => {
    const service = new MessageService()
    const msg: Message = service.add("hello", "user")
    expect(msg.content).toBe("hello")
  })

  it("should get all messages", () => {
    const service = new MessageService()
    service.add("a", "user")
    service.add("b", "assistant")
    expect(service.get_all().length).toBe(2)
  })
})

describe("message_service boundary", () => {
  it("should normalize whitespace", () => {
    const service = new MessageService()
    service.add("  hello  ", "user")
    const normalized: Message[] = service.normalize_all()
    expect(normalized[0].content).toBe("hello")
  })
})

describe("message_service invalid", () => {
  it("should handle empty content", () => {
    const service = new MessageService()
    const msg: Message = service.add("", "user")
    expect(msg.content).toBe("")
  })
})

describe("message_service null edge", () => {
  it("should start empty", () => {
    const service = new MessageService()
    expect(service.get_all().length).toBe(0)
  })
})
