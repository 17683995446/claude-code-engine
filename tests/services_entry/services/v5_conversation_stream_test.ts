import { describe, it, expect, beforeEach } from "bun:test"
import { MockLlmAdapter } from "../../../src/services_entry/services/llm_adapters.ts"
import { ConversationEngine } from "../../../src/services_entry/services/conversation_engine.ts"
import { SessionManager } from "../../../src/services_entry/services/session_manager.ts"
import { AsyncMessageService } from "../../../src/services_entry/services/async_services.ts"
import type { LlmStreamChunk } from "../../../src/core_infra/core/i_llm_adapter.ts"

// ============================================================
// V5: ConversationEngine + SessionManager 流式接口测试
// ============================================================

describe("V5 ConversationEngine.stream_chat", () => {
  let engine: ConversationEngine
  let messages: AsyncMessageService
  let llm: MockLlmAdapter

  beforeEach(() => {
    llm = new MockLlmAdapter("mock-engine-stream")
    messages = new AsyncMessageService()
    engine = new ConversationEngine(messages, llm, {
      system_prompt: "test assistant",
      max_history: 20,
    })
  })

  it("should yield delta chunks and done chunk", async () => {
    const stream = engine.stream_chat("hello world")
    const chunks: LlmStreamChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[chunks.length - 1].type).toBe("done")
  })

  it("should reconstruct full response from deltas", async () => {
    const stream = engine.stream_chat("test message")
    let full_content: string = ""
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full_content += chunk.content
      }
    }
    expect(full_content).toBe("[Mock] test message")
  })

  it("should add user and assistant messages to history after stream", async () => {
    const stream = engine.stream_chat("stream test")
    for await (const _ of stream) {
      // 消费流
    }
    const history = await engine.get_messages()
    expect(history.length).toBe(2)
    expect(history[0].role).toBe("user")
    expect(history[0].content).toBe("stream test")
    expect(history[1].role).toBe("assistant")
    expect(history[1].content).toBe("[Mock] stream test")
  })

  it("should support multi-turn streaming", async () => {
    // 第一轮
    let stream = engine.stream_chat("first")
    for await (const _ of stream) {
    }
    // 第二轮
    stream = engine.stream_chat("second")
    let full: string = ""
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full += chunk.content
      }
    }
    expect(full).toBe("[Mock] second")
    const history = await engine.get_messages()
    expect(history.length).toBe(4)
  })

  it("should include usage in done chunk", async () => {
    const stream = engine.stream_chat("usage test")
    let done_chunk: LlmStreamChunk | null = null
    for await (const chunk of stream) {
      if (chunk.type === "done") {
        done_chunk = chunk
      }
    }
    expect(done_chunk).not.toBeNull()
    if (done_chunk && done_chunk.type === "done") {
      expect(done_chunk.usage.prompt_tokens).toBeGreaterThan(0)
      expect(done_chunk.usage.completion_tokens).toBeGreaterThan(0)
      expect(done_chunk.finish_reason).toBe("stop")
    }
  })

  it("should handle empty message", async () => {
    const stream = engine.stream_chat("")
    let full_content: string = ""
    let has_done: boolean = false
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full_content += chunk.content
      }
      if (chunk.type === "done") {
        has_done = true
      }
    }
    expect(full_content).toBe("[Mock] ")
    expect(has_done).toBe(true)
  })

  it("should produce same content as non-stream chat", async () => {
    // 非流式
    const response = await engine.chat("consistency")
    // 清除历史后流式
    await engine.clear()
    const stream = engine.stream_chat("consistency")
    let stream_content: string = ""
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        stream_content += chunk.content
      }
    }
    expect(stream_content).toBe(response.content)
  })
})

describe("V5 SessionManager.stream_chat", () => {
  let manager: SessionManager
  let llm: MockLlmAdapter

  beforeEach(() => {
    llm = new MockLlmAdapter("mock-session-stream")
    manager = new SessionManager(llm, { default_max_history: 20 })
  })

  it("should stream chat in a session", async () => {
    const session = await manager.create_session({ title: "stream-test" })
    const stream = manager.stream_chat(session.id, "hello session")
    let full_content: string = ""
    let has_done: boolean = false
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full_content += chunk.content
      }
      if (chunk.type === "done") {
        has_done = true
      }
    }
    expect(full_content).toBe("[Mock] hello session")
    expect(has_done).toBe(true)
  })

  it("should persist messages after stream completes", async () => {
    const session = await manager.create_session({ title: "persist-test" })
    const stream = manager.stream_chat(session.id, "persist this")
    for await (const _ of stream) {
    }
    const history = await manager.get_history(session.id)
    expect(history.length).toBe(2)
    expect(history[0].content).toBe("persist this")
    expect(history[1].content).toBe("[Mock] persist this")
  })

  it("should throw for non-existent session", async () => {
    const stream = manager.stream_chat("nonexistent", "test")
    try {
      for await (const _ of stream) {
        // 不应到达
      }
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("session_not_found")
    }
  })

  it("should support multi-turn streaming in session", async () => {
    const session = await manager.create_session({ title: "multi-turn" })
    // 第一轮
    let stream = manager.stream_chat(session.id, "turn 1")
    for await (const _ of stream) {
    }
    // 第二轮
    stream = manager.stream_chat(session.id, "turn 2")
    let full: string = ""
    for await (const chunk of stream) {
      if (chunk.type === "delta") {
        full += chunk.content
      }
    }
    expect(full).toBe("[Mock] turn 2")
    const history = await manager.get_history(session.id)
    expect(history.length).toBe(4)
  })

  it("should update session metadata after stream", async () => {
    const session = await manager.create_session({ title: "meta-test" })
    const original_updated = session.updated_at
    await new Promise((r) => setTimeout(r, 10))
    const stream = manager.stream_chat(session.id, "update meta")
    for await (const _ of stream) {
    }
    const updated = await manager.get_session(session.id)
    expect(updated).not.toBeNull()
    if (updated) {
      expect(updated.updated_at).toBeGreaterThan(original_updated)
    }
  })
})
