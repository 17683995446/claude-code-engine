import { ErrorCode } from "../../../src/core_infra/core/error_code_enum.js"
import { describe, it, expect } from "bun:test"

describe("error_code_enum", () => {
  it("should contain UNKNOWN_ERROR", () => {
    expect(ErrorCode.UNKNOWN_ERROR).toBe(1000)
  })

  it("should contain AUTH_UNAUTHORIZED", () => {
    expect(ErrorCode.AUTH_UNAUTHORIZED).toBe(1100)
  })

  it("should contain SHELL_TIMEOUT", () => {
    expect(ErrorCode.SHELL_TIMEOUT).toBe(1201)
  })

  it("should contain API_RATE_LIMITED", () => {
    expect(ErrorCode.API_RATE_LIMITED).toBe(1301)
  })

  it("should contain FILE_NOT_FOUND", () => {
    expect(ErrorCode.FILE_NOT_FOUND).toBe(1400)
  })

  it("should contain CONFIG_INVALID", () => {
    expect(ErrorCode.CONFIG_INVALID).toBe(1501)
  })

  it("should contain MESSAGE_TOO_LARGE", () => {
    expect(ErrorCode.MESSAGE_TOO_LARGE).toBe(1602)
  })
})
