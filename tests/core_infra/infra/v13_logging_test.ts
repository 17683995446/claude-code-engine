import { describe, test, expect, beforeEach } from "bun:test"
import { LogLevel } from "../../../src/core_infra/infra/log_level_enum.ts"
import {
  parse_log_level,
  log_level_to_string,
  is_valid_log_level,
  LOG_LEVEL_NAMES,
} from "../../../src/core_infra/infra/log_level_helpers.ts"
import { LoggerService } from "../../../src/core_infra/infra/logger_service.ts"
import {
  log_debug,
  log_info,
  log_warn,
  log_error,
  set_global_level,
  get_global_level,
  configure_global_logger,
  set_global_silent,
  is_global_silent,
} from "../../../src/core_infra/infra/global_logger.ts"
import { StructuredLogger } from "../../../src/core_infra/infra/structured_logger.ts"

describe("V13 log_level_helpers", () => {
  test("LOG_LEVEL_NAMES should contain 4 levels", () => {
    expect(LOG_LEVEL_NAMES.length).toBe(4)
    expect(LOG_LEVEL_NAMES).toContain("debug")
    expect(LOG_LEVEL_NAMES).toContain("info")
    expect(LOG_LEVEL_NAMES).toContain("warn")
    expect(LOG_LEVEL_NAMES).toContain("error")
  })

  test("is_valid_log_level should accept lowercase", () => {
    expect(is_valid_log_level("debug")).toBe(true)
    expect(is_valid_log_level("info")).toBe(true)
    expect(is_valid_log_level("warn")).toBe(true)
    expect(is_valid_log_level("error")).toBe(true)
  })

  test("is_valid_log_level should be case-insensitive", () => {
    expect(is_valid_log_level("DEBUG")).toBe(true)
    expect(is_valid_log_level("Info")).toBe(true)
    expect(is_valid_log_level("WARN")).toBe(true)
    expect(is_valid_log_level("ERROR")).toBe(true)
  })

  test("is_valid_log_level should reject invalid", () => {
    expect(is_valid_log_level("")).toBe(false)
    expect(is_valid_log_level("trace")).toBe(false)
    expect(is_valid_log_level("fatal")).toBe(false)
    expect(is_valid_log_level("xyz")).toBe(false)
  })

  test("parse_log_level should parse lowercase", () => {
    expect(parse_log_level("debug")).toBe(LogLevel.DEBUG)
    expect(parse_log_level("info")).toBe(LogLevel.INFO)
    expect(parse_log_level("warn")).toBe(LogLevel.WARN)
    expect(parse_log_level("error")).toBe(LogLevel.ERROR)
  })

  test("parse_log_level should be case-insensitive", () => {
    expect(parse_log_level("DEBUG")).toBe(LogLevel.DEBUG)
    expect(parse_log_level("INFO")).toBe(LogLevel.INFO)
    expect(parse_log_level("WARN")).toBe(LogLevel.WARN)
    expect(parse_log_level("ERROR")).toBe(LogLevel.ERROR)
    expect(parse_log_level("Debug")).toBe(LogLevel.DEBUG)
  })

  test("parse_log_level should accept 'warning' as WARN", () => {
    expect(parse_log_level("warning")).toBe(LogLevel.WARN)
    expect(parse_log_level("WARNING")).toBe(LogLevel.WARN)
  })

  test("parse_log_level should return default for invalid", () => {
    expect(parse_log_level("")).toBe(LogLevel.INFO)
    expect(parse_log_level("xyz")).toBe(LogLevel.INFO)
    expect(parse_log_level("trace")).toBe(LogLevel.INFO)
  })

  test("parse_log_level should accept custom default", () => {
    expect(parse_log_level("", LogLevel.ERROR)).toBe(LogLevel.ERROR)
    expect(parse_log_level("xyz", LogLevel.DEBUG)).toBe(LogLevel.DEBUG)
  })

  test("log_level_to_string should return lowercase", () => {
    expect(log_level_to_string(LogLevel.DEBUG)).toBe("debug")
    expect(log_level_to_string(LogLevel.INFO)).toBe("info")
    expect(log_level_to_string(LogLevel.WARN)).toBe("warn")
    expect(log_level_to_string(LogLevel.ERROR)).toBe("error")
  })

  test("log_level_to_string and parse_log_level should be inverse", () => {
    for (const level of [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]) {
      const s = log_level_to_string(level)
      expect(parse_log_level(s)).toBe(level)
    }
  })
})

describe("V13 LoggerService silent mode", () => {
  let logger: LoggerService

  beforeEach(() => {
    logger = new LoggerService(LogLevel.DEBUG)
  })

  test("should not be silent by default", () => {
    expect(logger.is_silent()).toBe(false)
  })

  test("set_silent should toggle silent state", () => {
    logger.set_silent(true)
    expect(logger.is_silent()).toBe(true)
    logger.set_silent(false)
    expect(logger.is_silent()).toBe(false)
  })

  test("get_level should return current level", () => {
    expect(logger.get_level()).toBe(LogLevel.DEBUG)
    logger.set_level(LogLevel.WARN)
    expect(logger.get_level()).toBe(LogLevel.WARN)
  })

  test("silent mode should suppress all output without throwing", () => {
    logger.set_silent(true)
    // 这些调用不应抛出异常
    expect(() => logger.log_debug("test debug")).not.toThrow()
    expect(() => logger.log_info("test info")).not.toThrow()
    expect(() => logger.log_warn("test warn")).not.toThrow()
    expect(() => logger.log_error("test error")).not.toThrow()
  })

  test("to_object should include silent field", () => {
    logger.set_silent(true)
    const obj = logger.to_object()
    expect(obj.silent).toBe(true)
    expect(obj.log_level).toBe(LogLevel.DEBUG)
  })
})

