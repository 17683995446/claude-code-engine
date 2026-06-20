import { describe, it, expect } from "bun:test"
import { ExceptionHandler, AppException } from "../../../src/core_infra/infra/exception_handler.ts"
import { ErrorCode } from "../../../src/core_infra/core/error_code_enum.ts"

describe("exception_handler normal", () => {
  it("should handle AppException", () => {
    const handler = new ExceptionHandler()
    const ex = new AppException(ErrorCode.INVALID_ARGUMENT, "bad arg")
    const result = handler.handle(ex)
    expect(result.code).toBe(ErrorCode.INVALID_ARGUMENT)
    expect(result.message).toBe("bad arg")
  })
})

describe("exception_handler mapping", () => {
  it("should map error code from message", () => {
    const handler = new ExceptionHandler()
    const result = handler.handle(new Error("1004: length must be between 1 and 64"))
    expect(result.code).toBe(ErrorCode.OUT_OF_RANGE)
  })
})

describe("exception_handler unknown", () => {
  it("should handle unknown errors", () => {
    const handler = new ExceptionHandler()
    const result = handler.handle("random string")
    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR)
  })
})

describe("exception_handler throw", () => {
  it("should throw standardized exception", () => {
    const handler = new ExceptionHandler()
    expect(() => handler.throw_exception(ErrorCode.AUTH_UNAUTHORIZED, "no auth")).toThrow(AppException)
  })
})
