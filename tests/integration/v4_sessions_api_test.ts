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
import { setup_session_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { MockLlmAdapter } from "../../src/services_entry/services/llm_adapters.ts"
import { SessionManager } from "../../src/services_entry/services/session_manager.ts"

// ============================================================
// V4: /api/sessions 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v4-test-key-12345"

function make_server(): { server: HttpServer; manager: SessionManager } {
  const llm = new MockLlmAdapter("mock-v4-integration")
  const manager = new SessionManager(llm)

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

  const session_routes = setup_session_routes(manager)
  register_routes(server, session_routes)

  server.start()
  return { server, manager }
}

describe("V4 /api/sessions integration", () => {
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

  it("should reject session endpoints without auth (401)", async () => {
    expect((await client.get("/api/sessions")).status).toBe(401)
    expect((await client.post("/api/sessions", {})).status).toBe(401)
  })

  it("should create session via POST /api/sessions", async () => {
    const res = await client.post("/api/sessions", { title: "Test Session", system_prompt: "be helpful" }, headers) as { status: number; body: { id: string; title: string; system_prompt: string } }
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.title).toBe("Test Session")
    expect(res.body.system_prompt).toBe("be helpful")
  })

  it("should create session with default config", async () => {
    const res = await client.post("/api/sessions", {}, headers) as { status: number; body: { id: string; title: string } }
    expect(res.status).toBe(201)
    expect(res.body.title).toBe("Session 1")
  })

  it("should list sessions via GET /api/sessions", async () => {
    await client.post("/api/sessions", { title: "S1" }, headers)
    await new Promise((r) => setTimeout(r, 10))
    await client.post("/api/sessions", { title: "S2" }, headers)
    const res = await client.get("/api/sessions", headers) as { status: number; body: { sessions: Array<{ id: string; title: string }>; count: number } }
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    expect(res.body.sessions[0].title).toBe("S2") // 最新的在前
    expect(res.body.sessions[1].title).toBe("S1")
  })

  it("should get session detail via GET /api/sessions/:id", async () => {
    const created = await client.post("/api/sessions", { title: "Detail" }, headers) as { body: { id: string } }
    const res = await client.get(`/api/sessions/${created.body.id}`, headers) as { status: number; body: { id: string; title: string; message_count: number } }
    expect(res.status).toBe(200)
    expect(res.body.title).toBe("Detail")
    expect(res.body.message_count).toBe(0)
  })

  it("should return 404 for non-existent session", async () => {
    const res = await client.get("/api/sessions/999", headers) as { status: number; body: { error: string } }
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("not_found")
  })

  it("should delete session via DELETE /api/sessions/:id", async () => {
    const created = await client.post("/api/sessions", {}, headers) as { body: { id: string } }
    const res = await client.delete(`/api/sessions/${created.body.id}`, headers) as { status: number; body: { deleted: boolean } }
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
    // 验证已删除
    const get_res = await client.get(`/api/sessions/${created.body.id}`, headers) as { status: number }
    expect(get_res.status).toBe(404)
  })

  it("should chat in session via POST /api/sessions/:id/chat", async () => {
    const created = await client.post("/api/sessions", {}, headers) as { body: { id: string } }
    const res = await client.post(`/api/sessions/${created.body.id}/chat`, { message: "hello" }, headers) as { status: number; body: { content: string; model: string } }
    expect(res.status).toBe(200)
    expect(res.body.content).toBe("[Mock] hello")
    expect(res.body.model).toBe("mock-v4-integration")
  })

  it("should reject chat with empty message (400)", async () => {
    const created = await client.post("/api/sessions", {}, headers) as { body: { id: string } }
    const res = await client.post(`/api/sessions/${created.body.id}/chat`, { message: "" }, headers) as { status: number; body: { error: string } }
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("invalid_argument")
  })

  it("should return 404 when chatting in non-existent session", async () => {
    const res = await client.post("/api/sessions/999/chat", { message: "hi" }, headers) as { status: number; body: { error: string } }
    expect(res.status).toBe(404)
  })

  it("should get session history via GET /api/sessions/:id/history", async () => {
    const created = await client.post("/api/sessions", {}, headers) as { body: { id: string } }
    await client.post(`/api/sessions/${created.body.id}/chat`, { message: "msg1" }, headers)
    const res = await client.get(`/api/sessions/${created.body.id}/history`, headers) as { status: number; body: { messages: Array<{ role: string; content: string }>; count: number } }
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    expect(res.body.messages[0].role).toBe("user")
    expect(res.body.messages[0].content).toBe("msg1")
    expect(res.body.messages[1].role).toBe("assistant")
  })

  it("should clear session history via DELETE /api/sessions/:id/history", async () => {
    const created = await client.post("/api/sessions", {}, headers) as { body: { id: string } }
    await client.post(`/api/sessions/${created.body.id}/chat`, { message: "msg1" }, headers)
    await client.post(`/api/sessions/${created.body.id}/chat`, { message: "msg2" }, headers)
    const res = await client.delete(`/api/sessions/${created.body.id}/history`, headers) as { status: number; body: { cleared: boolean } }
    expect(res.status).toBe(200)
    expect(res.body.cleared).toBe(true)
    const history = await client.get(`/api/sessions/${created.body.id}/history`, headers) as { body: { count: number } }
    expect(history.body.count).toBe(0)
  })

  it("should maintain independent sessions", async () => {
    const s1 = await client.post("/api/sessions", { title: "S1" }, headers) as { body: { id: string } }
    const s2 = await client.post("/api/sessions", { title: "S2" }, headers) as { body: { id: string } }
    await client.post(`/api/sessions/${s1.body.id}/chat`, { message: "in s1" }, headers)
    await client.post(`/api/sessions/${s2.body.id}/chat`, { message: "in s2" }, headers)
    const h1 = await client.get(`/api/sessions/${s1.body.id}/history`, headers) as { body: { messages: Array<{ content: string }> } }
    const h2 = await client.get(`/api/sessions/${s2.body.id}/history`, headers) as { body: { messages: Array<{ content: string }> } }
    expect(h1.body.messages[0].content).toBe("in s1")
    expect(h2.body.messages[0].content).toBe("in s2")
  })

  it("should support multi-turn conversation in session", async () => {
    const created = await client.post("/api/sessions", {}, headers) as { body: { id: string } }
    const r1 = await client.post(`/api/sessions/${created.body.id}/chat`, { message: "turn1" }, headers) as { body: { content: string } }
    const r2 = await client.post(`/api/sessions/${created.body.id}/chat`, { message: "turn2" }, headers) as { body: { content: string } }
    expect(r1.body.content).toBe("[Mock] turn1")
    expect(r2.body.content).toBe("[Mock] turn2")
    const history = await client.get(`/api/sessions/${created.body.id}/history`, headers) as { body: { count: number } }
    expect(history.body.count).toBe(4) // 2 turns × 2 messages
  })
})

