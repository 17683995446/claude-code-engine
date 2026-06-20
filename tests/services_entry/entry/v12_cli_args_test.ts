import { describe, it, expect } from "bun:test"
import {
  parse_args,
  get_option,
  get_number_option,
  has_flag,
  resolve_port,
  resolve_log_level,
  CLI_VERSION,
} from "../../../src/services_entry/entry/cli_sdk/cli_args.ts"

// ============================================================
// V12: CLI 参数解析测试
// ============================================================

describe("V12 parse_args", () => {
  it("should parse command", () => {
    const args = parse_args(["serve"])
    expect(args.command).toBe("serve")
    expect(args.positional).toEqual([])
  })

  it("should parse --key=value", () => {
    const args = parse_args(["--port=8080"])
    expect(args.options.port).toBe("8080")
  })

  it("should parse --key value", () => {
    const args = parse_args(["--port", "8080"])
    expect(args.options.port).toBe("8080")
  })

  it("should parse --flag as boolean", () => {
    const args = parse_args(["--verbose"])
    expect(args.flags.verbose).toBe(true)
  })

  it("should parse -k value short option", () => {
    const args = parse_args(["-p", "3000"])
    expect(args.options.p).toBe("3000")
  })

  it("should parse -k as flag when no value", () => {
    const args = parse_args(["-v"])
    expect(args.flags.v).toBe(true)
  })

  it("should parse positional args after command", () => {
    const args = parse_args(["serve", "extra1", "extra2"])
    expect(args.command).toBe("serve")
    expect(args.positional).toEqual(["extra1", "extra2"])
  })

  it("should handle mixed args", () => {
    const args = parse_args(["serve", "--port=8080", "--verbose", "--cwd=/tmp"])
    expect(args.command).toBe("serve")
    expect(args.options.port).toBe("8080")
    expect(args.flags.verbose).toBe(true)
    expect(args.options.cwd).toBe("/tmp")
  })

  it("should handle empty args", () => {
    const args = parse_args([])
    expect(args.command).toBeNull()
    expect(args.options).toEqual({})
    expect(args.flags).toEqual({})
    expect(args.positional).toEqual([])
  })

  it("should not treat negative number as option", () => {
    const args = parse_args(["serve", "-1"])
    expect(args.command).toBe("serve")
    // -1 被视为短选项 1（flag）
    expect(args.flags["1"]).toBe(true)
  })

  it("should parse multiple flags", () => {
    const args = parse_args(["--verbose", "--debug", "--quiet"])
    expect(args.flags.verbose).toBe(true)
    expect(args.flags.debug).toBe(true)
    expect(args.flags.quiet).toBe(true)
  })

  it("should parse multiple options", () => {
    const args = parse_args(["--port=8080", "--host=localhost", "--cwd=/tmp"])
    expect(args.options.port).toBe("8080")
    expect(args.options.host).toBe("localhost")
    expect(args.options.cwd).toBe("/tmp")
  })
})

describe("V12 get_option", () => {
  it("should return option value", () => {
    const args = parse_args(["--port=8080"])
    expect(get_option(args, "port")).toBe("8080")
  })

  it("should return default when missing", () => {
    const args = parse_args([])
    expect(get_option(args, "port", "3000")).toBe("3000")
  })

  it("should return empty string when no default", () => {
    const args = parse_args([])
    expect(get_option(args, "port")).toBe("")
  })
})

describe("V12 get_number_option", () => {
  it("should return number value", () => {
    const args = parse_args(["--port=8080"])
    expect(get_number_option(args, "port", 3000)).toBe(8080)
  })

  it("should return default when missing", () => {
    const args = parse_args([])
    expect(get_number_option(args, "port", 3000)).toBe(3000)
  })

  it("should return default when non-numeric", () => {
    const args = parse_args(["--port=abc"])
    expect(get_number_option(args, "port", 3000)).toBe(3000)
  })
})

describe("V12 has_flag", () => {
  it("should return true when flag present", () => {
    const args = parse_args(["--verbose"])
    expect(has_flag(args, "verbose")).toBe(true)
  })

  it("should return false when flag missing", () => {
    const args = parse_args([])
    expect(has_flag(args, "verbose")).toBe(false)
  })
})

describe("V12 resolve_port", () => {
  it("should resolve from --port option", () => {
    const args = parse_args(["--port=9090"])
    expect(resolve_port(args)).toBe(9090)
  })

  it("should resolve from PORT env var", () => {
    const old_port = process.env.PORT
    process.env.PORT = "7070"
    const args = parse_args([])
    expect(resolve_port(args)).toBe(7070)
    process.env.PORT = old_port
  })

  it("should prefer --port over env", () => {
    const old_port = process.env.PORT
    process.env.PORT = "7070"
    const args = parse_args(["--port=9090"])
    expect(resolve_port(args)).toBe(9090)
    process.env.PORT = old_port
  })

  it("should use default when neither set", () => {
    const old_port = process.env.PORT
    delete process.env.PORT
    const args = parse_args([])
    expect(resolve_port(args, 3000)).toBe(3000)
    process.env.PORT = old_port
  })

  it("should use default when port invalid", () => {
    const args = parse_args(["--port=abc"])
    expect(resolve_port(args, 3000)).toBe(3000)
  })
})

describe("V12 resolve_log_level", () => {
  it("should resolve from --log-level option", () => {
    const args = parse_args(["--log-level=debug"])
    expect(resolve_log_level(args)).toBe("debug")
  })

  it("should resolve from LOG_LEVEL env var", () => {
    const old = process.env.LOG_LEVEL
    process.env.LOG_LEVEL = "warn"
    const args = parse_args([])
    expect(resolve_log_level(args)).toBe("warn")
    process.env.LOG_LEVEL = old
  })

  it("should prefer --log-level over env", () => {
    const old = process.env.LOG_LEVEL
    process.env.LOG_LEVEL = "warn"
    const args = parse_args(["--log-level=error"])
    expect(resolve_log_level(args)).toBe("error")
    process.env.LOG_LEVEL = old
  })

  it("should default to info", () => {
    const old = process.env.LOG_LEVEL
    delete process.env.LOG_LEVEL
    const args = parse_args([])
    expect(resolve_log_level(args, "info")).toBe("info")
    process.env.LOG_LEVEL = old
  })
})

describe("V12 CLI_VERSION", () => {
  it("should be a non-empty string", () => {
    expect(CLI_VERSION.length).toBeGreaterThan(0)
  })
})
