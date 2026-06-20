/**
 * LLM 适配器接口与类型定义（V3）。
 *
 * 定义与具体 LLM 提供商（OpenAI、Anthropic、本地模型等）解耦的抽象接口。
 * 所有适配器实现此接口，对话引擎通过此接口调用 LLM，便于切换提供商。
 */

/**
 * LLM 消息（对话历史中的一条消息）。
 */
export type LlmMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

/**
 * LLM 请求。
 */
export type LlmRequest = {
  messages: LlmMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  timeout_ms?: number
}

/**
 * LLM token 用量统计。
 */
export type LlmUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/**
 * LLM 响应。
 */
export type LlmResponse = {
  content: string
  model: string
  usage: LlmUsage
  finish_reason: "stop" | "length" | "tool_calls" | null
}

/**
 * LLM 适配器配置。
 */
export type LlmAdapterConfig = {
  api_key: string
  base_url: string
  default_model: string
  default_temperature: number
  default_max_tokens: number
  timeout_ms: number
}

/**
 * LLM 流式分块（V5）。
 *
 * 流式响应中每个分块的类型：
 *   - delta：增量内容片段
 *   - done：流结束，携带 finish_reason 和 usage 统计
 */
export type LlmStreamChunk =
  | { type: "delta"; content: string }
  | {
      type: "done"
      finish_reason: "stop" | "length" | "tool_calls" | null
      usage: LlmUsage
    }

/**
 * IAsyncLlmAdapter - 异步 LLM 适配器接口。
 *
 * 所有 LLM 适配器实现此接口。方法返回 Promise<T>，遵循异步服务模式。
 * V5：新增 stream_chat 方法，支持流式响应（Server-Sent Events 场景）。
 */
export interface IAsyncLlmAdapter {
  validate(): Promise<boolean>
  chat(request: LlmRequest): Promise<LlmResponse>
  /**
   * 流式对话（V5）。
   *
   * 返回一个异步生成器，逐块产出 LlmStreamChunk：
   *   - 多个 { type: "delta", content } 增量片段
   *   - 最终一个 { type: "done", finish_reason, usage } 结束标记
   *
   * 调用方通过 for-await-of 消费分块，适用于 SSE 实时推送场景。
   */
  stream_chat(request: LlmRequest): Promise<AsyncGenerator<LlmStreamChunk>>
  to_object(): Promise<Record<string, unknown>>
}
