import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_api_routes, setup_chat_routes, setup_session_routes, setup_stream_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { AsyncAuthService, AsyncMessageService, AsyncShellService } from "../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../src/services_entry/services/llm_adapters.ts"
import { ConversationEngine } from "../../src/services_entry/services/conversation_engine.ts"
import { SessionManager } from "../../src/services_entry/services/session_manager.ts"

// ============================================================
// V5: /api/chat/stream + /api/sessions/:id/chat/stream 集成测试
// ============================================================

const TEST_API_KEY: string = "v5-stream-test-key"

interface SseEvent {
  data: string
}

/**
 * 解析 SSE 响应文本为事件数组。
 * 每个事件以 `data: <json>\n\n` 格式传输。
 */
function parse_sse_events(text: string): SseEvent[] {
  const events: SseEvent[] = []
  const blocks: string[] = text.split("\n\n")
  for (const block of blocks) {
    const lines: string[] = block.split("\n")
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        events.push({ data: line.slice(6) })
      }
    }
  }
  return events
}

function make_server(): {
  server: HttpServer
  engine: ConversationEngine
  manager: SessionManager
} {
  const auth = new AsyncAuthService()
  const messages = new AsyncMessageService()
  const shell = new AsyncShellService("/tmp")
  const llm = new MockLlmAdapter("mock-sse-integration")
  const engine = new ConversationEngine(messages, llm, {
    system_prompt: "test assistant",
    max_history: 20,
  })
  const manager = new SessionManager(llm, { default_max_history: 20 })

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
  const chat_routes = setup_chat_routes(engine)
  const session_routes = setup_session_routes(manager)
  const stream_routes = setup_stream_routes(engine, manager)
  register_routes(server, [...api_routes, ...chat_routes, ...session_routes, ...stream_routes])

  server.start()
  return { server, engine, manager }
}

describe("V5 /api/chat/stream integration", () => {
  let server: HttpServer
  let port: number
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(() => {
    const result = make_server()
    server = result.server
    port = server.get_port()
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject stream without auth (401)", async () => {
    const response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    })
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should reject stream with empty message (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: "" }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("invalid_argument")
  })

  it("should return SSE content-type for valid stream", async () => {
    const response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: "hello world" }),
    })
    expect(response.status).toBe(200)
    const content_type = response.headers.get("content-type") ?? ""
    expect(content_type).toContain("text/event-stream")
    const text = await response.text()
    expect(text.length).toBeGreaterThan(0)
  })

  it("should stream delta chunks and done chunk", async () => {
    const response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: "hello world" }),
    })
    const text = await response.text()
    const events = parse_sse_events(text)
    // 至少有 delta 事件 + done 事件 + [DONE] 终止标记
    expect(events.length).toBeGreaterThanOrEqual(3)
    // 最后一个事件是 [DONE]
    expect(events[events.length - 1].data).toBe("[DONE]")
    // 倒数第二个是 done chunk
    const done_event = events[events.length - 2]
    const done_data = JSON.parse(done_event.data) as { type: string }
    expect(done_data.type).toBe("done")
    // 前面的都是 delta
    for (let i = 0; i < events.length - 2; i++) {
      const parsed = JSON.parse(events[i].data) as { type: string }
      expect(parsed.type).toBe("delta")
    }
  })

  it("should reconstruct full content from delta events", async () => {
    const response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: "stream test" }),
    })
    const text = await response.text()
    const events = parse_sse_events(text)
    let full_content: string = ""
    for (const event of events) {
      if (event.data === "[DONE]") continue
      const parsed = JSON.parse(event.data) as { type: string; content?: string }
      if (parsed.type === "delta" && parsed.content) {
        full_content += parsed.content
      }
    }
    expect(full_content).toBe("[Mock] stream test")
  })

  it("should include usage in done event", async () => {
    const response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: "usage check" }),
    })
    const text = await response.text()
    const events = parse_sse_events(text)
    const done_event = events[events.length - 2]
    const done_data = JSON.parse(done_event.data) as {
      type: string
      finish_reason: string
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }
    expect(done_data.type).toBe("done")
    expect(done_data.finish_reason).toBe("stop")
    expect(done_data.usage.prompt_tokens).toBeGreaterThan(0)
    expect(done_data.usage.completion_tokens).toBeGreaterThan(0)
    expect(done_data.usage.total_tokens).toBe(
      done_data.usage.prompt_tokens + done_data.usage.completion_tokens,
    )
  })

  it("should persist history after stream completes", async () => {
    // 流式对话
    const stream_response = await fetch(`http://localhost:${port}/api/chat/stream`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: "persist test" }),
    })
    await stream_response.text()

    // 查询历史
    const history_response = await fetch(`http://localhost:${port}/api/chat/history`, {
      headers,
    })
    const history = await history_response.json() as {
      count: number
      messages: Array<{ role: string; content: string }>
    }
    expect(history.count).toBe(2)
    expect(history.messages[0].role).toBe("user")
    expect(history.messages[0].content).toBe("persist test")
    expect(history.messages[1].role).toBe("assistant")
    expect(history.messages[1].content).toBe("[Mock] persist test")
  })
})

