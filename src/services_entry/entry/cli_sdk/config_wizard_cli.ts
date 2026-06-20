import * as readline from "readline"
import { writeFileSync, existsSync } from "fs"
import { log_info, log_warn } from "../../../core_infra/infra/global_logger.ts"
import { apply_config_defaults, config_to_yaml, get_default_config } from "../../../core_infra/infra/config_defaults.ts"
import type { DefaultConfig } from "../../../core_infra/infra/config_defaults.ts"
import { detect_environment } from "../../../core_infra/infra/config_wizard.ts"

/**
 * V19: 交互式配置向导。
 *
 * 通过问答方式引导用户生成配置文件，支持：
 *   - 环境自动检测并提示
 *   - 逐步询问各项配置
 *   - 提供默认值（直接回车采用）
 *   - 最终预览并确认写入
 */
export class InteractiveConfigWizard {
  private rl: readline.Interface | null = null

  /**
   * 运行交互式向导。
   *
   * @param output_path 配置文件输出路径
   * @returns 生成的配置对象，如用户取消则返回 null
   */
  async run(output_path?: string): Promise<DefaultConfig | null> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      console.log("")
      console.log("========================================")
      console.log("  Claude Code Engine - Config Wizard")
      console.log("========================================")
      console.log("  This wizard will guide you through")
      console.log("  creating a configuration file.")
      console.log("  Press Enter to accept defaults.")
      console.log("")

      // 环境检测
      const env = detect_environment()
      this.print_environment_summary(env)

      // 逐步询问
      const port = await this.ask_number("HTTP server port", 3000)
      const cwd = await this.ask_string("Working directory", process.cwd())
      const max_turns = await this.ask_number("Max conversation turns", 50)
      const log_level = await this.ask_choice("Log level", ["debug", "info", "warn", "error"], "info")
      const verbose = await this.ask_boolean("Enable verbose logging", false)

      console.log("")
      console.log("Daemon configuration:")
      const health_interval = await this.ask_number("Health check interval (ms)", 5000)
      const recovery_interval = await this.ask_number("Plan recovery interval (ms)", 3000)
      const max_failures = await this.ask_number("Max recovery failures", 5)

      // 构建配置
      const config: DefaultConfig = apply_config_defaults({
        port,
        cwd,
        max_turns,
        log_level,
        verbose,
        daemon: {
          health_check_interval_ms: health_interval,
          plan_recovery_interval_ms: recovery_interval,
          max_recovery_failures: max_failures,
        },
      })

      // 预览
      console.log("")
      console.log("========================================")
      console.log("  Configuration Preview")
      console.log("========================================")
      console.log(config_to_yaml(config))

      // 确认
      const confirmed = await this.ask_boolean("Write this configuration?", true)
      if (!confirmed) {
        console.log("Configuration cancelled.")
        return null
      }

      // 写入文件
      const final_path = output_path ?? await this.ask_string("Output file path", "./config.yaml")
      if (existsSync(final_path)) {
        const overwrite = await this.ask_boolean(`File '${final_path}' exists. Overwrite?`, false)
        if (!overwrite) {
          console.log("Configuration not written.")
          return config
        }
      }

      writeFileSync(final_path, config_to_yaml(config), "utf-8")
      console.log(`Configuration written to: ${final_path}`)
      log_info(`config_wizard_written: ${final_path}`)

