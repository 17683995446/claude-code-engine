import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../src/core_infra/infra/http_client.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_api_routes, setup_gateway_route, setup_chat_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { AsyncAuthService, AsyncMessageService, AsyncShellService, AsyncApiGateway } from "../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../src/services_entry/services/llm_adapters.ts"
import { ConversationEngine } from "../../src/services_entry/services/conversation_engine.ts"

// ============================================================
// V3: /api/chat 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v3-test-key-12345"

function make_server(): { server: HttpServer; engine: ConversationEngine } {
  const auth = new AsyncAuthService()
  const messages = new AsyncMessageService()
  const shell = new AsyncShellService("/tmp")
  const gateway = new AsyncApiGateway(auth, messages, shell)
  const llm = new MockLlmAdapter("mock-integration")
  const engine = new ConversationEngine(messages, llm, {
    system_prompt: "test assistant",
    max_history: 20,
  })

  const config: AuthMiddlewareConfig = {
    ...DEFAULT_AUTH_CONFIG,
    api_keys: new Set([TEST_API_KEY]),
    rate_limit_max: 100,
    rate_limit_refill_ms: 1000,
  }

  const server = new HttpServer({ port: 0 })
  server.use(error_handler_middleware())
  server.use(logging_middleware())
  server.use(rate_limit_middleware(config))
  server.use(auth_middleware(config))

  const api_routes = setup_api_routes(auth, messages, shell)
  const gateway_routes = setup_gateway_route(gateway)
  const chat_routes = setup_chat_routes(engine)
  register_routes(server, [...api_routes, ...gateway_routes, ...chat_routes])

  server.start()
  return { server, engine }
}

describe("V3 /api/chat integration", () => {
  let server: HttpServer
  let client: HttpClient
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(() => {
    const result = make_server()
    server = result.server
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject chat without auth (401)", async () => {
    const res = await client.post("/api/chat", { message: "hello" }) as { status: number }
    expect(res.status).toBe(401)
  })

  it("should reject chat with empty message (400)", async () => {
    const res = await client.post("/api/chat", { message: "" }, headers) as { status: number; body: { error: string } }
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("invalid_argument")
  })

  it("should reject chat with missing message field (400)", async () => {
    const res = await client.post("/api/chat", {}, headers) as { status: number; body: { error: string } }
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("invalid_argument")
  })

  it("should return LLM response for valid chat", async () => {
    const res = await client.post("/api/chat", { message: "hello world" }, headers) as { status: number; body: { content: string; model: string; finish_reason: string } }
    expect(res.status).toBe(200)
    expect(res.body.content).toBe("[Mock] hello world")
    expect(res.body.model).toBe("mock-integration")
    expect(res.body.finish_reason).toBe("stop")
  })

  it("should include usage stats in response", async () => {
    const res = await client.post("/api/chat", { message: "test" }, headers) as { status: number; body: { usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } }
    expect(res.status).toBe(200)
    expect(res.body.usage.prompt_tokens).toBeGreaterThan(0)
    expect(res.body.usage.completion_tokens).toBeGreaterThan(0)
    expect(res.body.usage.total_tokens).toBe(
      res.body.usage.prompt_tokens + res.body.usage.completion_tokens,
    )
  })

  it("should persist conversation history across requests", async () => {
    // 第一轮
    await client.post("/api/chat", { message: "first" }, headers)
    // 查询历史
    const history1 = await client.get("/api/chat/history", headers) as { status: number; body: { count: number; messages: Array<{ role: string; content: string }> } }
    expect(history1.status).toBe(200)
    expect(history1.body.count).toBe(2) // user + assistant
    expect(history1.body.messages[0].role).toBe("user")
    expect(history1.body.messages[0].content).toBe("first")
    expect(history1.body.messages[1].role).toBe("assistant")

    // 第二轮
    await client.post("/api/chat", { message: "second" }, headers)
    const history2 = await client.get("/api/chat/history", headers) as { status: number; body: { count: number } }
    expect(history2.body.count).toBe(4)
  })

  it("should clear history via DELETE", async () => {
    await client.post("/api/chat", { message: "msg1" }, headers)
    await client.post("/api/chat", { message: "msg2" }, headers)
    expect((await client.get("/api/chat/history", headers) as { body: { count: number } }).body.count).toBe(4)

    const res = await client.delete("/api/chat/history", headers) as { status: number; body: { cleared: boolean } }
    expect(res.status).toBe(200)
    expect(res.body.cleared).toBe(true)

    const history = await client.get("/api/chat/history", headers) as { body: { count: number } }
    expect(history.body.count).toBe(0)
  })

  it("should handle multi-turn conversation correctly", async () => {
    const r1 = await client.post("/api/chat", { message: "what is 1+1" }, headers) as { body: { content: string } }
    expect(r1.body.content).toBe("[Mock] what is 1+1")

    const r2 = await client.post("/api/chat", { message: "and 2+2" }, headers) as { body: { content: string } }
    expect(r2.body.content).toBe("[Mock] and 2+2")

    const history = await client.get("/api/chat/history", headers) as { body: { messages: Array<{ role: string; content: string }> } }
    // 2 turns × 2 messages = 4
    expect(history.body.messages.length).toBe(4)
    expect(history.body.messages[0].content).toBe("what is 1+1")
    expect(history.body.messages[1].content).toBe("[Mock] what is 1+1")
    expect(history.body.messages[2].content).toBe("and 2+2")
    expect(history.body.messages[3].content).toBe("[Mock] and 2+2")
  })

  it("should protect chat endpoints with auth", async () => {
    // POST /api/chat
    expect((await client.post("/api/chat", { message: "x" })).status).toBe(401)
    // GET /api/chat/history
    expect((await client.get("/api/chat/history")).status).toBe(401)
    // DELETE /api/chat/history
    expect((await client.delete("/api/chat/history")).status).toBe(401)
  })
})

