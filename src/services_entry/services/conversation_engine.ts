import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { AsyncCircuitBreaker } from "../../core_infra/infra/async_circuit_breaker.ts"
import { log_info, log_warn } from "../../core_infra/infra/global_logger.ts"
import type { Message } from "../../core_infra/core/message_types.ts"
import type {
  IAsyncLlmAdapter,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmStreamChunk,
} from "../../core_infra/core/i_llm_adapter.ts"
import type { IAsyncMessageService } from "../../core_infra/core/i_async_services.ts"

/**
 * ConversationEngine - 对话引擎（V3）。
 *
 * 将 IAsyncMessageService（消息历史）与 IAsyncLlmAdapter（LLM 推理）组合，
 * 提供完整的多轮对话能力：
 *   1. 接收用户消息
 *   2. 追加到消息历史
 *   3. 将历史转换为 LlmMessage[]（含可选 system prompt）
 *   4. 调用 LLM 适配器获取回复
 *   5. 将回复追加到消息历史
 *   6. 返回 LlmResponse
 *
 * 使用 AsyncLock 保护对话流程，避免并发 chat 请求导致消息顺序错乱。
 * 使用 AsyncCircuitBreaker 包裹 LLM 调用，防止持续失败时雪崩。
 */
export class ConversationEngine {
  private readonly messages: IAsyncMessageService
  private readonly llm: IAsyncLlmAdapter
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(3, 30000)
  private readonly system_prompt: string | null
  private readonly max_history: number

  constructor(
    messages: IAsyncMessageService,
    llm: IAsyncLlmAdapter,
    options: {
      system_prompt?: string
      max_history?: number
    } = {},
  ) {
    this.messages = messages
    this.llm = llm
    this.system_prompt = options.system_prompt ?? null
    this.max_history = options.max_history ?? 50
    log_info(
      `conversation_engine_created: system_prompt=${this.system_prompt !== null} max_history=${this.max_history}`,
    )
  }

  /**
   * 发送用户消息并获取 LLM 回复。
   *
   * 流程：加锁 → 追加用户消息 → 构建上下文 → 调用 LLM → 追加回复 → 返回。
   * 熔断打开时返回 fallback 响应（空内容）。
   */
  async chat(user_message: string): Promise<LlmResponse> {
    log_info(`conversation_chat: msg_len=${user_message.length}`)
    const fallback: LlmResponse = {
      content: "",
      model: "unknown",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      finish_reason: null,
    }
    return this.breaker.execute(async () => {
      const acquired: boolean = await this.lock.acquire(10000)
      if (!acquired) {
        log_warn("conversation_chat_lock_failed")
        throw new Error("conversation_lock_failed")
      }
      try {
        // 1. 追加用户消息
        await this.messages.add(user_message, "user")
        // 2. 构建上下文
        const history: Message[] = await this.messages.get_all()
        const llm_messages: LlmMessage[] = this.build_context(history)
        // 3. 调用 LLM
        const request: LlmRequest = { messages: llm_messages }
        const response: LlmResponse = await this.llm.chat(request)
        // 4. 追加助手回复
        if (response.content.length > 0) {
          await this.messages.add(response.content, "assistant")
        }
        return response
      } finally {
        this.lock.release()
      }
    }, fallback)
  }

  /**
   * 流式对话（V5）。
   *
   * 与 chat() 相同的流程，但使用 LLM 适配器的 stream_chat 方法，
   * 逐块 yield LlmStreamChunk，适用于 SSE 实时推送场景。
   *
   * 流程：加锁 → 追加用户消息 → 构建上下文 → 流式调用 LLM →
   *       逐块 yield delta → 流结束后追加完整回复 → 释放锁。
   *
   * 注意：锁在整个流式过程中保持，直到生成器结束（正常完成或被关闭）。
   * 不使用熔断器（流式操作无法回退，失败由调用方处理）。
   */
  async *stream_chat(user_message: string): AsyncGenerator<LlmStreamChunk> {
    log_info(`conversation_stream: msg_len=${user_message.length}`)
    const acquired: boolean = await this.lock.acquire(10000)
    if (!acquired) {
      log_warn("conversation_stream_lock_failed")
      throw new Error("conversation_lock_failed")
    }
    try {
      // 1. 追加用户消息
      await this.messages.add(user_message, "user")
      // 2. 构建上下文
      const history: Message[] = await this.messages.get_all()
      const llm_messages: LlmMessage[] = this.build_context(history)
      // 3. 流式调用 LLM
      const request: LlmRequest = { messages: llm_messages }
      const stream: AsyncGenerator<LlmStreamChunk> = await this.llm.stream_chat(request)
      let full_content: string = ""
      // 4. 逐块 yield，累积完整内容
      for await (const chunk of stream) {
        if (chunk.type === "delta") {
          full_content += chunk.content
        }
        yield chunk
      }
      // 5. 追加完整助手回复
      if (full_content.length > 0) {
        await this.messages.add(full_content, "assistant")
      }
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取当前对话历史。
   */
  async get_messages(): Promise<Message[]> {
    return this.messages.get_all()
  }

  /**
   * 清空对话历史。
   */
  async clear(): Promise<void> {
    await this.messages.clear()
  }

  /**
   * 获取引擎状态摘要。
   */
  async to_object(): Promise<Record<string, unknown>> {
    const llm_obj: Record<string, unknown> = await this.llm.to_object()
    return {
      system_prompt: this.system_prompt !== null,
      max_history: this.max_history,
      llm: llm_obj,
    }
  }

  /**
   * 将消息历史转换为 LlmMessage[]，包含 system prompt 和历史窗口裁剪。
   */
  private build_context(history: Message[]): LlmMessage[] {
    const llm_messages: LlmMessage[] = []
    if (this.system_prompt) {
      llm_messages.push({ role: "system", content: this.system_prompt })
    }
    // 裁剪历史：保留最近 max_history 条
    const start: number = Math.max(0, history.length - this.max_history)
    for (let i = start; i < history.length; i++) {
      const msg: Message = history[i]
      llm_messages.push({ role: msg.role, content: msg.content })
    }
    return llm_messages
  }
}