describe("V5 /api/sessions/:id/chat/stream integration", () => {
  let server: HttpServer
  let port: number
  let manager: SessionManager
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(() => {
    const result = make_server()
    server = result.server
    port = server.get_port()
    manager = result.manager
  })

  afterEach(() => {
    server.stop()
  })

  it("should stream chat in a session", async () => {
    // 创建会话
    const create_response = await fetch(`http://localhost:${port}/api/sessions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: "stream-session" }),
    })
    const session = await create_response.json() as { id: string }
    expect(session.id).toBeDefined()

    // 流式对话
    const stream_response = await fetch(
      `http://localhost:${port}/api/sessions/${session.id}/chat/stream`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ message: "session stream" }),
      },
    )
    expect(stream_response.status).toBe(200)
    const content_type = stream_response.headers.get("content-type") ?? ""
    expect(content_type).toContain("text/event-stream")

    const text = await stream_response.text()
    const events = parse_sse_events(text)
    let full_content: string = ""
    for (const event of events) {
      if (event.data === "[DONE]") continue
      const parsed = JSON.parse(event.data) as { type: string; content?: string }
      if (parsed.type === "delta" && parsed.content) {
        full_content += parsed.content
      }
    }
    expect(full_content).toBe("[Mock] session stream")
  })

  it("should return 404 for non-existent session", async () => {
    const response = await fetch(
      `http://localhost:${port}/api/sessions/nonexistent/chat/stream`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      },
    )
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("not_found")
  })

  it("should reject session stream without auth (401)", async () => {
    const response = await fetch(
      `http://localhost:${port}/api/sessions/1/chat/stream`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      },
    )
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should reject session stream with empty message (400)", async () => {
    // 先创建会话
    const create_response = await fetch(`http://localhost:${port}/api/sessions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: "test" }),
    })
    const session = await create_response.json() as { id: string }

    const response = await fetch(
      `http://localhost:${port}/api/sessions/${session.id}/chat/stream`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ message: "" }),
      },
    )
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("invalid_argument")
  })

  it("should persist session history after stream", async () => {
    // 创建会话
    const create_response = await fetch(`http://localhost:${port}/api/sessions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: "persist-session" }),
    })
    const session = await create_response.json() as { id: string }

    // 流式对话
    const stream_response = await fetch(
      `http://localhost:${port}/api/sessions/${session.id}/chat/stream`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ message: "persist this" }),
      },
    )
    await stream_response.text()

    // 查询历史
    const history_response = await fetch(
      `http://localhost:${port}/api/sessions/${session.id}/history`,
      { headers },
    )
    const history = await history_response.json() as {
      count: number
      messages: Array<{ role: string; content: string }>
    }
    expect(history.count).toBe(2)
    expect(history.messages[0].content).toBe("persist this")
    expect(history.messages[1].content).toBe("[Mock] persist this")
  })
})
