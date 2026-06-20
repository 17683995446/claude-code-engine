import { describe, test, expect } from "bun:test"
import { ErrorCode } from "../../../src/core_infra/core/error_code_enum.ts"
import {
  get_error_description,
  get_error_suggestion,
  get_error_info,
} from "../../../src/core_infra/core/error_code_descriptions.ts"
import { AppException, ExceptionHandler } from "../../../src/core_infra/infra/exception_handler.ts"
import {
  build_error_response,
  build_error_response_from_exception,
  build_error_response_from_unknown,
  format_error_text,
} from "../../../src/core_infra/infra/friendly_error.ts"

describe("V14 error_code_descriptions completeness", () => {
  test("get_error_description should cover all error codes", () => {
    // 验证所有 60 个错误码都有描述
    const all_codes: ErrorCode[] = Object.values(ErrorCode).filter(
      (v): v is ErrorCode => typeof v === "number",
    )
    expect(all_codes.length).toBe(60)
    for (const code of all_codes) {
      const desc = get_error_description(code)
      expect(desc.length).toBeGreaterThan(0)
      expect(desc).not.toBe("An unexpected error occurred.")
    }
  })

  test("get_error_suggestion should cover all error codes", () => {
    const all_codes: ErrorCode[] = Object.values(ErrorCode).filter(
      (v): v is ErrorCode => typeof v === "number",
    )
    for (const code of all_codes) {
      const suggestion = get_error_suggestion(code)
      expect(suggestion.length).toBeGreaterThan(0)
      expect(suggestion).not.toBe("Check the documentation and logs for more details.")
    }
  })

  test("get_error_description should cover LLM codes (1700-1706)", () => {
    expect(get_error_description(ErrorCode.LLM_REQUEST_FAILED)).toContain("LLM request failed")
    expect(get_error_description(ErrorCode.LLM_API_KEY_MISSING)).toContain("API key is missing")
    expect(get_error_description(ErrorCode.LLM_STREAM_CLOSED)).toContain("closed unexpectedly")
  })

  test("get_error_description should cover Agent codes (1800-1804)", () => {
    expect(get_error_description(ErrorCode.AGENT_NOT_FOUND)).toContain("agent was not found")
    expect(get_error_description(ErrorCode.AGENT_ALREADY_EXISTS)).toContain("already exists")
  })

  test("get_error_description should cover Task codes (1900-1904)", () => {
    expect(get_error_description(ErrorCode.TASK_NOT_FOUND)).toContain("task was not found")
    expect(get_error_description(ErrorCode.TASK_CIRCULAR_DEPENDENCY)).toContain("circular dependency")
  })

  test("get_error_description should cover Skill codes (2000-2004)", () => {
    expect(get_error_description(ErrorCode.SKILL_NOT_FOUND)).toContain("skill was not found")
    expect(get_error_description(ErrorCode.SKILL_VALIDATION_FAILED)).toContain("failed validation")
  })

  test("get_error_description should cover Plan codes (2100-2104)", () => {
    expect(get_error_description(ErrorCode.PLAN_NOT_FOUND)).toContain("plan was not found")
    expect(get_error_description(ErrorCode.PLAN_NOT_CANCELLABLE)).toContain("cannot be cancelled")
  })

  test("get_error_description should cover Daemon codes (2200-2204)", () => {
    expect(get_error_description(ErrorCode.DAEMON_NOT_RUNNING)).toContain("not running")
    expect(get_error_description(ErrorCode.DAEMON_RECOVERY_THRESHOLD)).toContain("threshold was exceeded")
  })
})