describe("V4 engine integration with sessions", () => {
  it("should serve session endpoints from engine HTTP server", async () => {
    process.env.API_KEYS = "v4-engine-test-key"
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
        get_session_manager: () => { create_session: () => Promise<{ id: string }>; count: () => Promise<number> }
        stop: () => void
      }
      await engine.start()
      const server = engine.start_http_server(0)
      const port = server.get_port()
      const client = new HttpClient({ base_url: `http://localhost:${port}` })
      const auth_header = { authorization: "Bearer v4-engine-test-key" }

      // 创建会话
      const create_res = await client.post("/api/sessions", { title: "Engine Test" }, auth_header) as { status: number; body: { id: string; title: string } }
      expect(create_res.status).toBe(201)
      expect(create_res.body.title).toBe("Engine Test")

      // 对话
      const chat_res = await client.post(`/api/sessions/${create_res.body.id}/chat`, { message: "via engine" }, auth_header) as { status: number; body: { content: string } }
      expect(chat_res.status).toBe(200)
      expect(chat_res.body.content).toBe("[Mock] via engine")

      // 列表
      const list_res = await client.get("/api/sessions", auth_header) as { status: number; body: { count: number } }
      expect(list_res.status).toBe(200)
      expect(list_res.body.count).toBeGreaterThanOrEqual(1)

      server.stop()
      engine.stop()
    } finally {
      delete process.env.API_KEYS
    }
  })
})
