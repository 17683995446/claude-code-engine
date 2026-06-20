import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type {
  IAgent,
  AgentAction,
  AgentResult,
  AgentInfo,
  AgentStatus,
  AgentCapability,
} from "../../core_infra/core/i_agent.ts"
import type { IAsyncShellService } from "../../core_infra/core/i_async_services.ts"
import type { IAsyncLlmAdapter, LlmRequest } from "../../core_infra/core/i_llm_adapter.ts"
import type { IAsyncMessageService } from "../../core_infra/core/i_async_services.ts"

/**
 * Agent 实现集合（V6）。
 *
 * 提供：
 *   - ShellAgent：封装 Shell 执行能力，支持命令运行和历史查询
 *   - ChatAgent：封装对话能力，支持多轮对话和上下文管理
 *
 * 所有 Agent 实现 IAgent 接口，遵循 init → start → act → stop 生命周期。
 */

/**
 * AgentBase - Agent 抽象基类。
 *
 * 提供通用的状态管理、生命周期控制和元数据维护。
 * 子类只需实现 act() 方法和 get_capabilities()。
 */
export abstract class AgentBase implements IAgent {
  protected readonly id: string
  protected readonly name: string
  protected readonly type: string
  protected status: AgentStatus = "idle"
  protected readonly created_at: number
  protected last_active_at: number
  protected initialized: boolean = false

  constructor(id: string, name: string, type: string) {
    this.id = id
    this.name = name
    this.type = type
    this.created_at = Date.now()
    this.last_active_at = this.created_at
    log_info(`agent_created: id=${id} name=${name} type=${type}`)
  }

  get_id(): string {
    return this.id
  }

  get_name(): string {
    return this.name
  }

  get_type(): string {
    return this.type
  }

  get_status(): AgentStatus {
    return this.status
  }

  abstract get_capabilities(): AgentCapability[]

  async init(): Promise<void> {
    log_info(`agent_init: id=${this.id}`)
    this.initialized = true
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      log_warn(`agent_not_initialized: id=${this.id}`)
      await this.init()
    }
    log_info(`agent_start: id=${this.id}`)
    this.status = "running"
  }

  abstract act(action: AgentAction): Promise<AgentResult>

  async stop(): Promise<void> {
    log_info(`agent_stop: id=${this.id}`)
    this.status = "stopped"
  }

  get_info(): AgentInfo {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      capabilities: this.get_capabilities(),
      status: this.status,
      created_at: this.created_at,
      last_active_at: this.last_active_at,
    }
  }

  to_object(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      created_at: this.created_at,
      last_active_at: this.last_active_at,
      capabilities: this.get_capabilities(),
    }
  }

  /**
   * 更新最后活跃时间。
   */
  protected touch(): void {
    this.last_active_at = Date.now()
  }

  /**
   * 执行动作并包装结果（子类调用的辅助方法）。
   */
  protected async execute_action(
    action_type: string,
    fn: () => Promise<unknown>,
  ): Promise<AgentResult> {
    if (this.status !== "running") {
      return {
        success: false,
        output: null,
        error: `agent_not_running: status=${this.status}`,
        duration_ms: 0,
      }
    }
    const start: number = Date.now()
    this.touch()
    try {
      const output: unknown = await fn()
      return {
        success: true,
        output,
        error: null,
        duration_ms: Date.now() - start,
      }
    } catch (e) {
      log_error(`agent_action_failed: id=${this.id} action=${action_type} error=${e}`)
      this.status = "error"
      return {
        success: false,
        output: null,
        error: String(e),
        duration_ms: Date.now() - start,
      }
    }
  }
}

/**
 * ShellAgent - Shell 执行 Agent（V6）。
 *
 * 封装 IAsyncShellService，提供命令执行能力。
 *
 * 支持的动作：
 *   - shell.run：执行命令  input: { command: string, timeout_ms?: number }
 *   - shell.history：获取历史  input: {}
 */
export class ShellAgent extends AgentBase {
  private readonly shell: IAsyncShellService

  constructor(id: string, shell: IAsyncShellService) {
    super(id, "ShellAgent", "shell")
    this.shell = shell
  }

  get_capabilities(): AgentCapability[] {
    return [
      { name: "shell.run", description: "Execute a shell command" },
      { name: "shell.history", description: "Get command execution history" },
    ]
  }

  async act(action: AgentAction): Promise<AgentResult> {
    if (action.type === "shell.run") {
      const command: string = String(action.input["command"] ?? "")
      const timeout_ms: number = Number(action.input["timeout_ms"] ?? 5000)
      return this.execute_action(action.type, async () => {
        return this.shell.run({ command, timeout_ms })
      })
    }
    if (action.type === "shell.history") {
      return this.execute_action(action.type, async () => {
        return this.shell.get_history()
      })
    }
    return {
      success: false,
      output: null,
      error: `unknown_action: ${action.type}`,
      duration_ms: 0,
    }
  }
}

/**
 * ChatAgent - 对话 Agent（V6）。
 *
 * 封装 IAsyncLlmAdapter + IAsyncMessageService，提供多轮对话能力。
 *
 * 支持的动作：
 *   - chat.send：发送消息  input: { message: string }
 *   - chat.history：获取历史  input: {}
 *   - chat.clear：清空历史  input: {}
 */
export class ChatAgent extends AgentBase {
  private readonly llm: IAsyncLlmAdapter
  private readonly messages: IAsyncMessageService
  private readonly system_prompt: string | null

  constructor(
    id: string,
    llm: IAsyncLlmAdapter,
    messages: IAsyncMessageService,
    options: { system_prompt?: string } = {},
  ) {
    super(id, "ChatAgent", "chat")
    this.llm = llm
    this.messages = messages
    this.system_prompt = options.system_prompt ?? null
  }

  get_capabilities(): AgentCapability[] {
    return [
      { name: "chat.send", description: "Send a message and get a response" },
      { name: "chat.history", description: "Get conversation history" },
      { name: "chat.clear", description: "Clear conversation history" },
    ]
  }

  async act(action: AgentAction): Promise<AgentResult> {
    if (action.type === "chat.send") {
      const message: string = String(action.input["message"] ?? "")
      if (message.length === 0) {
        return {
          success: false,
          output: null,
          error: "message_required",
          duration_ms: 0,
        }
      }
      return this.execute_action(action.type, async () => {
        // 追加用户消息
        await this.messages.add(message, "user")
        // 构建上下文
        const history = await this.messages.get_all()
        const llm_messages = this.build_context(history)
        const request: LlmRequest = { messages: llm_messages }
        const response = await this.llm.chat(request)
        // 追加助手回复
        if (response.content.length > 0) {
          await this.messages.add(response.content, "assistant")
        }
        return response
      })
    }
    if (action.type === "chat.history") {
      return this.execute_action(action.type, async () => {
        return this.messages.get_all()
      })
    }
    if (action.type === "chat.clear") {
      return this.execute_action(action.type, async () => {
        await this.messages.clear()
        return { cleared: true }
      })
    }
    return {
      success: false,
      output: null,
      error: `unknown_action: ${action.type}`,
      duration_ms: 0,
    }
  }

  private build_context(
    history: Array<{ role: string; content: string }>,
  ): Array<{ role: "user" | "assistant" | "system"; content: string }> {
    const llm_messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = []
    if (this.system_prompt) {
      llm_messages.push({ role: "system", content: this.system_prompt })
    }
    for (const msg of history) {
      if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
        llm_messages.push({ role: msg.role, content: msg.content })
      }
    }
    return llm_messages
  }
}
