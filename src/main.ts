#!/usr/bin/env bun
/**
 * Claude Code Engine - Main Entry Point
 *
 * 启动引擎 + HTTP 服务器，暴露 async 服务的 REST API。
 *
 * V11 增强：
 *   - 集成 ConfigManager（从 CONFIG_FILE 环境变量加载配置）
 *   - 集成 HealthEndpoint（暴露 /health、/health/live、/health/ready）
 *   - 集成 Daemon（可选自动启动，AUTO_START_DAEMON=true）
 *   - 增强优雅关闭（SIGINT/SIGTERM 先停 HTTP 再停引擎）
 *
 * Usage:
 *   bun run src/main.ts                    # 默认端口 3000
 *   bun run src/main.ts --port 8080        # 指定端口
 *   PORT=8080 bun run src/main.ts          # 通过环境变量指定端口
 *   CONFIG_FILE=/etc/config.yaml bun run src/main.ts  # 加载配置文件
 *   AUTO_START_DAEMON=true bun run src/main.ts        # 自动启动守护进程
 *
 * API 端点：
 *   GET    /health                         # 健康报告（无需鉴权）
 *   GET    /health/live                    # 存活检查（无需鉴权）
 *   GET    /health/ready                   # 就绪检查（无需鉴权）
 *   GET    /api/auth/status                # 认证状态
 *   GET    /api/auth/validate              # 认证校验
 *   POST   /api/messages                   # 添加消息
 *   GET    /api/messages                   # 获取所有消息
 *   DELETE /api/messages                   # 清空消息
 *   POST   /api/shell/run                  # 执行命令
 *   GET    /api/shell/history              # 命令历史
 *   POST   /api/gateway                    # 统一网关
 *   GET    /api/agents                     # Agent 管理（V6）
 *   GET    /api/tasks                      # 任务编排（V7）
 *   GET    /api/skills                     # 技能系统（V8）
 *   GET    /api/plans                      # 长任务规划（V9）
 *   GET    /api/daemon/status              # 守护进程（V10）
 *   GET    /api/config                     # 配置中心（V11）
 *   POST   /api/config/reload              # 配置热重载（V11）
 */

import { log_info, log_error, configure_global_logger, get_global_level } from "./core_infra/infra/global_logger.ts"
import { log_level_to_string, parse_log_level } from "./core_infra/infra/log_level_helpers.ts"
import { LogLevel } from "./core_infra/infra/log_level_enum.ts"
import { ClaudeCodeEngine } from "./index.ts"
import type { QueryEngineConfig } from "./core_infra/core/query_engine_config.ts"

function parse_port(): number {
  const args: string[] = process.argv.slice(2)
  for (let i: number = 0; i < args.length; i++) {
    if (args[i] === "--port" && i + 1 < args.length) {
      const p: number = Number(args[i + 1])
      if (Number.isFinite(p) && p > 0 && p < 65536) {
        return p
      }
    }
  }
  const env_port: string | undefined = process.env.PORT
  if (env_port) {
    const p: number = Number(env_port)
    if (Number.isFinite(p) && p > 0 && p < 65536) {
      return p
    }
  }
  return 3000
}

function get_config(): QueryEngineConfig {
  log_info("main_get_config")
  return {
    cwd: process.cwd(),
    max_turns: 50,
    initial_messages: [],
    verbose: false,
  }
}

async function main(): Promise<void> {
  // V13: 应用 LOG_LEVEL 环境变量到全局 logger
  const env_level: string = process.env.LOG_LEVEL ?? ""
  if (env_level.length > 0) {
    configure_global_logger(parse_log_level(env_level))
  } else {
    configure_global_logger(LogLevel.INFO)
  }
  log_info(`main_start: log_level=${log_level_to_string(get_global_level())}`)

  const config: QueryEngineConfig = get_config()
  const engine: ClaudeCodeEngine = new ClaudeCodeEngine(config)
  await engine.start()

  // V11: 初始化配置管理器（从 CONFIG_FILE 加载）
  const config_mgr = engine.get_config_manager()
  if (config_mgr.is_loaded()) {
    log_info("main_config_loaded")
  }

  // V11: 初始化健康端点（注册默认探针）
  engine.get_health_endpoint()

  const port: number = parse_port()
  const server: { get_port: () => number; stop: () => void } = engine.start_http_server(port)
  const actual_port: number = server.get_port()

  // V11: 可选自动启动守护进程
  const auto_start_daemon: string = process.env.AUTO_START_DAEMON ?? ""
  if (auto_start_daemon === "true" || auto_start_daemon === "1") {
    const daemon = engine.get_daemon()
    await daemon.start()
    log_info("main_daemon_auto_started")
  }

  console.log("========================================")
  console.log("  Claude Code Engine")
  console.log("  Health: " + engine.health_check())
  console.log("  HTTP: http://localhost:" + actual_port)
  console.log("========================================")
  console.log("  Health Endpoints (no auth):")
  console.log("    GET  /health              # Full health report")
  console.log("    GET  /health/live         # Liveness probe")
  console.log("    GET  /health/ready        # Readiness probe")
  console.log("========================================")
  console.log("  API Endpoints (auth required):")
  console.log("    GET    /api/auth/status")
  console.log("    GET    /api/auth/validate")
  console.log("    POST   /api/messages")
  console.log("    GET    /api/messages")
  console.log("    DELETE /api/messages")
  console.log("    POST   /api/shell/run")
  console.log("    GET    /api/shell/history")
  console.log("    POST   /api/gateway")
  console.log("    GET    /api/agents         # V6 Agent management")
  console.log("    GET    /api/tasks          # V7 Task orchestration")
  console.log("    GET    /api/skills         # V8 Skill system")
  console.log("    GET    /api/plans          # V9 Long task planning")
  console.log("    GET    /api/daemon/status  # V10 Daemon")
  console.log("    GET    /api/config         # V11 Config center")
  console.log("    POST   /api/config/reload  # V11 Config hot reload")
  console.log("========================================")
  console.log("  Press Ctrl+C to stop")
  console.log("========================================")

  // 优雅关闭：SIGINT/SIGTERM
  let shutting_down: boolean = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shutting_down) {
      log_info(`main_already_shutting_down: ${signal}`)
      return
    }
    shutting_down = true
    log_info(`main_signal: ${signal}`)
    console.log(`\nShutting down (${signal})...`)

    // 先停 HTTP 服务器（停止接收新请求）
    try {
      server.stop()
    } catch (e) {
      log_error(`main_server_stop_error: ${e}`)
    }

    // 再停引擎（停止守护进程、关闭存储）
    try {
      engine.stop()
    } catch (e) {
      log_error(`main_engine_stop_error: ${e}`)
    }

    process.exit(0)
  }

  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))

  log_info("main_running")
}

main().catch((err: unknown) => {
  log_error(`main_failed: ${err}`)
  console.error("Engine failed:", err)
  process.exit(1)
})
