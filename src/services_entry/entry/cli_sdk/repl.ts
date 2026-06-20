/**
 * 交互式 REPL 模块（V12）。
 *
 * 提供交互式对话界面，用户可以：
 *   - 输入消息与引擎对话
 *   - 使用 /help 查看命令
 *   - 使用 /history 查看历史
 *   - 使用 /clear 清空历史
 *   - 使用 /shell <cmd> 执行 shell 命令
 *   - 使用 /exit 退出
 *
 * 设计原则：
 *   - 零依赖：使用 Node.js readline 内置模块
 *   - 流式输出：支持 SSE 流式响应实时显示
 *   - 命令系统：/ 前缀为内置命令
 *   - 优雅退出：Ctrl+C / /exit / Ctrl+D 均可退出
 */

import * as readline from "readline"
import { log_info, log_error } from "../../../core_infra/infra/global_logger.ts"
import type { ClaudeCodeEngine } from "../../../index.ts"
import type { LlmStreamChunk } from "../../../core_infra/core/i_llm_adapter.ts"
import { ReplHistory, ReplCompleter, create_repl_completer } from "./repl_history.ts"

/**
 * REPL 命令处理器类型。
 */
export type ReplCommandHandler = (args: string[], engine: ClaudeCodeEngine) => Promise<void>

/**
 * REPL 命令定义。
 */
export type ReplCommand = {
  name: string
  description: string
  handler: ReplCommandHandler
}

/**
 * 交互式 REPL 会话。
 */
export class InteractiveRepl {
  private readonly engine: ClaudeCodeEngine
  private readonly commands: Map<string, ReplCommand> = new Map()
  private readonly history: ReplHistory
  private rl: readline.Interface | null = null
  private running: boolean = false

  constructor(engine: ClaudeCodeEngine, history?: ReplHistory) {
    this.engine = engine
    this.history = history ?? new ReplHistory()
    this.register_default_commands()
  }

