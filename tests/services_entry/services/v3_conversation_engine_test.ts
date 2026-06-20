import { describe, it, expect, beforeEach } from "bun:test"
import { ConversationEngine } from "../../../src/services_entry/services/conversation_engine.ts"
import { MockLlmAdapter } from "../../../src/services_entry/services/llm_adapters.ts"
import { AsyncMessageService } from "../../../src/services_entry/services/async_services.ts"
import type { LlmRequest, LlmResponse } from "../../../src/core_infra/core/i_llm_adapter.ts"

// ============================================================
// V3: 对话引擎测试
// ============================================================

describe("V3 ConversationEngine", () => {
  let messages: AsyncMessageService
  let llm: MockLlmAdapter
  let engine: ConversationEngine

  beforeEach(() => {
    messages = new AsyncMessageService()
    llm = new MockLlmAdapter("mock-test")
    engine = new ConversationEngine(messages, llm, {
      system_prompt: "You are a test assistant.",
      max_history: 10,
    })
  })

  it("should respond to user message", async () => {
    const response: LlmResponse = await engine.chat("hello")
    expect(response.content).toBe("[Mock] hello")
    expect(response.finish_reason).toBe("stop")
  })

  it("should add both user and assistant messages to history", async () => {
    await engine.chat("first message")
    const history = await engine.get_messages()
    expect(history.length).toBe(2)
    expect(history[0].role).toBe("user")
    expect(history[0].content).toBe("first message")
    expect(history[1].role).toBe("assistant")
    expect(history[1].content).toBe("[Mock] first message")
  })

  it("should maintain conversation context across turns", async () => {
    await engine.chat("turn 1")
    await engine.chat("turn 2")
    const history = await engine.get_messages()
    expect(history.length).toBe(4)
    expect(history[0].role).toBe("user")
    expect(history[0].content).toBe("turn 1")
    expect(history[1].role).toBe("assistant")
    expect(history[2].role).toBe("user")
    expect(history[2].content).toBe("turn 2")
    expect(history[3].role).toBe("assistant")
    expect(history[3].content).toBe("[Mock] turn 2")
  })

  it("should clear conversation history", async () => {
    await engine.chat("msg1")
    await engine.chat("msg2")
    expect((await engine.get_messages()).length).toBe(4)
    await engine.clear()
    expect((await engine.get_messages()).length).toBe(0)
  })

  it("should include system prompt in LLM context", async () => {
    // MockLlmAdapter 返回 [Mock] + 最后一条 user 消息
    // 我们通过检查消息历史来验证 system prompt 被包含在 LLM 请求中
    let captured_request: LlmRequest | null = null
    const custom_llm = new MockLlmAdapter("mock-custom")
    const original_chat = custom_llm.chat.bind(custom_llm)
    custom_llm.chat = async (req: LlmRequest): Promise<LlmResponse> => {
      captured_request = req
      return original_chat(req)
    }
    const custom_engine = new ConversationEngine(messages, custom_llm, {
      system_prompt: "custom system prompt",
    })
    await custom_engine.chat("test")

    expect(captured_request).not.toBeNull()
    const req = captured_request as LlmRequest
    expect(req.messages[0].role).toBe("system")
    expect(req.messages[0].content).toBe("custom system prompt")
  })

  it("should work without system prompt", async () => {
    let captured_request: LlmRequest | null = null
    const custom_llm = new MockLlmAdapter("mock-custom")
    const original_chat = custom_llm.chat.bind(custom_llm)
    custom_llm.chat = async (req: LlmRequest): Promise<LlmResponse> => {
      captured_request = req
      return original_chat(req)
    }
    const custom_engine = new ConversationEngine(messages, custom_llm)
    await custom_engine.chat("no system")

    const req = captured_request as LlmRequest
    // 无 system prompt 时，第一条消息应为 user
    expect(req.messages[0].role).toBe("user")
  })

  it("should respect max_history limit", async () => {
    let captured_request: LlmRequest | null = null
    const custom_llm = new MockLlmAdapter("mock-custom")
    const original_chat = custom_llm.chat.bind(custom_llm)
    custom_llm.chat = async (req: LlmRequest): Promise<LlmResponse> => {
      captured_request = req
      return original_chat(req)
    }
    const custom_engine = new ConversationEngine(messages, custom_llm, {
      system_prompt: "sys",
      max_history: 3,
    })
    // 发送 5 条消息，每条产生 user+assistant = 10 条历史
    for (let i = 0; i < 5; i++) {
      await custom_engine.chat(`msg${i}`)
    }
    // 最后一次请求应只包含 system + 最近 3 条历史
    const req = captured_request as LlmRequest
    // system(1) + 最多3条历史消息
    expect(req.messages.length).toBeLessThanOrEqual(4)
    expect(req.messages[0].role).toBe("system")
  })

  it("should return engine state in to_object", async () => {
    await engine.chat("test")
    const obj = await engine.to_object()
    expect(obj.system_prompt).toBe(true)
    expect(obj.max_history).toBe(10)
    expect(obj.llm).toBeDefined()
  })

  it("should handle empty user message", async () => {
    const response: LlmResponse = await engine.chat("")
    // MockLlmAdapter 对空输入返回 "[Mock] "（前缀非空）
    expect(response.content).toBe("[Mock] ")
    // 由于回复内容非空（含前缀），助手消息也会被添加到历史
    const history = await engine.get_messages()
    expect(history.length).toBe(2) // user + assistant
    expect(history[0].role).toBe("user")
    expect(history[0].content).toBe("")
    expect(history[1].role).toBe("assistant")
    expect(history[1].content).toBe("[Mock] ")
  })

  it("should handle concurrent chat requests sequentially", async () => {
    const promises = [
      engine.chat("concurrent1"),
      engine.chat("concurrent2"),
      engine.chat("concurrent3"),
    ]
    const responses = await Promise.all(promises)
    expect(responses.length).toBe(3)
    // 每个回复都应成功
    for (const r of responses) {
      expect(r.content).toContain("[Mock] concurrent")
    }
    // 历史应包含 6 条消息（3 user + 3 assistant）
    const history = await engine.get_messages()
    expect(history.length).toBe(6)
  })
})