describe("V3 engine integration with ClaudeCodeEngine", () => {
  it("should resolve conversation engine from engine", async () => {
    process.env.API_KEYS = "engine-test-key"
    try {
      const { ClaudeCodeEngine } = await import("../../src/index.ts")
      const engine = new ClaudeCodeEngine({
        cwd: "/tmp",
        initial_messages: [],
        max_turns: 10,
        verbose: false,
      }) as unknown as {
        start: () => Promise<void>
        get_conversation_engine: () => { chat: (msg: string) => Promise<{ content: string }>; get_messages: () => Promise<Array<{ role: string }>>; clear: () => Promise<void> }
        stop: () => void
      }
      await engine.start()
      const conv = engine.get_conversation_engine()
      // 清除可能从持久化存储加载的旧消息
      await conv.clear()
      // 无 OPENAI_API_KEY 时应回退到 MockLlmAdapter
      const response = await conv.chat("engine test")
      expect(response.content).toBe("[Mock] engine test")
      const history = await conv.get_messages()
      expect(history.length).toBe(2)
      await conv.clear()
      engine.stop()
    } finally {
      delete process.env.API_KEYS
    }
  })

  it("should serve /api/chat from engine HTTP server", async () => {
    process.env.API_KEYS = "engine-http-test-key"
    try {
      const { ClaudeCodeEngine } = await import("../../src/index.ts")
      const engine = new ClaudeCodeEngine({
        cwd: "/tmp",
        initial_messages: [],
        max_turns: 10,
        verbose: false,
      }) as unknown as {
        start: () => Promise<void>
        start_http_server: (port?: number) => { get_port: () => number; stop: () => void }
        stop: () => void
      }
      await engine.start()
      const server = engine.start_http_server(0)
      const port = server.get_port()
      const client = new HttpClient({ base_url: `http://localhost:${port}` })
      const res = await client.post("/api/chat", { message: "via http" }, { authorization: "Bearer engine-http-test-key" }) as { status: number; body: { content: string } }
      expect(res.status).toBe(200)
      expect(res.body.content).toBe("[Mock] via http")
      server.stop()
      engine.stop()
    } finally {
      delete process.env.API_KEYS
    }
  })
})
