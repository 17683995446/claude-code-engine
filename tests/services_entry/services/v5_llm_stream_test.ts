import { describe, it, expect, beforeEach } from "bun:test"
import {
  MockLlmAdapter,
  OpenAiLlmAdapter,
} from "../../../src/services_entry/services/llm_adapters.ts"
import type { LlmRequest, LlmStreamChunk } from "../../../src/core_infra/core/i_llm_adapter.ts"

// ============================================================
// V5: LLM 适配器流式接口测试
// ============================================================

describe("V5 MockLlmAdapter.stream_chat", () => {
  let adapter: MockLlmAdapter

  beforeEach(() => {
    adapter = new MockLlmAdapter("mock-stream-v1")
  })

  it("should return an async generator", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "hello world" }],
    }
    const stream = await adapter.stream_chat(request)
    expect(stream).toBeDefined()
    expect(typeof stream[Symbol.asyncIterator]).toBe("function")
  })

  it("should yield delta chunks followed by done chunk", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "hello world" }],
    }
    const stream = await adapter.stream_chat(request)
    const chunks: LlmStreamChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    // 最后一个必须是 done
    const last = chunks[chunks.length - 1]
    expect(last.type).toBe("done")
    // 前面的都是 delta
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].type).toBe("delta")
    }
  })

  it("should reconstruct full content from delta chunks", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "hello world" }],
    }
    const stream = await adapter.stream_chat(request)
    let full_content: string = ""
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full_content += chunk.content
      }
    }
    expect(full_content).toBe("[Mock] hello world")
  })

  it("should include usage stats in done chunk", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "abcdefgh" }],
    }
    const stream = await adapter.stream_chat(request)
    let done_chunk: LlmStreamChunk | null = null
    for await (const chunk of stream) {
      if (chunk.type === "done") {
        done_chunk = chunk
      }
    }
    expect(done_chunk).not.toBeNull()
    if (done_chunk && done_chunk.type === "done") {
      expect(done_chunk.usage.prompt_tokens).toBe(2) // ceil(8/4)
      expect(done_chunk.usage.completion_tokens).toBeGreaterThan(0)
      expect(done_chunk.usage.total_tokens).toBe(
        done_chunk.usage.prompt_tokens + done_chunk.usage.completion_tokens,
      )
      expect(done_chunk.finish_reason).toBe("stop")
    }
  })

  it("should handle empty messages array", async () => {
    const request: LlmRequest = { messages: [] }
    const stream = await adapter.stream_chat(request)
    const chunks: LlmStreamChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    // [Mock] 空字符串 → split(" ") 返回 [""], yield 1 个 delta + 1 个 done
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[chunks.length - 1].type).toBe("done")
  })

  it("should split content by words", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "one two three four" }],
    }
    const stream = await adapter.stream_chat(request)
    const deltas: string[] = []
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        deltas.push(chunk.content)
      }
    }
    // [Mock] one two three four → split(" ") = ["[Mock]", "one", "two", "three", "four"] → 5 deltas
    expect(deltas.length).toBe(5)
    expect(deltas[0]).toBe("[Mock]")
    expect(deltas[1]).toBe(" one")
    expect(deltas[2]).toBe(" two")
  })

  it("should handle single word content", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "word" }],
    }
    const stream = await adapter.stream_chat(request)
    let full_content: string = ""
    let chunk_count: number = 0
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full_content += chunk.content
        chunk_count += 1
      }
    }
    expect(full_content).toBe("[Mock] word")
    // [Mock] word → split(" ") = ["[Mock]", "word"] → 2 deltas
    expect(chunk_count).toBe(2)
  })

  it("should increment call_count", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "test" }],
    }
    const obj1 = await adapter.to_object()
    expect((obj1 as { call_count: number }).call_count).toBe(0)

    const stream = await adapter.stream_chat(request)
    for await (const _ of stream) {
      // 消费流
    }

    const obj2 = await adapter.to_object()
    expect((obj2 as { call_count: number }).call_count).toBe(1)
  })

  it("should produce same content as non-stream chat", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "consistency check" }],
    }
    // 非流式
    const response = await adapter.chat(request)
    // 流式
    const stream = await adapter.stream_chat(request)
    let stream_content: string = ""
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        stream_content += chunk.content
      }
    }
    expect(stream_content).toBe(response.content)
  })
})

describe("V5 OpenAiLlmAdapter.stream_chat", () => {
  it("should throw on missing api key", async () => {
    const adapter = new OpenAiLlmAdapter({ api_key: "" })
    const request: LlmRequest = {
      messages: [{ role: "user", content: "test" }],
    }
    expect(async () => {
      const stream = await adapter.stream_chat(request)
      for await (const _ of stream) {
        // 不应到达此处
      }
    }).toThrow()
  })

  it("should throw llm_api_key_missing error", async () => {
    const adapter = new OpenAiLlmAdapter({ api_key: "" })
    const request: LlmRequest = {
      messages: [{ role: "user", content: "test" }],
    }
    try {
      await adapter.stream_chat(request)
      expect(false).toBe(true) // 不应到达
    } catch (e) {
      expect(String(e)).toContain("llm_api_key_missing")
    }
  })

  it("should throw on network error with invalid base_url", async () => {
    const adapter = new OpenAiLlmAdapter({
      api_key: "test-key",
      base_url: "http://127.0.0.1:1", // 无效端口
      timeout_ms: 500,
    })
    const request: LlmRequest = {
      messages: [{ role: "user", content: "test" }],
    }
    try {
      const stream = await adapter.stream_chat(request)
      for await (const _ of stream) {
        // 不应到达
      }
      expect(false).toBe(true)
    } catch (e) {
      // 网络错误或超时
      expect(e).toBeDefined()
    }
  })
})
