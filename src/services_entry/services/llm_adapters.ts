import { AsyncCircuitBreaker } from "../../core_infra/infra/async_circuit_breaker.ts"
import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type {
  IAsyncLlmAdapter,
  LlmAdapterConfig,
  LlmRequest,
  LlmResponse,
  LlmMessage,
  LlmStreamChunk,
  LlmUsage,
} from "../../core_infra/core/i_llm_adapter.ts"

/**
 * LLM 适配器实现集合（V3）。
 *
 * 提供：
 *   - MockLlmAdapter：确定性 mock，用于测试和开发环境
 *   - OpenAiLlmAdapter：通过 fetch 调用 OpenAI 兼容 API
 *
 * 所有适配器使用 AsyncCircuitBreaker 包裹网络调用，防止持续失败时雪崩。
 */

/**
 * MockLlmAdapter - 确定性 mock LLM 适配器。
 *
 * 不发起真实网络请求，根据输入消息生成确定性响应：
 *   - 若有 system 消息，响应前缀 "[Mock]" + 最后一条 user 消息的回显
 *   - token 用量按消息内容长度模拟
 *
 * 适用于测试、开发和 CI 环境。
 */
export class MockLlmAdapter implements IAsyncLlmAdapter {
  private readonly model: string
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(5, 30000)
  private call_count: number = 0

  constructor(model: string = "mock-llm-v1") {
    log_info(`mock_llm_created: model=${model}`)
    this.model = model
  }

  async validate(): Promise<boolean> {
    return true
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    log_info(`mock_llm_chat: messages=${request.messages.length}`)
    const fallback: LlmResponse = {
      content: "",
      model: this.model,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      finish_reason: null,
    }
    return this.breaker.execute(async () => {
      this.call_count += 1
      const last_user: LlmMessage | undefined = [...request.messages]
        .reverse()
        .find((m) => m.role === "user")
      const user_content: string = last_user?.content ?? ""
      const content: string = `[Mock] ${user_content}`
      const prompt_tokens: number = request.messages.reduce(
        (sum, m) => sum + Math.ceil(m.content.length / 4),
        0,
      )
      const completion_tokens: number = Math.ceil(content.length / 4)
      return {
        content,
        model: request.model ?? this.model,
        usage: {
          prompt_tokens,
          completion_tokens,
          total_tokens: prompt_tokens + completion_tokens,
        },
        finish_reason: "stop",
      }
    }, fallback)
  }

  /**
   * 流式对话（V5）。
   *
   * 将完整响应按词拆分为多个 delta 分块，逐块 yield，模拟真实 LLM 流式输出。
   * 最后 yield 一个 done 分块，携带 finish_reason 和 usage 统计。
   */
  async stream_chat(request: LlmRequest): Promise<AsyncGenerator<LlmStreamChunk>> {
    log_info(`mock_llm_stream: messages=${request.messages.length}`)
    this.call_count += 1
    const last_user: LlmMessage | undefined = [...request.messages]
      .reverse()
      .find((m) => m.role === "user")
    const user_content: string = last_user?.content ?? ""
    const content: string = `[Mock] ${user_content}`
    const prompt_tokens: number = request.messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0,
    )
    const completion_tokens: number = Math.ceil(content.length / 4)
    const usage: LlmUsage = {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    }
    return this.mock_stream_generator(content, usage)
  }

  /**
   * Mock 流式生成器：按空格拆分为词块，逐块 yield。
   */
  private async *mock_stream_generator(
    content: string,
    usage: LlmUsage,
  ): AsyncGenerator<LlmStreamChunk> {
    const words: string[] = content.split(" ")
    for (let i = 0; i < words.length; i++) {
      const word: string = i === 0 ? words[i] : " " + words[i]
      yield { type: "delta", content: word }
    }
    yield { type: "done", finish_reason: "stop", usage }
  }

  async to_object(): Promise<Record<string, unknown>> {
    return { model: this.model, call_count: this.call_count, type: "mock" }
  }
}

/**
 * OpenAiLlmAdapter - OpenAI 兼容 API 适配器。
 *
 * 通过 fetch 调用 OpenAI Chat Completions API（或兼容端点如 Azure OpenAI、本地 vLLM）。
 * 使用 AsyncCircuitBreaker 防止网络持续失败时雪崩。
 * 超时通过 AbortController 实现。
 *
 * 配置：
 *   - api_key：API 密钥（必填）
 *   - base_url：API 基础 URL（默认 https://api.openai.com/v1）
 *   - default_model：默认模型（默认 gpt-4o-mini）
 *   - timeout_ms：请求超时（默认 30000ms）
 */
