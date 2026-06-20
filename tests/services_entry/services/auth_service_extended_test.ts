import { AuthService } from "../../../../code/src/services_entry/services/auth_service.ts"
import { describe, it, expect } from "bun:test"

describe("auth_service_extended normal", () => {
  it("should validate service with token", () => {
    const service = new AuthService()
    service.set_token({ source: "test", token: "abc", expires_at: Date.now() + 1000 })
    expect(service.validate()).toBe(true)
  })
})

describe("auth_service_extended boundary", () => {
  it("should convert to object", () => {
    const service = new AuthService()
    expect(service.to_object().has_token).toBe(false)
  })
})

describe("auth_service_extended invalid", () => {
  it("should handle status after set", () => {
    const service = new AuthService()
    service.set_token({ source: "test", token: "abc", expires_at: Date.now() + 1000 })
    expect(service.get_status().source).toBe("test")
  })
})

describe("auth_service_extended null edge", () => {
  it("should handle expired check with null", () => {
    const service = new AuthService()
    expect(service.is_token_expired()).toBe(true)
  })
})
