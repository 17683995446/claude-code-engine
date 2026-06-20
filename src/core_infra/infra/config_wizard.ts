import { writeFileSync, existsSync, readFileSync } from "fs"
import { parse } from "yaml"
import { log_info, log_warn } from "./global_logger.ts"
import {
  DEFAULT_CONFIG,
  get_default_config,
  apply_config_defaults,
  config_to_yaml,
} from "./config_defaults.ts"
import type { DefaultConfig } from "./config_defaults.ts"

/**
 * V16: 配置向导选项。
 */
export interface WizardOptions {
  /** 配置文件输出路径 */
  output_path?: string
  /** 端口 */
  port?: number
  /** 工作目录 */
  cwd?: string
  /** 最大对话轮次 */
  max_turns?: number
  /** 日志级别 */
  log_level?: string
  /** 是否自动检测环境 */
  auto_detect?: boolean
  /** 是否覆盖已存在的配置文件 */
  overwrite?: boolean
}

/**
 * V16: 环境检测结果。
 */
export interface EnvironmentDetection {
  /** 是否检测到 OPENAI_API_KEY */
  has_openai_api_key: boolean
  /** 是否检测到 API_KEY */
  has_api_key: boolean
  /** 是否检测到 PORT 环境变量 */
  has_port_env: boolean
  /** 是否检测到 CONFIG_FILE 环境变量 */
  has_config_file: boolean
  /** 是否检测到 AUTO_START_DAEMON */
  has_auto_start_daemon: boolean
  /** 检测到的端口（如有） */
  detected_port: number | null
  /** 检测到的配置文件路径（如有） */
  detected_config_file: string | null
}

/**
 * V16: 配置向导结果。
 */
export interface WizardResult {
  /** 生成的配置 */
  config: DefaultConfig
  /** 配置文件路径（如已写入） */
  file_path: string | null
  /** 环境检测结果 */
  environment: EnvironmentDetection
  /** 是否使用了自动检测的值 */
  used_auto_detect: boolean
}

/**
 * V16: 检测当前环境变量配置。
 */
export function detect_environment(): EnvironmentDetection {
  log_info("config_wizard_detect_environment")
  const openai_key: string = process.env.OPENAI_API_KEY ?? ""
  const api_key: string = process.env.API_KEY ?? ""
  const port_env: string = process.env.PORT ?? ""
  const config_file: string = process.env.CONFIG_FILE ?? ""
  const auto_daemon: string = process.env.AUTO_START_DAEMON ?? ""

  const detected_port: number | null = port_env.length > 0
    ? (() => {
        const p: number = Number(port_env)
        return Number.isFinite(p) && p > 0 && p < 65536 ? p : null
      })()
    : null

  return {
    has_openai_api_key: openai_key.length > 0,
    has_api_key: api_key.length > 0,
    has_port_env: port_env.length > 0,
    has_config_file: config_file.length > 0,
    has_auto_start_daemon: auto_daemon === "true" || auto_daemon === "1",
    detected_port,
    detected_config_file: config_file.length > 0 ? config_file : null,
  }
}

/**
 * V16: 运行配置向导。
 *
 * 根据提供的选项和环境变量自动检测，生成配置对象。
 * 如果提供 output_path，将配置写入 YAML 文件。
 *
 * @example
 * ```typescript
 * // 自动检测并生成配置文件
 * const result = run_config_wizard({
 *   output_path: "./config.yaml",
 *   auto_detect: true,
 *   overwrite: true
 * })
 * ```
 */
export function run_config_wizard(options: WizardOptions = {}): WizardResult {
  log_info("config_wizard_run")

  const env: EnvironmentDetection = options.auto_detect !== false
    ? detect_environment()
    : {
        has_openai_api_key: false,
        has_api_key: false,
        has_port_env: false,
        has_config_file: false,
        has_auto_start_daemon: false,
        detected_port: null,
        detected_config_file: null,
      }

  // 构建用户配置覆盖
  const user_config: Partial<DefaultConfig> = {}

  // 端口：优先选项 > 环境检测 > 默认
  if (options.port !== undefined) {
    user_config.port = options.port
  } else if (env.detected_port !== null) {
    user_config.port = env.detected_port
  }

  // 工作目录
  if (options.cwd !== undefined) {
    user_config.cwd = options.cwd
  }

  // 最大对话轮次
  if (options.max_turns !== undefined) {
    user_config.max_turns = options.max_turns
  }

  // 日志级别
  if (options.log_level !== undefined) {
    user_config.log_level = options.log_level
  }

  // 合并默认值
  const config: DefaultConfig = apply_config_defaults(user_config)

  // 写入文件
  let file_path: string | null = null
  if (options.output_path) {
    if (existsSync(options.output_path) && !options.overwrite) {
      log_warn(`config_wizard_file_exists: ${options.output_path}`)
    } else {
      const yaml_content: string = config_to_yaml(config)
      writeFileSync(options.output_path, yaml_content, "utf-8")
      file_path = options.output_path
      log_info(`config_wizard_file_written: ${file_path}`)
    }
  }

  const used_auto_detect: boolean = options.auto_detect !== false && (
    env.detected_port !== null ||
    env.has_openai_api_key ||
    env.has_api_key ||
    env.has_config_file
  )

  return {
    config,
    file_path,
    environment: env,
    used_auto_detect,
  }
}