      return config
    } finally {
      if (this.rl) {
        this.rl.close()
        this.rl = null
      }
    }
  }

  /**
   * 打印环境检测摘要。
   */
  private print_environment_summary(env: ReturnType<typeof detect_environment>): void {
    console.log("Detected environment:")
    console.log(`  OPENAI_API_KEY: ${env.has_openai_api_key ? "set" : "not set"}`)
    console.log(`  API_KEY: ${env.has_api_key ? "set" : "not set"}`)
    console.log(`  PORT: ${env.detected_port ?? "not set"}`)
    console.log(`  CONFIG_FILE: ${env.detected_config_file ?? "not set"}`)
    console.log(`  AUTO_START_DAEMON: ${env.has_auto_start_daemon ? "true" : "false"}`)
    console.log("")
  }

  /**
   * 询问字符串输入。
   */
  private async ask_string(prompt: string, default_value: string): Promise<string> {
    const answer = await this.ask_question(`${prompt} [${default_value}]: `)
    return answer.trim().length > 0 ? answer.trim() : default_value
  }

  /**
   * 询问数字输入。
   */
  private async ask_number(prompt: string, default_value: number): Promise<number> {
    while (true) {
      const answer = await this.ask_question(`${prompt} [${default_value}]: `)
      const trimmed = answer.trim()
      if (trimmed.length === 0) return default_value
      const num = Number(trimmed)
      if (Number.isFinite(num) && num > 0) return num
      console.log(`  Invalid number. Please enter a positive number.`)
    }
  }

  /**
   * 询问布尔输入。
   */
  private async ask_boolean(prompt: string, default_value: boolean): Promise<boolean> {
    const hint = default_value ? "Y/n" : "y/N"
    while (true) {
      const answer = (await this.ask_question(`${prompt} [${hint}]: `)).trim().toLowerCase()
      if (answer.length === 0) return default_value
      if (answer === "y" || answer === "yes") return true
      if (answer === "n" || answer === "no") return false
      console.log(`  Please answer 'y' or 'n'.`)
    }
  }

  /**
   * 询问选择输入。
   */
  private async ask_choice(prompt: string, choices: string[], default_value: string): Promise<string> {
    const choices_str = choices.join("|")
    while (true) {
      const answer = (await this.ask_question(`${prompt} (${choices_str}) [${default_value}]: `)).trim().toLowerCase()
      if (answer.length === 0) return default_value
      if (choices.includes(answer)) return answer
      console.log(`  Invalid choice. Please choose from: ${choices_str}`)
    }
  }

  /**
   * 底层问题读取。
   */
  private ask_question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl!.question(prompt, (answer: string) => resolve(answer))
    })
  }
}

/**
 * V19: 非交互式配置生成（用于脚本/CI 场景）。
 *
 * 接受命令行参数，直接生成配置文件，无需交互。
 */
export function generate_config_non_interactive(options: {
  output_path: string
  port?: number
  cwd?: string
  max_turns?: number
  log_level?: string
  verbose?: boolean
  overwrite?: boolean
}): { success: boolean; config: DefaultConfig | null; error?: string } {
  log_info("config_generate_non_interactive")

  if (existsSync(options.output_path) && !options.overwrite) {
    return {
      success: false,
      config: null,
      error: `File exists: ${options.output_path}. Use overwrite: true to replace.`,
    }
  }

  const config: DefaultConfig = apply_config_defaults({
    port: options.port,
    cwd: options.cwd,
    max_turns: options.max_turns,
    log_level: options.log_level,
    verbose: options.verbose,
  })

  try {
    writeFileSync(options.output_path, config_to_yaml(config), "utf-8")
    log_info(`config_generated: ${options.output_path}`)
    return { success: true, config }
  } catch (e) {
    return {
      success: false,
      config: null,
      error: `Failed to write file: ${e}`,
    }
  }
}

/**
 * V19: 显示当前配置（从文件加载并打印）。
 */
export function show_config(file_path: string): { success: boolean; content?: string; error?: string } {
  if (!existsSync(file_path)) {
    return { success: false, error: `File not found: ${file_path}` }
  }
  try {
    const content = require("fs").readFileSync(file_path, "utf-8")
    return { success: true, content }
  } catch (e) {
    return { success: false, error: `Failed to read file: ${e}` }
  }
}

/**
 * V19: 列出所有配置字段及其当前默认值。
 */
export function list_config_fields(): string {
  const config = get_default_config()
  const descriptions: Record<string, string> = {
    "port": `HTTP server port (default: ${config.port})`,
    "cwd": `Working directory (default: ${config.cwd})`,
    "max_turns": `Max conversation turns (default: ${config.max_turns})`,
    "log_level": `Log level (default: ${config.log_level})`,
    "verbose": `Verbose logging (default: ${config.verbose})`,
    "auth.public_paths": `Public paths (default: ${config.auth.public_paths.join(",")})`,
    "auth.rate_limit_max": `Rate limit (default: ${config.auth.rate_limit_max})`,
    "daemon.health_check_interval_ms": `Health check interval (default: ${config.daemon.health_check_interval_ms})`,
    "daemon.plan_recovery_interval_ms": `Recovery interval (default: ${config.daemon.plan_recovery_interval_ms})`,
    "daemon.auto_recover_plans": `Auto recover (default: ${config.daemon.auto_recover_plans})`,
    "daemon.max_recovery_failures": `Max failures (default: ${config.daemon.max_recovery_failures})`,
    "session.default_max_history": `Max history (default: ${config.session.default_max_history})`,
    "shell.timeout_ms": `Shell timeout (default: ${config.shell.timeout_ms})`,
  }

  const lines: string[] = ["Configuration fields:"]
  for (const [key, desc] of Object.entries(descriptions)) {
    lines.push(`  ${key}: ${desc}`)
  }
  return lines.join("\n")
}
