import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../src/core_infra/infra/http_client.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  load_api_keys_from_env,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware, json_response } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_api_routes, setup_gateway_route, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { AsyncAuthService, AsyncMessageService, AsyncShellService, AsyncApiGateway } from "../../src/services_entry/services/async_services.ts"

// ============================================================
// V2: HTTP 鉴权中间件 + 速率限制测试
// ============================================================

const TEST_API_KEY: string = "test-secret-key-12345"
const TEST_API_KEY_2: string = "another-key-67890"

function make_auth_config(overrides: Partial<AuthMiddlewareConfig> = {}): AuthMiddlewareConfig {
  return {
    ...DEFAULT_AUTH_CONFIG,
    api_keys: new Set([TEST_API_KEY, TEST_API_KEY_2]),
    rate_limit_max: 5,
    rate_limit_refill_ms: 1000,
    ...overrides,
  }
}

function make_server(config: AuthMiddlewareConfig): HttpServer {
  const auth = new AsyncAuthService()
  const messages = new AsyncMessageService()
  const shell = new AsyncShellService("/tmp")
  const gateway = new AsyncApiGateway(auth, messages, shell)

  const server = new HttpServer({ port: 0 })
  server.use(error_handler_middleware())
  server.use(logging_middleware())
  server.use(rate_limit_middleware(config))
  server.use(auth_middleware(config))

  const api_routes = setup_api_routes(auth, messages, shell)
  const gateway_routes = setup_gateway_route(gateway)
  register_routes(server, [...api_routes, ...gateway_routes])

  server.start()
  return server
}

describe("V2 auth_middleware", () => {
  let server: HttpServer
  let client: HttpClient
  let config: AuthMiddlewareConfig

  beforeEach(() => {
    config = make_auth_config()
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject request without Authorization header (401)", async () => {
    const res = await client.get("/api/auth/status") as { status: number; body: { error: string; message: string } }
    expect(res.status).toBe(401)
    expect(res.body.error).toBe("unauthorized")
    expect(res.body.message).toBe("missing_authorization_header")
  })

  it("should reject request with invalid token (401)", async () => {
    const res = await client.get("/api/auth/status", { authorization: "Bearer wrong-token" }) as { status: number; body: { error: string } }
    expect(res.status).toBe(401)
    expect(res.body.error).toBe("unauthorized")
  })

  it("should accept request with valid Bearer token", async () => {
    const res = await client.get("/api/auth/status", { authorization: `Bearer ${TEST_API_KEY}` }) as { status: number; body: { is_authenticated: boolean } }
    expect(res.status).toBe(200)
    expect(res.body.is_authenticated).toBe(false)
  })

  it("should accept request with ApiKey scheme", async () => {
    const res = await client.get("/api/auth/validate", { authorization: `ApiKey ${TEST_API_KEY_2}` }) as { status: number; body: { valid: boolean } }
    expect(res.status).toBe(200)
  })

  it("should reject malformed Authorization header", async () => {
    const res1 = await client.get("/api/auth/status", { authorization: "InvalidScheme token" }) as { status: number }
    expect(res1.status).toBe(401)

    const res2 = await client.get("/api/auth/status", { authorization: "Bearer" }) as { status: number }
    expect(res2.status).toBe(401)

    const res3 = await client.get("/api/auth/status", { authorization: "Bearer " }) as { status: number }
    expect(res3.status).toBe(401)
  })

  it("should allow public paths without auth", async () => {
    // /health 是公开路径，但当前未注册路由，应返回 404 而非 401
    const res = await client.get("/health") as { status: number }
    expect(res.status).toBe(404)
    expect(res.status).not.toBe(401)
  })

  it("should allow /metrics without auth", async () => {
    const res = await client.get("/metrics") as { status: number }
    expect(res.status).not.toBe(401)
  })

  it("should protect POST /api/messages", async () => {
    const res = await client.post("/api/messages", { content: "test", role: "user" }) as { status: number }
    expect(res.status).toBe(401)
  })

  it("should protect DELETE /api/messages", async () => {
    const res = await client.delete("/api/messages") as { status: number }
    expect(res.status).toBe(401)
  })

  it("should protect POST /api/shell/run", async () => {
    const res = await client.post("/api/shell/run", { command: "echo hi", timeout_ms: 5000 }) as { status: number }
    expect(res.status).toBe(401)
  })

  it("should protect POST /api/gateway", async () => {
    const res = await client.post("/api/gateway", { action: "auth.status", payload: {} }) as { status: number }
    expect(res.status).toBe(401)
  })

  it("should allow full workflow with valid token", async () => {
    const headers = { authorization: `Bearer ${TEST_API_KEY}` }

    // 添加消息
    const add_res = await client.post("/api/messages", { content: "hello", role: "user" }, headers) as { status: number; body: { id: string } }
    expect(add_res.status).toBe(201)

    // 查询消息
    const list_res = await client.get("/api/messages", headers) as { status: number; body: { count: number } }
    expect(list_res.status).toBe(200)
    expect(list_res.body.count).toBe(1)

    // 执行命令
    const shell_res = await client.post("/api/shell/run", { command: "echo test", timeout_ms: 5000 }, headers) as { status: number; body: { exit_code: number } }
    expect(shell_res.status).toBe(200)
    expect(shell_res.body.exit_code).toBe(0)
  })
})

