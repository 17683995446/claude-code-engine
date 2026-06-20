import { AuthService } from "../../../../code/src/services_entry/services/auth_service.ts"
import type { AuthToken } from "../../../../code/src/services_entry/services/auth_types.ts"
import { describe, it, expect } from "bun:test"

function make_token(overrides: Partial<AuthToken> = {}): AuthToken {
  return {
    source: "test",
    token: "secret",
    expires_at: Date.now() + 3600000,
    ...overrides,
  }
}

describe("auth_service normal", () => {
  it("should start unauthenticated", () => {
    const service = new AuthService()
    const status = service.get_status()
    expect(status.is_authenticated).toBe(false)
  })

  it("should set token and authenticate", () => {
    const service = new AuthService()
    service.set_token(make_token())
    const status = service.get_status()
    expect(status.is_authenticated).toBe(true)
  })
})

describe("auth_service boundary", () => {
  it("should detect expired token", () => {
    const service = new AuthService()
    service.set_token(make_token({ expires_at: Date.now() - 1 }))
    expect(service.is_token_expired()).toBe(true)
  })

  it("should detect valid token", () => {
    const service = new AuthService()
    service.set_token(make_token({ expires_at: Date.now() + 10000 }))
    expect(service.is_token_expired()).toBe(false)
  })
})

describe("auth_service invalid", () => {
  it("should throw for empty source", () => {
    const service = new AuthService()
    expect(() => service.set_token(make_token({ source: "" }))).toThrow()
  })

  it("should throw for empty token", () => {
    const service = new AuthService()
    expect(() => service.set_token(make_token({ token: "" }))).toThrow()
  })
})

describe("auth_service null edge", () => {
  it("should treat null token as expired", () => {
    const service = new AuthService()
    expect(service.is_token_expired()).toBe(true)
  })
})