/**
 * V16: 验证配置文件。
 *
 * 检查配置文件是否存在、是否可解析、是否包含必需字段。
 */
export function validate_config_file(file_path: string): {
  valid: boolean
  errors: string[]
  config: Record<string, unknown> | null
} {
  log_info(`config_wizard_validate: ${file_path}`)
  const errors: string[] = []

  // 检查文件存在
  if (!existsSync(file_path)) {
    errors.push(`File not found: ${file_path}`)
    return { valid: false, errors, config: null }
  }

  // 读取并解析
  let config: Record<string, unknown> = {}
  try {
    const content: string = readFileSync(file_path, "utf-8")
    config = parse(content) as Record<string, unknown>
  } catch (e) {
    errors.push(`Failed to parse config file: ${e}`)
    return { valid: false, errors, config: null }
  }

  // 验证字段类型
  if (config.port !== undefined && typeof config.port !== "number") {
    errors.push("'port' must be a number")
  }
  if (config.max_turns !== undefined && typeof config.max_turns !== "number") {
    errors.push("'max_turns' must be a number")
  }
  if (config.log_level !== undefined && typeof config.log_level !== "string") {
    errors.push("'log_level' must be a string")
  }
  if (config.verbose !== undefined && typeof config.verbose !== "boolean") {
    errors.push("'verbose' must be a boolean")
  }

  // 验证端口范围
  if (typeof config.port === "number") {
    if (config.port <= 0 || config.port >= 65536) {
      errors.push("'port' must be between 1 and 65535")
    }
  }

  // 验证 max_turns 范围
  if (typeof config.max_turns === "number") {
    if (config.max_turns <= 0) {
      errors.push("'max_turns' must be greater than 0")
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    config: errors.length === 0 ? config : null,
  }
}

/**
 * V16: 生成示例配置文件。
 *
 * 在指定路径写入包含所有默认值的示例配置文件。
 */
export function generate_example_config(output_path: string, overwrite: boolean = false): string {
  log_info(`config_wizard_generate_example: ${output_path}`)
  if (existsSync(output_path) && !overwrite) {
    log_warn(`config_wizard_example_exists: ${output_path}`)
    return output_path
  }
  const config: DefaultConfig = get_default_config()
  const yaml_content: string = config_to_yaml(config)
  writeFileSync(output_path, yaml_content, "utf-8")
  return output_path
}

/**
 * V16: 获取配置项的描述信息。
 */
export function get_config_field_descriptions(): Record<string, string> {
  return {
    port: `HTTP server port (default: ${DEFAULT_CONFIG.port})`,
    cwd: `Working directory (default: ${DEFAULT_CONFIG.cwd})`,
    max_turns: `Maximum conversation turns (default: ${DEFAULT_CONFIG.max_turns})`,
    log_level: `Log level: debug|info|warn|error (default: ${DEFAULT_CONFIG.log_level})`,
    verbose: `Enable verbose logging (default: ${DEFAULT_CONFIG.verbose})`,
    "auth.public_paths": `Paths that don't require authentication (default: ${DEFAULT_CONFIG.auth.public_paths.join(",")})`,
    "auth.rate_limit_max": `Maximum requests per window (default: ${DEFAULT_CONFIG.auth.rate_limit_max})`,
    "daemon.health_check_interval_ms": `Health check interval in ms (default: ${DEFAULT_CONFIG.daemon.health_check_interval_ms})`,
    "daemon.plan_recovery_interval_ms": `Plan recovery interval in ms (default: ${DEFAULT_CONFIG.daemon.plan_recovery_interval_ms})`,
    "daemon.auto_recover_plans": `Auto recover failed plans (default: ${DEFAULT_CONFIG.daemon.auto_recover_plans})`,
    "daemon.max_recovery_failures": `Max recovery failures before stopping (default: ${DEFAULT_CONFIG.daemon.max_recovery_failures})`,
    "session.default_max_history": `Default max session history (default: ${DEFAULT_CONFIG.session.default_max_history})`,
    "shell.timeout_ms": `Shell command timeout in ms (default: ${DEFAULT_CONFIG.shell.timeout_ms})`,
  }
}
