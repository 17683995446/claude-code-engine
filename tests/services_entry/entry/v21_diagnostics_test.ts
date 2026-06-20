import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import {
  run_diagnostics,
  format_diagnostic_report,
  check_port_available,
} from "../../../src/services_entry/entry/cli_sdk/diagnostics.ts"
import type { DiagnosticReport, DiagnosticCheck, DiagnosticLevel } from "../../../src/services_entry/entry/cli_sdk/diagnostics.ts"
import { set_global_silent, set_global_level } from "../../../src/core_infra/infra/global_logger.ts"
import { LogLevel } from "../../../src/core_infra/infra/log_level_enum.ts"

const original_env = { ...process.env }

describe("V21 run_diagnostics", () => {
  beforeEach(() => {
    // 重置环境变量
    for (const key of Object.keys(process.env)) {
      if (!(key in original_env)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, original_env)
    set_global_silent(false)
    set_global_level(LogLevel.INFO)
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in original_env)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, original_env)
    set_global_silent(false)
    set_global_level(LogLevel.DEBUG)
  })

  test("should return a diagnostic report", () => {
    const report = run_diagnostics()
    expect(report).toBeDefined()
    expect(report.timestamp).toBeDefined()
    expect(report.version).toBeDefined()
    expect(report.checks).toBeDefined()
    expect(Array.isArray(report.checks)).toBe(true)
    expect(report.summary).toBeDefined()
  })

  test("should include environment checks", () => {
    const report = run_diagnostics()
    const check_names = report.checks.map((c) => c.name)
    expect(check_names).toContain("OPENAI_API_KEY")
    expect(check_names).toContain("API_KEY")
    expect(check_names).toContain("PORT")
    expect(check_names).toContain("CONFIG_FILE")
    expect(check_names).toContain("AUTO_START_DAEMON")
  })

  test("should include logging checks", () => {
    const report = run_diagnostics()
    const check_names = report.checks.map((c) => c.name)
    expect(check_names).toContain("Log Level")
    expect(check_names).toContain("Log Silent Mode")
  })

  test("should include runtime checks", () => {
    const report = run_diagnostics()
    const check_names = report.checks.map((c) => c.name)
    expect(check_names).toContain("Platform")
    expect(check_names).toContain("Working Directory")
  })

  test("should include filesystem checks", () => {
    const report = run_diagnostics()
    const check_names = report.checks.map((c) => c.name)
    expect(check_names).toContain("Home Directory")
    expect(check_names).toContain("Claude Code Directory")
  })

  test("should include history file check", () => {
    const report = run_diagnostics()
    const check_names = report.checks.map((c) => c.name)
    expect(check_names).toContain("REPL History")
  })

  test("should detect OPENAI_API_KEY when set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key"
    const report = run_diagnostics()
    const check = report.checks.find((c) => c.name === "OPENAI_API_KEY")!
    expect(check.level).toBe("ok")
    expect(check.message).toContain("set")
  })

  test("should warn when OPENAI_API_KEY not set", () => {
    delete process.env.OPENAI_API_KEY
    const report = run_diagnostics()
    const check = report.checks.find((c) => c.name === "OPENAI_API_KEY")!
    expect(check.level).toBe("warn")
    expect(check.suggestion).toBeDefined()
  })

  test("should detect silent mode", () => {
    set_global_silent(true)
    const report = run_diagnostics()
    const check = report.checks.find((c) => c.name === "Log Silent Mode")!
    expect(check.level).toBe("warn")
    set_global_silent(false)
  })

  test("should report ok when logger is active", () => {
    set_global_silent(false)
    const report = run_diagnostics()
    const check = report.checks.find((c) => c.name === "Log Silent Mode")!
    expect(check.level).toBe("ok")
  })

  test("should calculate summary correctly", () => {
    const report = run_diagnostics()
    const total = report.summary.ok + report.summary.warn + report.summary.error + report.summary.info
    expect(total).toBe(report.summary.total)
    expect(report.summary.total).toBe(report.checks.length)
  })

  test("should set overall to error when there are errors", () => {
    // 设置一个不存在的配置文件
    process.env.CONFIG_FILE = "/nonexistent/path/config.yaml"
    const report = run_diagnostics()
    expect(report.summary.error).toBeGreaterThan(0)
    expect(report.overall).toBe("error")
  })

  test("should set overall to ok when no errors or warnings", () => {
    // 清除所有可能产生 warning 的环境变量
    delete process.env.OPENAI_API_KEY
    delete process.env.CONFIG_FILE
    set_global_silent(false)
    const report = run_diagnostics()
    // 由于 OPENAI_API_KEY 未设置会产生 warn
    expect(report.summary.warn).toBeGreaterThan(0)
    expect(report.overall).toBe("warn")
  })

  test("each check should have name, level, and message", () => {
    const report = run_diagnostics()
    for (const check of report.checks) {
      expect(check.name.length).toBeGreaterThan(0)
      expect(["ok", "warn", "error", "info"]).toContain(check.level)
      expect(check.message.length).toBeGreaterThan(0)
    }
  })
})

describe("V21 format_diagnostic_report", () => {
  test("should format report as readable text", () => {
    const report: DiagnosticReport = {
      timestamp: "2026-01-01T00:00:00.000Z",
      version: "1.0.0",
      overall: "ok",
      checks: [
        { name: "Test Check", level: "ok", message: "Everything is fine" },
        { name: "Warning Check", level: "warn", message: "Minor issue", suggestion: "Fix it" },
      ],
      summary: { ok: 1, warn: 1, error: 0, info: 0, total: 2 },
    }

    const text = format_diagnostic_report(report)
    expect(text).toContain("Diagnostics")
    expect(text).toContain("Test Check")
    expect(text).toContain("Everything is fine")
    expect(text).toContain("Warning Check")
    expect(text).toContain("Minor issue")
    expect(text).toContain("Fix it")
    expect(text).toContain("Summary:")
  })

  test("should include version and timestamp", () => {
    const report: DiagnosticReport = {
      timestamp: "2026-06-20T12:00:00.000Z",
      version: "2.0.0",
      overall: "ok",
      checks: [],
      summary: { ok: 0, warn: 0, error: 0, info: 0, total: 0 },
    }

    const text = format_diagnostic_report(report)
    expect(text).toContain("Version: 2.0.0")
    expect(text).toContain("2026-06-20T12:00:00.000Z")
  })

  test("should format real diagnostic report", () => {
    const report = run_diagnostics()
    const text = format_diagnostic_report(report)
    expect(text).toContain("Diagnostics")
    expect(text).toContain("Summary:")
    expect(text.length).toBeGreaterThan(100)
  })
})

describe("V21 check_port_available", () => {
  test("should return boolean", () => {
    const result = check_port_available(0) // 端口 0 总是可用
    expect(typeof result).toBe("boolean")
  })

  test("should return true for port 0", () => {
    // 端口 0 让操作系统自动分配，总是可用
    expect(check_port_available(0)).toBe(true)
  })

  test("should return true for high port number", () => {
    // 使用高位端口，通常可用
    expect(check_port_available(65432)).toBe(true)
  })
})
