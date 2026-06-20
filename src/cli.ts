#!/usr/bin/env bun
/**
 * Claude Code Engine - CLI Entry Point (V12)
 *
 * 支持命令：
 *   serve    启动 HTTP 服务器（默认）
 *   chat     启动交互式对话 REPL
 *   status   显示引擎状态后退出
 *   help     显示帮助
 *
 * Usage:
 *   bun run src/cli.ts                      # 默认启动 HTTP 服务器
 *   bun run src/cli.ts serve --port 8080    # 指定端口
 *   bun run src/cli.ts chat                 # 交互式对话
 *   bun run src/cli.ts status               # 查看状态
 *   bun run src/cli.ts --help               # 帮助
 *   bun run src/cli.ts --version            # 版本
 */

import { log_info, log_error, configure_global_logger, set_global_silent, get_global_level } from "./core_infra/infra/global_logger.ts"
import { log_level_to_string } from "./core_infra/infra/log_level_helpers.ts"
import { ClaudeCodeEngine } from "./index.ts"
import type { QueryEngineConfig } from "./core_infra/core/query_engine_config.ts"
import {
  parse_args,
  print_help,
  print_version,
  resolve_port,
  resolve_log_level,
  has_flag,
  get_option,
  CLI_VERSION,
} from "./services_entry/entry/cli_sdk/cli_args.ts"
import { InteractiveRepl } from "./services_entry/entry/cli_sdk/repl.ts"
import { InteractiveConfigWizard, generate_config_non_interactive, show_config, list_config_fields } from "./services_entry/entry/cli_sdk/config_wizard_cli.ts"
import { generate_template, list_templates, TEMPLATE_DESCRIPTIONS } from "./services_entry/entry/cli_sdk/template_generator.ts"
import type { TemplateType } from "./services_entry/entry/cli_sdk/template_generator.ts"
import { run_diagnostics, format_diagnostic_report, check_port_available } from "./services_entry/entry/cli_sdk/diagnostics.ts"
import { check_and_get_prompt, is_first_run, mark_step_complete, should_show_guide } from "./services_entry/entry/cli_sdk/first_run.ts"

function build_config(args: ReturnType<typeof parse_args>): QueryEngineConfig {
  const cwd: string = get_option(args, "cwd", process.cwd())
  const max_turns: number = Number(get_option(args, "max-turns", "50"))
  return {
    cwd,
    max_turns: Number.isFinite(max_turns) && max_turns > 0 ? max_turns : 50,
    initial_messages: [],
    verbose: has_flag(args, "verbose"),
  }
}

async function cmd_serve(args: ReturnType<typeof parse_args>): Promise<void> {
  log_info("cli_serve_start")
  const config: QueryEngineConfig = build_config(args)
  const engine: ClaudeCodeEngine = new ClaudeCodeEngine(config)
  await engine.start()

  // 初始化配置和健康端点
  engine.get_config_manager()
  engine.get_health_endpoint()

  const port: number = resolve_port(args)
  const server = engine.start_http_server(port)
  const actual_port: number = server.get_port()

  // 可选自动启动守护进程
  if (has_flag(args, "daemon") || process.env.AUTO_START_DAEMON === "true") {
    const daemon = engine.get_daemon()
    await daemon.start()
    log_info("cli_daemon_started")
  }

  console.log("========================================")
  console.log(`  Claude Code Engine v${CLI_VERSION}`)
  console.log("  Health: " + engine.health_check())
  console.log("  HTTP: http://localhost:" + actual_port)
  console.log("  CWD: " + config.cwd)
  console.log("========================================")
  console.log("  Health (no auth): GET /health")
  console.log("  API (auth req):   GET /api/config")
  console.log("  Press Ctrl+C to stop")
  console.log("========================================")

  // 优雅关闭
  let shutting_down: boolean = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shutting_down) return
    shutting_down = true
    log_info(`cli_signal: ${signal}`)
    console.log(`\nShutting down (${signal})...`)
    try { server.stop() } catch (e) { log_error(`cli_server_stop: ${e}`) }
    try { engine.stop() } catch (e) { log_error(`cli_engine_stop: ${e}`) }
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  log_info("cli_serve_running")
}