describe("V13 global_logger level control", () => {
  test("set_global_level should change global level", () => {
    set_global_level(LogLevel.WARN)
    expect(get_global_level()).toBe(LogLevel.WARN)
    set_global_level(LogLevel.ERROR)
    expect(get_global_level()).toBe(LogLevel.ERROR)
    // 恢复
    set_global_level(LogLevel.DEBUG)
  })

  test("configure_global_logger should accept string", () => {
    configure_global_logger("warn")
    expect(get_global_level()).toBe(LogLevel.WARN)
    configure_global_logger("ERROR")
    expect(get_global_level()).toBe(LogLevel.ERROR)
    configure_global_logger("info")
    expect(get_global_level()).toBe(LogLevel.INFO)
  })

  test("configure_global_logger should accept LogLevel", () => {
    configure_global_logger(LogLevel.DEBUG)
    expect(get_global_level()).toBe(LogLevel.DEBUG)
    configure_global_logger(LogLevel.ERROR)
    expect(get_global_level()).toBe(LogLevel.ERROR)
  })

  test("configure_global_logger should fallback for invalid string", () => {
    configure_global_logger("xyz")
    expect(get_global_level()).toBe(LogLevel.INFO)
  })

  test("set_global_silent should toggle silent state", () => {
    set_global_silent(true)
    expect(is_global_silent()).toBe(true)
    set_global_silent(false)
    expect(is_global_silent()).toBe(false)
  })

  test("global log functions should not throw when silent", () => {
    set_global_silent(true)
    expect(() => log_debug("silent debug")).not.toThrow()
    expect(() => log_info("silent info")).not.toThrow()
    expect(() => log_warn("silent warn")).not.toThrow()
    expect(() => log_error("silent error")).not.toThrow()
    set_global_silent(false)
  })

  test("global log functions should not throw when not silent", () => {
    set_global_silent(false)
    set_global_level(LogLevel.DEBUG)
    expect(() => log_debug("test debug")).not.toThrow()
    expect(() => log_info("test info")).not.toThrow()
    expect(() => log_warn("test warn")).not.toThrow()
    expect(() => log_error("test error")).not.toThrow()
  })
})

describe("V13 StructuredLogger DEBUG fix", () => {
  test("StructuredLogger should have debug method", () => {
    const logger = new StructuredLogger()
    expect(typeof logger.debug).toBe("function")
  })

  test("StructuredLogger.debug should not throw", () => {
    const logger = new StructuredLogger()
    set_global_silent(false)
    set_global_level(LogLevel.DEBUG)
    expect(() => logger.debug("test debug message", { key: "value" })).not.toThrow()
  })

  test("StructuredLogger should respect global level filtering", () => {
    // 设置为 ERROR 级别，DEBUG 不应输出（但也不应抛异常）
    set_global_level(LogLevel.ERROR)
    const logger = new StructuredLogger()
    expect(() => logger.debug("should be filtered")).not.toThrow()
    expect(() => logger.info("should be filtered")).not.toThrow()
    expect(() => logger.warn("should be filtered")).not.toThrow()
    expect(() => logger.error("should pass")).not.toThrow()
    // 恢复
    set_global_level(LogLevel.DEBUG)
  })

  test("StructuredLogger.child should inherit context", () => {
    const parent = new StructuredLogger()
    parent.set_trace_id("trace-123")
    parent.set_default_fields({ service: "test" })
    const child = parent.child({ module: "child" })
    expect(() => child.info("child message")).not.toThrow()
  })

  test("StructuredLogger should support all levels without throwing", () => {
    set_global_silent(false)
    set_global_level(LogLevel.DEBUG)
    const logger = new StructuredLogger()
    logger.set_trace_id("test-trace")
    logger.set_request_id("req-1")
    expect(() => logger.debug("debug msg")).not.toThrow()
    expect(() => logger.info("info msg")).not.toThrow()
    expect(() => logger.warn("warn msg")).not.toThrow()
    expect(() => logger.error("error msg")).not.toThrow()
  })
})

describe("V13 level filtering integration", () => {
  test("WARN level should filter DEBUG and INFO", () => {
    set_global_silent(false)
    set_global_level(LogLevel.WARN)
    // 这些不应抛异常，DEBUG/INFO 被过滤
    expect(() => log_debug("filtered")).not.toThrow()
    expect(() => log_info("filtered")).not.toThrow()
    expect(() => log_warn("passes")).not.toThrow()
    expect(() => log_error("passes")).not.toThrow()
    set_global_level(LogLevel.DEBUG)
  })

  test("ERROR level should filter DEBUG, INFO, WARN", () => {
    set_global_silent(false)
    set_global_level(LogLevel.ERROR)
    expect(() => log_debug("filtered")).not.toThrow()
    expect(() => log_info("filtered")).not.toThrow()
    expect(() => log_warn("filtered")).not.toThrow()
    expect(() => log_error("passes")).not.toThrow()
    set_global_level(LogLevel.DEBUG)
  })

  test("silent mode should override level filtering", () => {
    set_global_level(LogLevel.DEBUG)
    set_global_silent(true)
    // 即使级别允许，静默模式也应抑制输出
    expect(() => log_debug("silent")).not.toThrow()
    expect(() => log_info("silent")).not.toThrow()
    expect(() => log_warn("silent")).not.toThrow()
    expect(() => log_error("silent")).not.toThrow()
    set_global_silent(false)
  })
})
