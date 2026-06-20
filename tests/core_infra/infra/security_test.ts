import { describe, it, expect } from "bun:test"
import { InputSanitizer } from "../../../src/core_infra/infra/input_sanitizer.ts"
import { AuthMiddleware } from "../../../src/core_infra/infra/auth_middleware.ts"

describe("input_sanitizer normal", () => {
  it("should remove dangerous chars", () => {
    const sanitizer = new InputSanitizer()
    expect(sanitizer.sanitize("<script>")).toBe("script")
  })
})

describe("input_sanitizer safety", () => {
  it("should detect unsafe input", () => {
    const sanitizer = new InputSanitizer()
    expect(sanitizer.is_safe("<script>")).toBe(false)
    expect(sanitizer.is_safe("hello")).toBe(true)
  })
})

describe("auth_middleware normal", () => {
  it("should validate token", () => {
    const middleware = new AuthMiddleware()
    middleware.add_valid_token("secret123")
    expect(middleware.check("secret123")).toBe(true)
    expect(middleware.check("wrong")).toBe(false)
  })
})

describe("auth_middleware null", () => {
  it("should reject null token", () => {
    const middleware = new AuthMiddleware()
    expect(middleware.check(null)).toBe(false)
  })
})