describe("V14 get_error_suggestion", () => {
  test("should provide actionable suggestion for AUTH_UNAUTHORIZED", () => {
    const suggestion = get_error_suggestion(ErrorCode.AUTH_UNAUTHORIZED)
    expect(suggestion).toContain("API key")
    expect(suggestion).toContain("Authorization")
  })

  test("should provide actionable suggestion for LLM_API_KEY_MISSING", () => {
    const suggestion = get_error_suggestion(ErrorCode.LLM_API_KEY_MISSING)
    expect(suggestion).toContain("OPENAI_API_KEY")
    expect(suggestion).toContain("environment variable")
  })

  test("should provide actionable suggestion for DAEMON_NOT_RUNNING", () => {
    const suggestion = get_error_suggestion(ErrorCode.DAEMON_NOT_RUNNING)
    expect(suggestion).toContain("POST /api/daemon/start")
    expect(suggestion).toContain("AUTO_START_DAEMON")
  })

  test("should provide actionable suggestion for DAEMON_RECOVERY_THRESHOLD", () => {
    const suggestion = get_error_suggestion(ErrorCode.DAEMON_RECOVERY_THRESHOLD)
    expect(suggestion).toContain("POST /api/daemon/reset")
  })

  test("should provide actionable suggestion for SKILL_NOT_FOUND", () => {
    const suggestion = get_error_suggestion(ErrorCode.SKILL_NOT_FOUND)
    expect(suggestion).toContain("GET /api/skills")
  })
})

describe("V14 get_error_info", () => {
  test("should return complete error info", () => {
    const info = get_error_info(ErrorCode.INVALID_ARGUMENT)
    expect(info.code).toBe(ErrorCode.INVALID_ARGUMENT)
    expect(info.name).toBe("INVALID_ARGUMENT")
    expect(info.description.length).toBeGreaterThan(0)
    expect(info.suggestion.length).toBeGreaterThan(0)
  })

  test("should return correct name for all codes", () => {
    const info = get_error_info(ErrorCode.DAEMON_RECOVERY_THRESHOLD)
    expect(info.name).toBe("DAEMON_RECOVERY_THRESHOLD")
    expect(info.code).toBe(2204)
  })
})

describe("V14 AppException", () => {
  test("should populate description and suggestion", () => {
    const exc = new AppException(ErrorCode.AUTH_API_KEY_MISSING, "api_key_missing")
    expect(exc.code).toBe(ErrorCode.AUTH_API_KEY_MISSING)
    expect(exc.message).toBe("api_key_missing")
    expect(exc.description).toContain("API key is missing")
    expect(exc.suggestion).toContain("API_KEY")
    expect(exc.timestamp).toBeGreaterThan(0)
  })

  test("should be an Error instance", () => {
    const exc = new AppException(ErrorCode.UNKNOWN_ERROR, "test")
    expect(exc).toBeInstanceOf(Error)
    expect(exc.message).toBe("test")
  })

  test("should populate description for all codes", () => {
    const all_codes: ErrorCode[] = Object.values(ErrorCode).filter(
      (v): v is ErrorCode => typeof v === "number",
    )
    for (const code of all_codes) {
      const exc = new AppException(code, "test")
      expect(exc.description.length).toBeGreaterThan(0)
      expect(exc.suggestion.length).toBeGreaterThan(0)
    }
  })
})

describe("V14 ExceptionHandler", () => {
  test("handle should return AppException with friendly info", () => {
    const handler = new ExceptionHandler()
    const result = handler.handle(new AppException(ErrorCode.PLAN_NOT_FOUND, "plan_not_found: 123"))
    expect(result.code).toBe(ErrorCode.PLAN_NOT_FOUND)
    expect(result.description).toContain("plan was not found")
    expect(result.suggestion).toContain("GET /api/plans")
  })

  test("handle should map Error with error code in message", () => {
    const handler = new ExceptionHandler()
    const result = handler.handle(new Error("validation failed: 1001"))
    expect(result.code).toBe(ErrorCode.INVALID_ARGUMENT)
    expect(result.description).toContain("argument is invalid")
    expect(result.suggestion.length).toBeGreaterThan(0)
  })

  test("handle should map unknown error to UNKNOWN_ERROR", () => {
    const handler = new ExceptionHandler()
    const result = handler.handle("some string error")
    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR)
    expect(result.message).toBe("some string error")
    expect(result.description.length).toBeGreaterThan(0)
  })

  test("throw_exception should throw AppException with friendly info", () => {
    const handler = new ExceptionHandler()
    expect(() => handler.throw_exception(ErrorCode.CONFIG_MISSING, "config_missing")).toThrow()
    try {
      handler.throw_exception(ErrorCode.CONFIG_MISSING, "config_missing")
    } catch (e) {
      expect(e).toBeInstanceOf(AppException)
      const exc = e as AppException
      expect(exc.code).toBe(ErrorCode.CONFIG_MISSING)
      expect(exc.description).toContain("configuration is missing")
      expect(exc.suggestion).toContain("config file")
    }
  })
})

