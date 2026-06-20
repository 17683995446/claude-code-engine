import { existsSync, readFileSync, statSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { log_info, log_warn, log_error } from "../../../core_infra/infra/global_logger.ts"
import { detect_environment } from "../../../core_infra/infra/config_wizard.ts"
import { get_global_level, is_global_silent } from "../../../core_infra/infra/global_logger.ts"
import { log_level_to_string } from "../../../core_infra/infra/log_level_helpers.ts"
import { CLI_VERSION } from "./cli_args.ts"

/**
 * V21: 诊断检查结果级别。
 */
export type DiagnosticLevel = "ok" | "warn" | "error" | "info"

/**
 * V21: 单项诊断检查结果。
 */
export interface DiagnosticCheck {
  /** 检查项名称 */
  name: string
  /** 检查结果级别 */
  level: DiagnosticLevel
  /** 检查结果消息 */
  message: string
  /** 修复建议（如有） */
  suggestion?: string
}

/**
 * V21: 完整诊断报告。
 */
export interface DiagnosticReport {
  /** 生成时间戳 */
  timestamp: string
  /** CLI 版本 */
  version: string
  /** 总体状态 */
  overall: DiagnosticLevel
  /** 检查项列表 */
  checks: DiagnosticCheck[]
  /** 统计 */
  summary: {
    ok: number
    warn: number
    error: number
    info: number
    total: number
  }
}

/**
 * V21: 运行全面诊断检查。
 *
 * 检查项包括：
 *   - 环境变量配置
 *   - 配置文件存在性
 *   - 日志系统状态
 *   - 运行时版本
 *   - 文件系统权限
 *   - 网络端口可用性
 */
export function run_diagnostics(): DiagnosticReport {
  log_info("diagnostics_run_start")
  const checks: DiagnosticCheck[] = []

  // 1. 环境变量检查
  checks.push(...check_environment())

  // 2. 配置文件检查
  checks.push(...check_config_files())

  // 3. 日志系统检查
  checks.push(...check_logging())

  // 4. 运行时检查
  checks.push(...check_runtime())

  // 5. 文件系统检查
  checks.push(...check_filesystem())

  // 6. 历史记录文件检查
  checks.push(...check_history_file())

  // 计算统计
  const summary = {
    ok: checks.filter((c) => c.level === "ok").length,
    warn: checks.filter((c) => c.level === "warn").length,
    error: checks.filter((c) => c.level === "error").length,
    info: checks.filter((c) => c.level === "info").length,
    total: checks.length,
  }

  // 总体状态
  let overall: DiagnosticLevel = "ok"
  if (summary.error > 0) {
    overall = "error"
  } else if (summary.warn > 0) {
    overall = "warn"
  }

  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    version: CLI_VERSION,
    overall,
    checks,
    summary,
  }

  log_info(`diagnostics_run_done: overall=${overall} ok=${summary.ok} warn=${summary.warn} error=${summary.error}`)
  return report
}

/**
 * 检查环境变量配置。
 */
function check_environment(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const env = detect_environment()

  // OPENAI_API_KEY
  if (env.has_openai_api_key) {
    checks.push({
      name: "OPENAI_API_KEY",
      level: "ok",
      message: "OpenAI API key is set",
    })
  } else {
    checks.push({
      name: "OPENAI_API_KEY",
      level: "warn",
      message: "OPENAI_API_KEY is not set",
      suggestion: "Set OPENAI_API_KEY environment variable for LLM functionality",
    })
  }

  // API_KEY (用于鉴权)
  if (env.has_api_key) {
    checks.push({
      name: "API_KEY",
      level: "ok",
      message: "API key for authentication is set",
    })
  } else {
    checks.push({
      name: "API_KEY",
      level: "info",
      message: "API_KEY not set (API endpoints will be open)",
      suggestion: "Set API_KEY for production authentication",
    })
  }

  // PORT
  if (env.detected_port !== null) {
    checks.push({
      name: "PORT",
      level: "ok",
      message: `Port configured: ${env.detected_port}`,
    })
  } else {
    checks.push({
      name: "PORT",
      level: "info",
      message: "PORT not set, will use default 3000",
    })
  }

  // CONFIG_FILE
  if (env.has_config_file) {
    checks.push({
      name: "CONFIG_FILE",
      level: "ok",
      message: `Config file path: ${env.detected_config_file}`,
    })
  } else {
    checks.push({
      name: "CONFIG_FILE",
      level: "info",
      message: "CONFIG_FILE not set, using defaults",
    })
  }

  // AUTO_START_DAEMON
  if (env.has_auto_start_daemon) {
    checks.push({
      name: "AUTO_START_DAEMON",
      level: "ok",
      message: "Daemon will auto-start",
    })
  } else {
    checks.push({
      name: "AUTO_START_DAEMON",
      level: "info",
      message: "AUTO_START_DAEMON not set, daemon won't auto-start",
    })
  }

  return checks
}

/**
 * 检查配置文件。
 */
function check_config_files(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const config_file = process.env.CONFIG_FILE

  if (config_file && config_file.length > 0) {
    if (existsSync(config_file)) {
      try {
        const content = readFileSync(config_file, "utf-8")
        if (content.length === 0) {
          checks.push({
            name: "Config File Content",
            level: "warn",
            message: `Config file is empty: ${config_file}`,
            suggestion: "Add configuration values or remove the file",
          })
        } else {
          checks.push({
            name: "Config File",
            level: "ok",
            message: `Config file loaded: ${config_file} (${content.length} bytes)`,
          })
        }
      } catch (e) {
        checks.push({
          name: "Config File",
          level: "error",
          message: `Failed to read config file: ${e}`,
          suggestion: "Check file permissions",
        })
      }
    } else {
      checks.push({
        name: "Config File",
        level: "error",
        message: `Config file not found: ${config_file}`,
        suggestion: "Create the file or unset CONFIG_FILE environment variable",
      })
    }
  } else {
    checks.push({
      name: "Config File",
      level: "info",
      message: "No config file specified, using defaults",
    })
  }

  return checks
}