describe("V2 rate_limit_middleware", () => {
  let server: HttpServer
  let client: HttpClient

  afterEach(() => {
    if (server) {
      server.stop()
    }
  })

  it("should allow requests within limit", async () => {
    const config = make_auth_config({ rate_limit_max: 10, rate_limit_refill_ms: 10000 })
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const headers = { authorization: `Bearer ${TEST_API_KEY}` }
    for (let i = 0; i < 5; i++) {
      const res = await client.get("/api/auth/status", headers) as { status: number }
      expect(res.status).toBe(200)
    }
  })

  it("should return 429 when rate limit exceeded", async () => {
    const config = make_auth_config({ rate_limit_max: 3, rate_limit_refill_ms: 10000 })
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const headers = { authorization: `Bearer ${TEST_API_KEY}` }
    // 消耗 3 个令牌
    for (let i = 0; i < 3; i++) {
      const res = await client.get("/api/auth/status", headers) as { status: number }
      expect(res.status).toBe(200)
    }
    // 第 4 个应被限流
    const res = await client.get("/api/auth/status", headers) as { status: number; body: { error: string; retry_after_ms: number } }
    expect(res.status).toBe(429)
    expect(res.body.error).toBe("too_many_requests")
    expect(res.body.retry_after_ms).toBe(10000)
  })

  it("should set x-ratelimit-remaining header", async () => {
    const config = make_auth_config({ rate_limit_max: 5, rate_limit_refill_ms: 10000 })
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const headers = { authorization: `Bearer ${TEST_API_KEY}` }
    const res = await client.get("/api/auth/status", headers) as { status: number; headers: Record<string, string> }
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined()
  })

  it("should track rate limit per client IP", async () => {
    const config = make_auth_config({ rate_limit_max: 2, rate_limit_refill_ms: 10000 })
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const auth_header = { authorization: `Bearer ${TEST_API_KEY}` }
    // IP 1 消耗 2 个令牌
    await client.get("/api/auth/status", { ...auth_header, "x-forwarded-for": "1.1.1.1" })
    await client.get("/api/auth/status", { ...auth_header, "x-forwarded-for": "1.1.1.1" })
    // IP 1 第 3 个被限流
    const blocked = await client.get("/api/auth/status", { ...auth_header, "x-forwarded-for": "1.1.1.1" }) as { status: number }
    expect(blocked.status).toBe(429)
    // IP 2 仍可用
    const ok = await client.get("/api/auth/status", { ...auth_header, "x-forwarded-for": "2.2.2.2" }) as { status: number }
    expect(ok.status).toBe(200)
  })

  it("should skip rate limit when disabled", async () => {
    const config = make_auth_config({ rate_limit_enabled: false })
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const headers = { authorization: `Bearer ${TEST_API_KEY}` }
    for (let i = 0; i < 20; i++) {
      const res = await client.get("/api/auth/status", headers) as { status: number }
      expect(res.status).toBe(200)
    }
  })
})

describe("V2 load_api_keys_from_env", () => {
  let server: HttpServer
  let client: HttpClient

  afterEach(() => {
    if (server) {
      server.stop()
    }
  })

  it("should load keys from API_KEYS env", () => {
    process.env.API_KEYS = "key1,key2,key3"
    const keys = load_api_keys_from_env()
    expect(keys.size).toBe(3)
    expect(keys.has("key1")).toBe(true)
    expect(keys.has("key2")).toBe(true)
    expect(keys.has("key3")).toBe(true)
    delete process.env.API_KEYS
  })

  it("should return empty set when env not set", () => {
    delete process.env.API_KEYS
    const keys = load_api_keys_from_env()
    expect(keys.size).toBe(0)
  })

  it("should handle whitespace in keys", () => {
    process.env.API_KEYS = "  key1  ,  key2  ,  "
    const keys = load_api_keys_from_env()
    expect(keys.size).toBe(2)
    expect(keys.has("key1")).toBe(true)
    expect(keys.has("key2")).toBe(true)
    delete process.env.API_KEYS
  })

  it("should reject all requests when no keys configured", async () => {
    const config = make_auth_config({ api_keys: new Set<string>() })
    server = make_server(config)
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const res = await client.get("/api/auth/status", { authorization: "Bearer any-token" }) as { status: number }
    expect(res.status).toBe(401)
    server.stop()
  })
})
