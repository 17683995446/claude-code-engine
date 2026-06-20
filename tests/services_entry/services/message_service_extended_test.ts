import { MessageService } from "../../../../code/src/services_entry/services/message_service.ts"
import { describe, it, expect } from "bun:test"

describe("message_service_extended normal", () => {
  it("should validate service", () => {
    const service = new MessageService()
    expect(service.validate()).toBe(true)
  })
})

describe("message_service_extended boundary", () => {
  it("should convert to object", () => {
    const service = new MessageService()
    expect(service.to_object().count).toBe(0)
  })
})

describe("message_service_extended invalid", () => {
  it("should normalize empty", () => {
    const service = new MessageService()
    service.add("  ", "user")
    const normalized = service.normalize_all()
    expect(normalized[0].content).toBe("")
  })
})

describe("message_service_extended null edge", () => {
  it("should handle no messages", () => {
    const service = new MessageService()
    expect(service.normalize_all().length).toBe(0)
  })
})