  /**
   * 启动 REPL。
   */
  async start(): Promise<void> {
    this.running = true
    const completer = create_repl_completer(Array.from(this.commands.keys()))
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
      completer: completer,
    })

    // V18: 加载历史记录到 readline
    for (const entry of this.history.get_all()) {
      (this.rl as any).history?.unshift(entry)
    }

    this.print_welcome()
    this.rl.prompt()

    this.rl.on("line", async (line: string) => {
      const input: string = line.trim()
      if (input.length === 0) {
        this.rl!.prompt()
        return
      }

      // V18: 记录到历史
      this.history.add(input)

      // 命令
      if (input.startsWith("/")) {
        await this.handle_command(input)
        if (this.running) {
          this.rl!.prompt()
        }
        return
      }

      // 对话
      await this.handle_chat(input)
      if (this.running) {
        this.rl!.prompt()
      }
    })

    this.rl.on("close", () => {
      this.running = false
      console.log("\nGoodbye!")
    })

    // 保持进程运行
    return new Promise((resolve) => {
      this.rl!.on("close", () => {
        resolve()
      })
    })
  }

  /**
   * 停止 REPL。
   */
  stop(): void {
    this.running = false
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }

  /**
   * 注册自定义命令。
   */
  register_command(command: ReplCommand): void {
    this.commands.set(command.name, command)
  }

  // ===== 内部方法 =====

  private print_welcome(): void {
    console.log("========================================")
    console.log("  Claude Code Engine - Interactive Chat")
    console.log("  Type /help for commands, /exit to quit")
    console.log("========================================")
  }

  private async handle_command(input: string): Promise<void> {
    const parts: string[] = input.slice(1).split(/\s+/)
    const cmd_name: string = parts[0]
    const args: string[] = parts.slice(1)

    if (cmd_name === "exit" || cmd_name === "quit") {
      console.log("Goodbye!")
      this.stop()
      return
    }

    const command: ReplCommand | undefined = this.commands.get(cmd_name)
    if (!command) {
      console.log(`Unknown command: /${cmd_name}. Type /help for available commands.`)
      return
    }

    try {
      await command.handler(args, this.engine)
    } catch (e) {
      console.log(`Command error: ${e}`)
      log_error(`repl_command_error: /${cmd_name} ${e}`)
    }
  }

  private async handle_chat(input: string): Promise<void> {
    try {
      const conversation = this.engine.get_conversation_engine()
      process.stdout.write("Assistant: ")
      // 尝试流式输出
      try {
        for await (const chunk of conversation.stream_chat(input)) {
          if (chunk.type === "delta") {
            process.stdout.write(chunk.content ?? "")
          } else if (chunk.type === "done") {
            process.stdout.write("\n")
          }
        }
      } catch {
        // 流式失败，回退到非流式
        const response = await conversation.chat(input)
        console.log(response.content)
      }
    } catch (e) {
      console.log(`Chat error: ${e}`)
      log_error(`repl_chat_error: ${e}`)
    }
  }

  private register_default_commands(): void {
    this.register_command({
      name: "help",
      description: "Show available commands",
      handler: async () => {
        console.log("Available commands:")
        console.log("  /help              Show this help")
        console.log("  /history           Show conversation history")
        console.log("  /clear             Clear conversation history")
        console.log("  /shell <cmd>       Execute shell command")
        console.log("  /agents            List registered agents")
        console.log("  /skills            List registered skills")
        console.log("  /plans             List plans")
        console.log("  /daemon            Show daemon status")
        console.log("  /health            Show health status")
        console.log("  /search <query>    Search REPL history (V18)")
        console.log("  /hclear            Clear REPL history file (V18)")
        console.log("  /exit              Exit the REPL")
        console.log("")
        console.log("Tips (V18):")
        console.log("  - Press TAB for command/path completion")
        console.log("  - Up/Down arrows browse REPL history")
      },
    })

    this.register_command({
      name: "history",
      description: "Show conversation history",
      handler: async (_args, engine) => {
        const messages = await engine.get_conversation_engine().get_messages()
        if (messages.length === 0) {
          console.log("No messages in history.")
          return
        }
        for (const msg of messages) {
          const role: string = msg.role ?? "unknown"
          const content: string = msg.content ?? ""
          console.log(`[${role}] ${content}`)
        }
      },
    })

    this.register_command({
      name: "clear",
      description: "Clear conversation history",
      handler: async (_args, engine) => {
        await engine.get_conversation_engine().clear()
        console.log("Conversation history cleared.")
      },
    })

    this.register_command({
      name: "shell",
      description: "Execute shell command",
      handler: async (args, engine) => {
        if (args.length === 0) {
          console.log("Usage: /shell <command>")
          return
        }
        const command: string = args.join(" ")
        const shell = engine.get_async_shell()
        const result = await shell.run({ command, timeout_ms: 10000 })
        console.log(`exit_code: ${result.exit_code}`)
        if (result.stdout.length > 0) {
          console.log(`stdout: ${result.stdout}`)
        }
        if (result.stderr.length > 0) {
          console.log(`stderr: ${result.stderr}`)
        }
      },
    })

    this.register_command({
      name: "agents",
      description: "List registered agents",
      handler: async (_args, engine) => {
        const registry = engine.get_agent_registry()
        const agents = await registry.list()
        if (agents.length === 0) {
          console.log("No agents registered.")
          return
        }
        console.log(`Agents (${agents.length}):`)
        for (const agent of agents) {
          console.log(`  ${agent.id}: ${agent.name} [${agent.status}]`)
        }
      },
    })

    this.register_command({
      name: "skills",
      description: "List registered skills",
      handler: async (_args, engine) => {
        const registry = engine.get_skill_registry()
        const skills = await registry.list()
        if (skills.length === 0) {
          console.log("No skills registered.")
          return
        }
        console.log(`Skills (${skills.length}):`)
        for (const skill of skills) {
          console.log(`  ${skill.id}: ${skill.name} ${skill.builtin ? "(builtin)" : "(learned)"}`)
        }
      },
    })

    this.register_command({
      name: "plans",
      description: "List plans",
      handler: async (_args, engine) => {
        const planner = engine.get_planner()
        const plans = await planner.list_plans()
        if (plans.length === 0) {
          console.log("No plans.")
          return
        }
        console.log(`Plans (${plans.length}):`)
        for (const plan of plans) {
          console.log(`  ${plan.id}: ${plan.name} [${plan.status}] ${plan.completed_phases}/${plan.phase_count} phases`)
        }
      },
    })

    this.register_command({
      name: "daemon",
      description: "Show daemon status",
      handler: async (_args, engine) => {
        const daemon = engine.get_daemon()
        const status = daemon.get_status()
        const metrics = daemon.get_metrics()
        console.log(`Daemon status: ${status}`)
        console.log(`  Health checks: ${metrics.health_checks}`)
        console.log(`  Plan recoveries: ${metrics.plan_recoveries}`)
        console.log(`  Current health: ${metrics.current_health}`)
      },
    })

    this.register_command({
      name: "health",
      description: "Show health status",
      handler: async (_args, engine) => {
        const health = engine.health_check()
        console.log(`Engine health: ${health}`)
      },
    })

    this.register_command({
      name: "search",
      description: "Search REPL history (V18)",
      handler: async (args) => {
        if (args.length === 0) {
          console.log("Usage: /search <query>")
          return
        }
        const query: string = args.join(" ")
        const results: string[] = this.history.search(query)
        if (results.length === 0) {
          console.log(`No history matches '${query}'.`)
          return
        }
        console.log(`History matches (${results.length}):`)
        for (let i = 0; i < results.length; i++) {
          console.log(`  ${i + 1}: ${results[i]}`)
        }
      },
    })

    this.register_command({
      name: "hclear",
      description: "Clear REPL history file (V18)",
      handler: async () => {
        this.history.clear()
        console.log("REPL history cleared.")
      },
    })
  }
}