describe("V14 friendly_error build_error_response", () => {
  test("should build response with all fields", () => {
    const resp = build_error_response(ErrorCode.AUTH_UNAUTHORIZED, "auth_required")
    expect(resp.error).toBe("auth_unauthorized")
    expect(resp.code).toBe(1100)
    expect(resp.name).toBe("AUTH_UNAUTHORIZED")
    expect(resp.message).toBe("auth_required")
    expect(resp.description).toContain("Authentication is required")
    expect(resp.suggestion).toContain("API key")
  })

  test("should use description as message when not provided", () => {
    const resp = build_error_response(ErrorCode.FILE_NOT_FOUND)
    expect(resp.message).toBe(resp.description)
  })

  test("should build response for all error codes", () => {
    const all_codes: ErrorCode[] = Object.values(ErrorCode).filter(
      (v): v is ErrorCode => typeof v === "number",
    )
    for (const code of all_codes) {
      const resp = build_error_response(code)
      expect(resp.code).toBe(code)
      expect(resp.name.length).toBeGreaterThan(0)
      expect(resp.description.length).toBeGreaterThan(0)
      expect(resp.suggestion.length).toBeGreaterThan(0)
      expect(resp.error.length).toBeGreaterThan(0)
    }
  })
})

describe("V14 friendly_error build_error_response_from_exception", () => {
  test("should build response from AppException", () => {
    const exc = new AppException(ErrorCode.TASK_NOT_FOUND, "task_not_found: abc-123")
    const resp = build_error_response_from_exception(exc)
    expect(resp.code).toBe(ErrorCode.TASK_NOT_FOUND)
    expect(resp.message).toBe("task_not_found: abc-123")
    expect(resp.description).toContain("task was not found")
    expect(resp.suggestion).toContain("task ID")
  })
})

describe("V14 friendly_error build_error_response_from_unknown", () => {
  test("should extract error code from message", () => {
    const resp = build_error_response_from_unknown(new Error("error 1400: file missing"))
    expect(resp.code).toBe(ErrorCode.FILE_NOT_FOUND)
    expect(resp.message).toBe("error 1400: file missing")
  })

  test("should fallback to UNKNOWN_ERROR for generic error", () => {
    const resp = build_error_response_from_unknown(new Error("something went wrong"))
    expect(resp.code).toBe(ErrorCode.UNKNOWN_ERROR)
    expect(resp.message).toBe("something went wrong")
    expect(resp.description.length).toBeGreaterThan(0)
  })

  test("should handle non-Error values", () => {
    const resp = build_error_response_from_unknown("plain string error")
    expect(resp.code).toBe(ErrorCode.UNKNOWN_ERROR)
    expect(resp.message).toBe("plain string error")
  })

  test("should handle null/undefined", () => {
    const resp = build_error_response_from_unknown(null)
    expect(resp.code).toBe(ErrorCode.UNKNOWN_ERROR)
    expect(resp.message).toBe("null")
  })
})

describe("V14 format_error_text", () => {
  test("should format multi-line error text", () => {
    const text = format_error_text(ErrorCode.LLM_API_KEY_MISSING, "openai_key_missing")
    expect(text).toContain("Error [LLM_API_KEY_MISSING]: openai_key_missing")
    expect(text).toContain("Code: 1704")
    expect(text).toContain("Description:")
    expect(text).toContain("Suggestion:")
  })

  test("should use description when message not provided", () => {
    const text = format_error_text(ErrorCode.CONFIG_MISSING)
    expect(text).toContain("Error [CONFIG_MISSING]:")
    expect(text).toContain("A required configuration is missing")
  })
})
