import { describe, it, expect, beforeEach } from "bun:test"
import {
  MockLlmAdapter,
  OpenAiLlmAdapter,
  create_openai_adapter_from_env,
} from "../../../src/services_entry/services/llm_adapters.ts"
import type { LlmRequest, LlmResponse } from "../../../src/core_infra/core/i_llm_adapter.ts"

// ============================================================
// V3: LLM 适配器层测试
// ============================================================

describe("V3 MockLlmAdapter", () => {
  let adapter: MockLlmAdapter

  beforeEach(() => {
    adapter = new MockLlmAdapter("mock-test-v1")
  })

  it("should validate successfully", async () => {
    expect(await adapter.validate()).toBe(true)
  })

  it("should return deterministic response for single user message", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "hello world" }],
    }
    const response: LlmResponse = await adapter.chat(request)
    expect(response.content).toBe("[Mock] hello world")
    expect(response.model).toBe("mock-test-v1")
    expect(response.finish_reason).toBe("stop")
  })

  it("should simulate token usage based on content length", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "abcdefgh" }],
    }
    const response: LlmResponse = await adapter.chat(request)
    expect(response.usage.prompt_tokens).toBe(2) // ceil(8/4)
    expect(response.usage.completion_tokens).toBeGreaterThan(0)
    expect(response.usage.total_tokens).toBe(
      response.usage.prompt_tokens + response.usage.completion_tokens,
    )
  })

  it("should handle empty messages array", async () => {
    const request: LlmRequest = { messages: [] }
    const response: LlmResponse = await adapter.chat(request)
    expect(response.content).toBe("[Mock] ")
    expect(response.finish_reason).toBe("stop")
  })

  it("should use request model if provided", async () => {
    const request: LlmRequest = {
      messages: [{ role: "user", content: "test" }],
      model: "custom-model",
    }
    const response: LlmResponse = await adapter.chat(request)
    expect(response.model).toBe("custom-model")
  })

  it("should find last user message in multi-turn conversation", async () => {
    const request: LlmRequest = {
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second question" },
      ],
    }
    const response: LlmResponse = await adapter.chat(request)
    expect(response.content).toBe("[Mock] second question")
  })

  it("should handle system message without using it as user content", async () => {
    const request: LlmRequest = {
      messages: [
        { role: "system", content: "you are helpful" },
        { role: "user", content: "hi" },
      ],
    }
    const response: LlmResponse = await adapter.chat(request)
    expect(response.content).toBe("[Mock] hi")
  })

  it("should track call count in to_object", async () => {
    await adapter.chat({ messages: [{ role: "user", content: "a" }] })
    await adapter.chat({ messages: [{ role: "user", content: "b" }] })
    const obj = await adapter.to_object()
    expect(obj.call_count).toBe(2)
    expect(obj.type).toBe("mock")
    expect(obj.model).toBe("mock-test-v1")
  })
})

describe("V3 OpenAiLlmAdapter", () => {
  it("should validate false when no api key", async () => {
    const adapter = new OpenAiLlmAdapter({ api_key: "" })
    expect(await adapter.validate()).toBe(false)
  })

  it("should validate true when api key provided", async () => {
    const adapter = new OpenAiLlmAdapter({ api_key: "sk-test-key" })
    expect(await adapter.validate()).toBe(true)
  })

  it("should use default config values", async () => {
    const adapter = new OpenAiLlmAdapter({ api_key: "sk-test" })
    const obj = await adapter.to_object()
    expect(obj.type).toBe("openai")
    expect(obj.base_url).toBe("https://api.openai.com/v1")
    expect(obj.model).toBe("gpt-4o-mini")
    expect(obj.has_api_key).toBe(true)
  })

  it("should accept custom config", async () => {
    const adapter = new OpenAiLlmAdapter({
      api_key: "sk-custom",
      base_url: "https://custom.api.com/v1",
      default_model: "gpt-4",
      timeout_ms: 5000,
    })
    const obj = await adapter.to_object()
    expect(obj.base_url).toBe("https://custom.api.com/v1")
    expect(obj.model).toBe("gpt-4")
    expect(obj.has_api_key).toBe(true)
  })

  it("should return fallback when api key missing and chat called", async () => {
    const adapter = new OpenAiLlmAdapter({ api_key: "" })
    const response: LlmResponse = await adapter.chat({
      messages: [{ role: "user", content: "test" }],
    })
    // 熔断器捕获错误后返回 fallback
    expect(response.content).toBe("")
    expect(response.finish_reason).toBe(null)
  })

  it("should return fallback on network error (unreachable URL)", async () => {
    const adapter = new OpenAiLlmAdapter({
      api_key: "sk-test",
      base_url: "http://127.0.0.1:1", // 不可达端口
      timeout_ms: 500,
    })
    const response: LlmResponse = await adapter.chat({
      messages: [{ role: "user", content: "test" }],
      timeout_ms: 500,
    })
    // 网络错误被熔断器捕获，返回 fallback
    expect(response.content).toBe("")
  })
})

describe("V3 create_openai_adapter_from_env", () => {
  it("should create adapter with empty key when env not set", () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_MODEL
    delete process.env.LLM_TIMEOUT_MS
    const adapter = create_openai_adapter_from_env()
    expect(adapter.validate()).resolves.toBe(false)
  })

  it("should load config from environment", async () => {
    process.env.OPENAI_API_KEY = "sk-env-test"
    process.env.OPENAI_BASE_URL = "https://env.api.com/v1"
    process.env.OPENAI_MODEL = "gpt-4-env"
    process.env.LLM_TIMEOUT_MS = "15000"
    try {
      const adapter = create_openai_adapter_from_env()
      expect(await adapter.validate()).toBe(true)
      const obj = await adapter.to_object()
      expect(obj.base_url).toBe("https://env.api.com/v1")
      expect(obj.model).toBe("gpt-4-env")
      expect(obj.has_api_key).toBe(true)
    } finally {
      delete process.env.OPENAI_API_KEY
      delete process.env.OPENAI_BASE_URL
      delete process.env.OPENAI_MODEL
      delete process.env.LLM_TIMEOUT_MS
    }
  })

  it("should handle invalid timeout gracefully", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    process.env.LLM_TIMEOUT_MS = "not-a-number"
    try {
      const adapter = create_openai_adapter_from_env()
      const obj = await adapter.to_object()
      // 无效 timeout 应回退到默认值
      expect(obj.type).toBe("openai")
    } finally {
      delete process.env.OPENAI_API_KEY
      delete process.env.LLM_TIMEOUT_MS
    }
  })
})