async function cmd_chat(args: ReturnType<typeof parse_args>): Promise<void> {
  log_info("cli_chat_start")
  const config: QueryEngineConfig = build_config(args)
  const engine: ClaudeCodeEngine = new ClaudeCodeEngine(config)
  await engine.start()

  // 初始化对话引擎
  engine.get_conversation_engine()

  const repl = new InteractiveRepl(engine)

  // Ctrl+C 优雅退出
  process.on("SIGINT", () => {
    repl.stop()
  })

  await repl.start()

  engine.stop()
  log_info("cli_chat_done")
}

async function cmd_status(args: ReturnType<typeof parse_args>): Promise<void> {
  log_info("cli_status_start")
  const config: QueryEngineConfig = build_config(args)
  const engine: ClaudeCodeEngine = new ClaudeCodeEngine(config)
  await engine.start()

  console.log("========================================")
  console.log(`  Claude Code Engine v${CLI_VERSION}`)
  console.log("  Status Report")
  console.log("========================================")
  console.log("  Health: " + engine.health_check())
  console.log("  CWD: " + config.cwd)
  console.log("  Max Turns: " + config.max_turns)
  console.log("  Log Level: " + resolve_log_level(args))
  console.log("========================================")

  // 显示各子系统状态
  try {
    const agents = engine.get_agent_registry()
    const agent_list = await agents.list()
    console.log(`  Agents: ${agent_list.length} registered`)

    const skills = engine.get_skill_registry()
    const skill_list = await skills.list()
    console.log(`  Skills: ${skill_list.length} registered`)

    const planner = engine.get_planner()
    const plans = await planner.list_plans()
    console.log(`  Plans: ${plans.length} total`)

    const daemon = engine.get_daemon()
    console.log(`  Daemon: ${daemon.get_status()}`)
  } catch (e) {
    console.log("  (subsystem status unavailable: " + e + ")")
  }

  console.log("========================================")
  engine.stop()
  log_info("cli_status_done")
}

async function cmd_config(args: ReturnType<typeof parse_args>): Promise<void> {
  log_info("cli_config_start")
  const subcommand: string = args.positional[0] ?? "init"

  switch (subcommand) {
    case "init": {
      const output_path: string = get_option(args, "output", "./config.yaml")
      const wizard = new InteractiveConfigWizard()
      await wizard.run(output_path)
      break
    }
    case "generate": {
      // 非交互式生成
      const output_path: string = get_option(args, "output", "./config.yaml")
      const result = generate_config_non_interactive({
        output_path,
        port: get_option(args, "port", "").length > 0 ? Number(get_option(args, "port", "3000")) : undefined,
        log_level: get_option(args, "log-level", "").length > 0 ? get_option(args, "log-level", "") : undefined,
        verbose: has_flag(args, "verbose"),
        overwrite: has_flag(args, "force"),
      })
      if (result.success) {
        console.log(`Configuration generated: ${output_path}`)
      } else {
        console.error(`Failed: ${result.error}`)
        process.exit(1)
      }
      break
    }
    case "show": {
      const file_path: string = get_option(args, "file", "./config.yaml")
      const result = show_config(file_path)
      if (result.success) {
        console.log(result.content)
      } else {
        console.error(`Failed: ${result.error}`)
        process.exit(1)
      }
      break
    }
    case "list": {
      console.log(list_config_fields())
      break
    }
    default:
      console.error(`Unknown config subcommand: ${subcommand}`)
      console.error("Available: init, generate, show, list")
      process.exit(1)
  }
  log_info("cli_config_done")
}