export class OpenAiLlmAdapter implements IAsyncLlmAdapter {
  private readonly config: LlmAdapterConfig
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(3, 60000)
  private call_count: number = 0

  constructor(config: Partial<LlmAdapterConfig> = {}) {
    this.config = {
      api_key: config.api_key ?? "",
      base_url: config.base_url ?? "https://api.openai.com/v1",
      default_model: config.default_model ?? "gpt-4o-mini",
      default_temperature: config.default_temperature ?? 0.7,
      default_max_tokens: config.default_max_tokens ?? 1024,
      timeout_ms: config.timeout_ms ?? 30000,
    }
    log_info(`openai_llm_created: base_url=${this.config.base_url} model=${this.config.default_model}`)
  }

  async validate(): Promise<boolean> {
    return this.config.api_key.length > 0
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    log_info(`openai_llm_chat: messages=${request.messages.length}`)
    const fallback: LlmResponse = {
      content: "",
      model: this.config.default_model,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      finish_reason: null,
    }
    return this.breaker.execute(async () => {
      if (this.config.api_key.length === 0) {
        log_warn("openai_llm_no_api_key")
        throw new Error("llm_api_key_missing")
      }
      const model: string = request.model ?? this.config.default_model
      const timeout_ms: number = request.timeout_ms ?? this.config.timeout_ms
      const body: Record<string, unknown> = {
        model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: request.temperature ?? this.config.default_temperature,
        max_tokens: request.max_tokens ?? this.config.default_max_tokens,
      }
      const controller: AbortController = new AbortController()
      const timer: ReturnType<typeof setTimeout> = setTimeout(
        () => controller.abort(),
        timeout_ms,
      )
      try {
        const response: Response = await fetch(`${this.config.base_url}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.api_key}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        if (!response.ok) {
          const err_text: string = await response.text().catch(() => "")
          log_warn(`openai_llm_http_error: ${response.status} ${err_text}`)
          throw new Error(`llm_http_${response.status}`)
        }
        const data: unknown = await response.json()
        return this.parse_response(data, model)
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          log_warn(`openai_llm_timeout: ${timeout_ms}ms`)
          throw new Error("llm_timeout")
        }
        log_error(`openai_llm_request_failed: ${e}`)
        throw e
      } finally {
        clearTimeout(timer)
      }
    }, fallback)
  }

  /**
   * 流式对话（V5）。
   *
   * 通过 OpenAI stream: true 参数获取 SSE 流，解析 data: 行逐块 yield。
   * 使用 stream_options.include_usage 在流末尾获取 token 用量。
   * 超时通过 AbortController 控制。
   */
  async stream_chat(request: LlmRequest): Promise<AsyncGenerator<LlmStreamChunk>> {
    log_info(`openai_llm_stream: messages=${request.messages.length}`)
    if (this.config.api_key.length === 0) {
      log_warn("openai_llm_stream_no_api_key")
      throw new Error("llm_api_key_missing")
    }
    const model: string = request.model ?? this.config.default_model
    const timeout_ms: number = request.timeout_ms ?? this.config.timeout_ms
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? this.config.default_temperature,
      max_tokens: request.max_tokens ?? this.config.default_max_tokens,
      stream: true,
      stream_options: { include_usage: true },
    }
    const controller: AbortController = new AbortController()
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      timeout_ms,
    )
    let response: Response
    try {
      response = await fetch(`${this.config.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.api_key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("llm_timeout")
      }
      throw e
    }
    if (!response.ok) {
      clearTimeout(timer)
      const err_text: string = await response.text().catch(() => "")
      log_warn(`openai_llm_stream_http_error: ${response.status} ${err_text}`)
      throw new Error(`llm_http_${response.status}`)
    }
    if (!response.body) {
      clearTimeout(timer)
      throw new Error("llm_stream_no_body")
    }
    this.call_count += 1
    return this.openai_stream_generator(response.body, controller, timer)
  }

  /**
   * OpenAI SSE 流解析生成器。
   *
   * 逐行读取 response.body，解析 `data: <json>` 行：
   *   - choices[0].delta.content → yield delta 分块
   *   - choices[0].finish_reason → 记录结束原因
   *   - usage → 记录 token 用量
   *   - [DONE] → 流结束
   * 最后 yield 一个 done 分块。
   */
  private async *openai_stream_generator(
    body: ReadableStream<Uint8Array>,
    controller: AbortController,
    timer: ReturnType<typeof setTimeout>,
  ): AsyncGenerator<LlmStreamChunk> {
    const reader: ReadableStreamDefaultReader<Uint8Array> = body.getReader()
    const decoder: TextDecoder = new TextDecoder()
    let buffer: string = ""
    let finish_reason: "stop" | "length" | "tool_calls" | null = null
    let usage: LlmUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    try {
      while (true) {
        const { done, value }: { done: boolean; value: Uint8Array | undefined } =
          await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines: string[] = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          const trimmed: string = line.trim()
          if (trimmed.length === 0 || trimmed.startsWith(":")) {
            continue
          }
          if (!trimmed.startsWith("data:")) {
            continue
          }
          const data_str: string = trimmed.slice(5).trim()
          if (data_str === "[DONE]") {
            continue
          }
          try {
            const parsed = JSON.parse(data_str) as {
              choices?: Array<{
                delta?: { content?: string }
                finish_reason?: string
              }>
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
            }
            const delta_content: string | undefined = parsed.choices?.[0]?.delta?.content
            if (delta_content && delta_content.length > 0) {
              yield { type: "delta", content: delta_content }
            }
            const fr: string | undefined = parsed.choices?.[0]?.finish_reason
            if (fr === "stop" || fr === "length" || fr === "tool_calls") {
              finish_reason = fr
            }
            if (parsed.usage) {
              usage = {
                prompt_tokens: parsed.usage.prompt_tokens ?? 0,
                completion_tokens: parsed.usage.completion_tokens ?? 0,
                total_tokens: parsed.usage.total_tokens ?? 0,
              }
            }
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    } finally {
      clearTimeout(timer)
      controller.abort()
      reader.releaseLock()
    }
    yield { type: "done", finish_reason, usage }
  }

  async to_object(): Promise<Record<string, unknown>> {
    return {
      type: "openai",
      base_url: this.config.base_url,
      model: this.config.default_model,
      call_count: this.call_count,
      has_api_key: this.config.api_key.length > 0,
    }
  }

  private parse_response(data: unknown, default_model: string): LlmResponse {
    this.call_count += 1
    const obj = data as {
      choices?: Array<{
        message?: { content?: string }
        finish_reason?: string
      }>
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const choice = obj.choices?.[0]
    if (!choice || !choice.message) {
      log_warn("openai_llm_invalid_response: no choices")
      throw new Error("llm_invalid_response")
    }
    const content: string = choice.message.content ?? ""
    const finish_raw: string = choice.finish_reason ?? "stop"
    const finish_reason: "stop" | "length" | "tool_calls" | null =
      finish_raw === "stop" || finish_raw === "length" || finish_raw === "tool_calls"
        ? finish_raw
        : null
    const usage = obj.usage ?? {}
    return {
      content,
      model: obj.model ?? default_model,
      usage: {
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
      },
      finish_reason,
    }
  }
}

/**
 * 从环境变量创建 OpenAiLlmAdapter。
 *
 * 读取：
 *   - OPENAI_API_KEY：API 密钥（必填，缺失则 api_key 为空，validate 返回 false）
 *   - OPENAI_BASE_URL：基础 URL（可选）
 *   - OPENAI_MODEL：默认模型（可选）
 *   - LLM_TIMEOUT_MS：超时毫秒（可选）
 */
export function create_openai_adapter_from_env(): OpenAiLlmAdapter {
  const api_key: string = process.env.OPENAI_API_KEY ?? ""
  const base_url: string | undefined = process.env.OPENAI_BASE_URL
  const default_model: string | undefined = process.env.OPENAI_MODEL
  const timeout_str: string | undefined = process.env.LLM_TIMEOUT_MS
  const timeout_ms: number | undefined = timeout_str ? Number(timeout_str) : undefined
  log_info(`openai_llm_from_env: has_key=${api_key.length > 0}`)
  return new OpenAiLlmAdapter({
    api_key,
    base_url,
    default_model,
    timeout_ms: timeout_ms && Number.isFinite(timeout_ms) ? timeout_ms : undefined,
  })
}
