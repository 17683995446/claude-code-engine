/**
 * CLI 参数解析器（V12）。
 *
 * 提供轻量级命令行参数解析，支持：
 *   --flag             布尔标志
 *   --key=value        键值对（等号语法）
 *   --key value        键值对（空格语法）
 *   -k value           短选项
 *   位置参数            非选项参数
 *
 * 设计原则：
 *   - 零依赖：不引入外部 CLI 库，保持轻量
 *   - 类型化：解析结果为 CliArgs 结构化对象
 *   - 容错：未知选项存入 unknown，不报错
 *   - 可组合：parse_args 可独立使用，也可配合 print_help
 */

/**
 * 解析后的命令行参数。
 */
export type CliArgs = {
  /** 命令名（第一个参数，如 "serve"、"chat"） */
  command: string | null
  /** 选项键值对（--port=8080 → options.port = "8080"） */
  options: Record<string, string>
  /** 布尔标志（--verbose → flags.verbose = true） */
  flags: Record<string, boolean>
  /** 位置参数（非选项参数） */
  positional: string[]
  /** 未识别的原始参数（用于调试） */
  unknown: string[]
}

/**
 * 解析命令行参数。
 *
 * @param argv 参数数组（通常为 process.argv.slice(2)）
 * @returns 解析结果
 */
export function parse_args(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: null,
    options: {},
    flags: {},
    positional: [],
    unknown: [],
  }

  let i: number = 0
  // 第一个非选项参数作为 command
  let command_set: boolean = false

  while (i < argv.length) {
    const arg: string = argv[i]

    // --key=value 语法
    if (arg.startsWith("--") && arg.includes("=")) {
      const eq_idx: number = arg.indexOf("=")
      const key: string = arg.slice(2, eq_idx)
      const value: string = arg.slice(eq_idx + 1)
      args.options[key] = value
      i += 1
      continue
    }

    // --key value 或 --flag 语法
    if (arg.startsWith("--")) {
      const key: string = arg.slice(2)
      // 检查下一个参数是否为值（非选项）
      if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        // 下一个参数是值
        args.options[key] = argv[i + 1]
        i += 2
      } else {
        // 布尔标志
        args.flags[key] = true
        i += 1
      }
      continue
    }

    // -k value 短选项语法
    if (arg.startsWith("-") && arg.length > 1) {
      const key: string = arg.slice(1)
      if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        args.options[key] = argv[i + 1]
        i += 2
      } else {
        args.flags[key] = true
        i += 1
      }
      continue
    }

    // 位置参数
    if (!command_set) {
      args.command = arg
      command_set = true
    } else {
      args.positional.push(arg)
    }
    i += 1
  }

  return args
}

/**
 * 获取选项值，支持默认值。
 */
export function get_option(args: CliArgs, key: string, default_value: string = ""): string {
  return args.options[key] ?? default_value
}

/**
 * 获取数字选项值，支持默认值。
 * 非数字时返回默认值。
 */
export function get_number_option(args: CliArgs, key: string, default_value: number): number {
  const raw: string = args.options[key] ?? ""
  if (raw.length === 0) {
    return default_value
  }
  const num: number = Number(raw)
  return Number.isFinite(num) ? num : default_value
}

/**
 * 检查标志是否存在。
 */
export function has_flag(args: CliArgs, key: string): boolean {
  return args.flags[key] === true
}

/**
 * CLI 版本信息。
 */
export const CLI_VERSION: string = "1.0.0"

/**
 * 打印帮助信息。
 */
export function print_help(): void {
  console.log(`
Claude Code Engine CLI v${CLI_VERSION}

Usage:
  bun run src/cli.ts [command] [options]

Commands:
  serve                Start HTTP server (default)
  chat                 Start interactive chat REPL
  status               Show engine status and exit
  config <subcommand>  Configuration management (V19)
    config init          Interactive config wizard
    config generate      Non-interactive config generation
    config show          Show current config file
    config list          List all config fields
  init <template>       Generate project from template (V20)
    init list            List available templates
    init basic [name]    Basic project template
    init api-server [name] API server template
    init agent [name]    Custom agent template
    init skill [name]    Custom skill template
    init plugin [name]   Plugin template
  doctor               Run diagnostics and health checks (V21)
  help                 Show this help message

First Run (V22):
  On first run, an interactive guide will help you configure the engine.
  The guide progress is saved in ~/.claude_code/first_run.json
  Run 'bun run src/cli.ts serve' to start the guide.

Options:
  --port <number>      HTTP server port (default: 3000)
  --cwd <path>         Working directory (default: current directory)
  --max-turns <number> Maximum conversation turns (default: 50)
  --config <path>      Config file path (YAML)
  --log-level <level>  Log level: debug|info|warn|error (default: info)
  --verbose            Enable verbose output
  --quiet              Suppress all output except errors
  --version            Show version and exit
  --help               Show this help message

Environment Variables:
  PORT                 HTTP server port
  API_KEYS             Comma-separated API keys for authentication
  OPENAI_API_KEY       OpenAI API key for LLM
  CONFIG_FILE          Path to config file
  LOG_LEVEL            Log level (debug|info|warn|error)
  AUTO_START_DAEMON    Auto-start daemon (true|false)

Examples:
  bun run src/cli.ts serve --port 8080
  bun run src/cli.ts chat
  bun run src/cli.ts status
  bun run src/cli.ts --version
  PORT=8080 bun run src/cli.ts serve
`)
}

/**
 * 打印版本信息。
 */
export function print_version(): void {
  console.log(`Claude Code Engine CLI v${CLI_VERSION}`)
}

/**
 * 从参数和环境变量解析端口。
 * 优先级：--port 选项 > PORT 环境变量 > 默认值
 */
export function resolve_port(args: CliArgs, default_port: number = 3000): number {
  const port_opt: number = get_number_option(args, "port", 0)
  if (port_opt > 0) {
    return port_opt
  }
  const env_port: string = process.env.PORT ?? ""
  if (env_port.length > 0) {
    const p: number = Number(env_port)
    if (Number.isFinite(p) && p > 0 && p < 65536) {
      return p
    }
  }
  return default_port
}

/**
 * 从参数和环境变量解析日志级别。
 * 优先级：--log-level 选项 > LOG_LEVEL 环境变量 > 默认值
 */
export function resolve_log_level(args: CliArgs, default_level: string = "info"): string {
  const level_opt: string = get_option(args, "log-level", "")
  if (level_opt.length > 0) {
    return level_opt
  }
  const env_level: string = process.env.LOG_LEVEL ?? ""
  if (env_level.length > 0) {
    return env_level
  }
  return default_level
}