async function cmd_init(args: ReturnType<typeof parse_args>): Promise<void> {
  log_info("cli_init_start")
  const template_type: string = args.positional[0] ?? "basic"
  const output_dir: string = get_option(args, "output", "./" + (args.positional[1] ?? "my-project"))
  const name: string = args.positional[1] ?? "my-project"

  if (template_type === "list") {
    console.log("Available templates:")
    for (const t of list_templates()) {
      console.log(`  ${t.type.padEnd(12)} ${t.description}`)
    }
    return
  }

  const valid_types: TemplateType[] = ["basic", "api-server", "agent", "skill", "plugin"]
  if (!valid_types.includes(template_type as TemplateType)) {
    console.error(`Unknown template type: ${template_type}`)
    console.error(`Available: ${valid_types.join(", ")}`)
    console.error("Run 'bun run src/cli.ts init list' to see all templates")
    process.exit(1)
  }

  console.log(`Generating '${template_type}' template in: ${output_dir}`)
  const result = generate_template({
    type: template_type as TemplateType,
    output_dir,
    name,
    overwrite: has_flag(args, "force"),
  })

  if (result.success) {
    console.log(`Template generated successfully!`)
    console.log(`Files created (${result.files_created.length}):`)
    for (const file of result.files_created) {
      console.log(`  ${file}`)
    }
    console.log("")
    console.log("Next steps:")
    console.log(`  cd ${output_dir}`)
    console.log(`  bun install`)
    console.log(`  bun start`)
  } else {
    console.error("Template generation failed:")
    for (const err of result.errors) {
      console.error(`  ${err}`)
    }
    process.exit(1)
  }
  log_info("cli_init_done")
}

async function cmd_doctor(args: ReturnType<typeof parse_args>): Promise<void> {
  log_info("cli_doctor_start")
  const report = run_diagnostics()
  const text = format_diagnostic_report(report)
  console.log(text)

  // 可选：检查端口可用性
  const port_str = get_option(args, "port", "")
  if (port_str.length > 0) {
    const port = Number(port_str)
    if (Number.isFinite(port) && port > 0) {
      const available = check_port_available(port)
      console.log("")
      console.log(`  Port ${port}: ${available ? "available" : "in use"}`)
    }
  }

  // 退出码：有 error 则 1，有 warn 则 0（仅提示）
  if (report.summary.error > 0) {
    process.exit(1)
  }
  log_info("cli_doctor_done")
}

async function main(): Promise<void> {
  const args = parse_args(process.argv.slice(2))

  // V13: 应用日志级别配置
  // 优先级：--quiet > --verbose > --log-level > LOG_LEVEL 环境变量 > 默认 info
  if (has_flag(args, "quiet")) {
    set_global_silent(true)
  } else {
    let level: string
    if (has_flag(args, "verbose")) {
      level = "debug"
    } else {
      level = resolve_log_level(args)
    }
    configure_global_logger(level)
    log_info(`cli_log_level: ${log_level_to_string(get_global_level())}`)
  }

  // 全局标志处理
  if (has_flag(args, "help") || args.command === "help") {
    print_help()
    return
  }
  if (has_flag(args, "version")) {
    print_version()
    return
  }

  // V22: 首次运行引导（仅对交互式命令显示）
  const command: string = args.command ?? "serve"
  const interactive_commands = ["serve", "chat", "status"]
  if (interactive_commands.includes(command) && !has_flag(args, "quiet") && should_show_guide()) {
    const prompt_info = check_and_get_prompt()
    console.log(prompt_info.banner)
    console.log(prompt_info.prompt)
    if (prompt_info.is_first_run) {
      // 自动标记 welcome 步骤完成
      mark_step_complete("welcome")
    }
  }

  // 命令分发
  switch (command) {
    case "serve":
      await cmd_serve(args)
      break
    case "chat":
      await cmd_chat(args)
      break
    case "status":
      await cmd_status(args)
      break
    case "config":
      await cmd_config(args)
      break
    case "init":
      await cmd_init(args)
      break
    case "doctor":
      await cmd_doctor(args)
      break
    case "help":
      print_help()
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.error("Run 'bun run src/cli.ts help' for usage.")
      process.exit(1)
  }
}

main().catch((err: unknown) => {
  log_error(`cli_failed: ${err}`)
  console.error("CLI failed:", err)
  process.exit(1)
})
