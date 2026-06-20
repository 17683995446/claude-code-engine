import { ErrorCode } from "../../../src/core_infra/core/error_code_enum.js"
import { get_error_description } from "../../../src/core_infra/core/error_code_descriptions.js"
import { describe, it, expect } from "bun:test"

describe("error_code_descriptions normal", () => {
  it("should return description for known code", () => {
    const result: string = get_error_description(ErrorCode.UNKNOWN_ERROR)
    expect(result).toBe("An unknown error occurred.")
  })
})

describe("error_code_descriptions boundary", () => {
  it("should return description for first code", () => {
    const result: string = get_error_description(ErrorCode.UNKNOWN_ERROR)
    expect(result.length).toBeGreaterThan(0)
  })

  it("should return description for last code", () => {
    const result: string = get_error_description(ErrorCode.MESSAGE_TOO_LARGE)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe("error_code_descriptions invalid", () => {
  it("should return default for unknown code", () => {
    const result: string = get_error_description(9999 as ErrorCode)
    expect(result).toBe("An unexpected error occurred.")
  })

  it("should return default for negative code", () => {
    const result: string = get_error_description(-1 as ErrorCode)
    expect(result).toBe("An unexpected error occurred.")
  })
})

describe("error_code_descriptions null edge", () => {
  it("should handle zero code gracefully", () => {
    const result: string = get_error_description(0 as ErrorCode)
    expect(result).toBe("An unexpected error occurred.")
  })
})