/**
 * 检查日志系统。
 */
function check_logging(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []

  const level = get_global_level()
  checks.push({
    name: "Log Level",
    level: "ok",
    message: `Current log level: ${log_level_to_string(level)}`,
  })

  if (is_global_silent()) {
    checks.push({
      name: "Log Silent Mode",
      level: "warn",
      message: "Logger is in silent mode, no output will be produced",
      suggestion: "Call set_global_silent(false) to enable logging",
    })
  } else {
    checks.push({
      name: "Log Silent Mode",
      level: "ok",
      message: "Logger is active",
    })
  }

  return checks
}

/**
 * 检查运行时环境。
 */
function check_runtime(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []

  // Bun 版本
  const bun_version = (globalThis as any).Bun?.version
  if (bun_version) {
    checks.push({
      name: "Bun Runtime",
      level: "ok",
      message: `Bun version: ${bun_version}`,
    })
  } else {
    checks.push({
      name: "Bun Runtime",
      level: "warn",
      message: "Bun runtime not detected (running on Node.js?)",
      suggestion: "Install Bun for best performance: https://bun.sh",
    })
  }

  // Node.js 版本
  const node_version = process.versions.node
  if (node_version) {
    checks.push({
      name: "Node.js Version",
      level: "ok",
      message: `Node.js: ${node_version}`,
    })
  }

  // 平台
  checks.push({
    name: "Platform",
    level: "ok",
    message: `Platform: ${process.platform} ${process.arch}`,
  })

  // 工作目录
  const cwd = process.cwd()
  if (existsSync(cwd)) {
    checks.push({
      name: "Working Directory",
      level: "ok",
      message: `CWD: ${cwd}`,
    })
  } else {
    checks.push({
      name: "Working Directory",
      level: "error",
      message: `CWD does not exist: ${cwd}`,
      suggestion: "Change to a valid directory",
    })
  }

  return checks
}

/**
 * 检查文件系统权限。
 */
function check_filesystem(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []

  // 检查 home 目录可写
  const home = homedir()
  if (existsSync(home)) {
    checks.push({
      name: "Home Directory",
      level: "ok",
      message: `Home directory accessible: ${home}`,
    })
  } else {
    checks.push({
      name: "Home Directory",
      level: "error",
      message: "Home directory not accessible",
      suggestion: "Set HOME environment variable",
    })
  }

  // 检查 .claude_code 目录
  const claude_dir = join(home, ".claude_code")
  if (existsSync(claude_dir)) {
    checks.push({
      name: "Claude Code Directory",
      level: "ok",
      message: `.claude_code directory exists: ${claude_dir}`,
    })
  } else {
    checks.push({
      name: "Claude Code Directory",
      level: "info",
      message: ".claude_code directory not created yet (will be created on first use)",
    })
  }

  return checks
}

/**
 * 检查 REPL 历史记录文件。
 */
function check_history_file(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const history_file = join(homedir(), ".claude_code", "repl_history")

  if (existsSync(history_file)) {
    try {
      const stats = statSync(history_file)
      const content = readFileSync(history_file, "utf-8")
      const lines = content.split("\n").filter((l) => l.length > 0)
      checks.push({
        name: "REPL History",
        level: "ok",
        message: `REPL history: ${lines.length} entries, ${stats.size} bytes`,
      })
    } catch (e) {
      checks.push({
        name: "REPL History",
        level: "warn",
        message: `Failed to read history file: ${e}`,
      })
    }
  } else {
    checks.push({
      name: "REPL History",
      level: "info",
      message: "No REPL history file yet (created on first REPL session)",
    })
  }

  return checks
}

/**
 * V21: 格式化诊断报告为可读文本。
 */
export function format_diagnostic_report(report: DiagnosticReport): string {
  const lines: string[] = []
  const level_icon: Record<DiagnosticLevel, string> = {
    ok: "[OK]",
    warn: "[WARN]",
    error: "[ERROR]",
    info: "[INFO]",
  }
  const level_color: Record<DiagnosticLevel, string> = {
    ok: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
    info: "\x1b[36m", // cyan
  }
  const reset = "\x1b[0m"

  lines.push("========================================")
  lines.push("  Claude Code Engine - Diagnostics")
  lines.push("========================================")
  lines.push(`  Version: ${report.version}`)
  lines.push(`  Time: ${report.timestamp}`)
  lines.push(`  Overall: ${level_color[report.overall]}${report.overall.toUpperCase()}${reset}`)
  lines.push("========================================")
  lines.push("")

  for (const check of report.checks) {
    const icon = level_icon[check.level]
    const color = level_color[check.level]
    lines.push(`  ${color}${icon}${reset} ${check.name}`)
    lines.push(`       ${check.message}`)
    if (check.suggestion) {
      lines.push(`       ${color}Suggestion:${reset} ${check.suggestion}`)
    }
    lines.push("")
  }

  lines.push("========================================")
  lines.push(`  Summary: ${report.summary.ok} OK, ${report.summary.warn} WARN, ${report.summary.error} ERROR, ${report.summary.info} INFO`)
  lines.push(`  Total checks: ${report.summary.total}`)
  lines.push("========================================")

  return lines.join("\n")
}

/**
 * V21: 检查特定端口是否可用。
 */
export function check_port_available(port: number): boolean {
  try {
    const { createServer } = require("net")
    const server = createServer()
    server.listen(port)
    server.close()
    return true
  } catch {
    return false
  }
}
