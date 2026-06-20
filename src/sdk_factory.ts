import { ClaudeCodeEngine } from "./index.ts"
import type { QueryEngineConfig } from "./core_infra/core/query_engine_config.ts"
import type { Message } from "./core_infra/core/message_types.ts"
import { log_info } from "./core_infra/infra/global_logger.ts"

/**
 * V15: 简化的引擎创建选项。
 *
 * 所有字段均为可选，提供合理的默认值，降低用户使用门槛。
 */
export interface EngineOptions {
  /** 工作目录，默认 process.cwd() */
  cwd?: string
  /** 最大对话轮次，默认 50 */
  max_turns?: number
  /** 初始消息列表，默认空数组 */
  initial_messages?: Message[]
  /** 是否输出详细日志，默认 false */
  verbose?: boolean
}

/**
 * V15: 默认引擎配置。
 */
export const DEFAULT_ENGINE_OPTIONS: Required<EngineOptions> = {
  cwd: process.cwd(),
  max_turns: 50,
  initial_messages: [],
  verbose: false,
}

/**
 * V15: 将 EngineOptions 转换为完整的 QueryEngineConfig。
 */
export function resolve_engine_config(options?: EngineOptions): QueryEngineConfig {
  const opts: EngineOptions = options ?? {}
  return {
    cwd: opts.cwd ?? DEFAULT_ENGINE_OPTIONS.cwd,
    max_turns: opts.max_turns ?? DEFAULT_ENGINE_OPTIONS.max_turns,
    initial_messages: opts.initial_messages ?? DEFAULT_ENGINE_OPTIONS.initial_messages,
    verbose: opts.verbose ?? DEFAULT_ENGINE_OPTIONS.verbose,
  }
}

/**
 * V15: 创建引擎实例（工厂函数）。
 *
 * 提供简化的配置接口，所有参数可选。
 *
 * @example
 * ```typescript
 * // 最简创建
 * const engine = create_engine()
 *
 * // 自定义配置
 * const engine = create_engine({ cwd: "/project", max_turns: 100 })
 * ```
 */
export function create_engine(options?: EngineOptions): ClaudeCodeEngine {
  log_info("sdk_factory_create_engine")
  const config: QueryEngineConfig = resolve_engine_config(options)
  return new ClaudeCodeEngine(config)
}

/**
 * V15: 从环境变量创建引擎实例。
 *
 * 读取以下环境变量：
 *   - ENGINE_CWD: 工作目录（默认 process.cwd()）
 *   - ENGINE_MAX_TURNS: 最大对话轮次（默认 50）
 *   - ENGINE_VERBOSE: 是否详细日志（"true"/"1" 启用）
 */
export function create_engine_from_env(): ClaudeCodeEngine {
  log_info("sdk_factory_create_from_env")
  const options: EngineOptions = {}

  const env_cwd: string | undefined = process.env.ENGINE_CWD
  if (env_cwd && env_cwd.length > 0) {
    options.cwd = env_cwd
  }

  const env_max_turns: string | undefined = process.env.ENGINE_MAX_TURNS
  if (env_max_turns) {
    const turns: number = Number(env_max_turns)
    if (Number.isFinite(turns) && turns > 0) {
      options.max_turns = turns
    }
  }

  const env_verbose: string | undefined = process.env.ENGINE_VERBOSE
  if (env_verbose === "true" || env_verbose === "1") {
    options.verbose = true
  }

  return create_engine(options)
}

/**
 * V15: 快速启动 - 创建并启动引擎。
 *
 * 等价于 `const engine = create_engine(options); await engine.start()`
 *
 * @example
 * ```typescript
 * const engine = await quick_start({ cwd: "/project" })
 * const server = engine.start_http_server(3000)
 * ```
 */
export async function quick_start(options?: EngineOptions): Promise<ClaudeCodeEngine> {
  log_info("sdk_factory_quick_start")
  const engine: ClaudeCodeEngine = create_engine(options)
  await engine.start()
  return engine
}

/**
 * V15: 快速启动 HTTP 服务器。
 *
 * 创建引擎、启动、并监听指定端口。
 *
 * @example
 * ```typescript
 * const { engine, server } = await quick_serve({ port: 3000 })
 * ```
 */
export async function quick_serve(
  options?: EngineOptions,
  port: number = 3000,
): Promise<{ engine: ClaudeCodeEngine; server: { get_port: () => number; stop: () => void } }> {
  log_info("sdk_factory_quick_serve")
  const engine: ClaudeCodeEngine = await quick_start(options)
  const server = engine.start_http_server(port)
  return { engine, server }
}
