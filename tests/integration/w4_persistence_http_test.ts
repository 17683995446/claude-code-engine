import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import { AsyncMessageService } from "../../src/services_entry/services/async_services.ts"
import { DiskStorage } from "../../src/core_infra/infra/disk_storage.ts"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../src/core_infra/infra/http_client.ts"
import { setup_api_routes, setup_gateway_route, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { AsyncAuthService, AsyncShellService, AsyncApiGateway } from "../../src/services_entry/services/async_services.ts"
import { logging_middleware, error_handler_middleware } from "../../src/core_infra/infra/http_middlewares.ts"

// ============================================================
// W4: 持久化集成 + HTTP 端点暴露测试
// ============================================================

const TEST_STORAGE_DIR: string = `/tmp/w4_test_storage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

describe("W4 persistence integration", () => {
  it("should persist messages to DiskStorage and reload", async () => {
    const storage: DiskStorage = new DiskStorage(TEST_STORAGE_DIR)
    const svc1: AsyncMessageService = new AsyncMessageService(storage)

    await svc1.add("hello", "user")
    await svc1.add("world", "assistant")
    await svc1.add("!", "system")

    const obj: Record<string, unknown> = await svc1.to_object()
    expect(obj.count).toBe(3)

    // 模拟重启：创建新实例，从存储加载
    const svc2: AsyncMessageService = new AsyncMessageService(storage)
    await svc2.load_from_storage()

    const all: { id: string; content: string; role: string }[] = await svc2.get_all()
    expect(all.length).toBe(3)
    expect(all[0].content).toBe("hello")
    expect(all[1].content).toBe("world")
    expect(all[2].content).toBe("!")

    // id_counter 应恢复，新消息 id 从 4 开始
    const m4: { id: string } = await svc2.add("new", "user")
    expect(m4.id).toBe("4")

    storage.close()
  })

  it("should clear persisted messages", async () => {
    const storage: DiskStorage = new DiskStorage(TEST_STORAGE_DIR)
    const svc: AsyncMessageService = new AsyncMessageService(storage)

    await svc.add("a", "user")
    await svc.add("b", "user")
    await svc.clear()

    // 重启后应为空
    const svc2: AsyncMessageService = new AsyncMessageService(storage)
    await svc2.load_from_storage()
    const all: unknown[] = await svc2.get_all()
    expect(all.length).toBe(0)

    // id_counter 应重置
    const m: { id: string } = await svc2.add("c", "user")
    expect(m.id).toBe("1")

    storage.close()
  })

  it("should work without storage (backward compatible)", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    await svc.add("no persist", "user")
    const all: unknown[] = await svc.get_all()
    expect(all.length).toBe(1)

    // load_from_storage 应为 no-op
    await svc.load_from_storage()
    const all2: unknown[] = await svc.get_all()
    expect(all2.length).toBe(1)
  })

  it("should handle storage failures gracefully", async () => {
    // 创建一个会失败的 storage mock
    const failing_storage: { save: () => Promise<void>; load: () => Promise<null>; delete: () => Promise<void>; list_keys: () => Promise<string[]>; close: () => void } = {
      save: async (): Promise<void> => {
        throw new Error("disk_full")
      },
      load: async (): Promise<null> => null,
      delete: async (): Promise<void> => {},
      list_keys: async (): Promise<string[]> => [],
      close: (): void => {},
    }
    const svc: AsyncMessageService = new AsyncMessageService(failing_storage as unknown as { save: (k: string, d: unknown) => Promise<void>; load: (k: string) => Promise<unknown>; delete: (k: string) => Promise<void>; list_keys: (p: string) => Promise<string[]>; close: () => void })

    // add 不应因持久化失败而抛出
    const msg: { id: string; content: string } = await svc.add("test", "user")
    expect(msg.id).toBe("1")
    expect(msg.content).toBe("test")
  })
})

describe("W4 HTTP API endpoints", () => {
  let server: HttpServer | null = null
  let client: HttpClient

  beforeEach(() => {
    const auth: AsyncAuthService = new AsyncAuthService()
    const messages: AsyncMessageService = new AsyncMessageService()
    const shell: AsyncShellService = new AsyncShellService()
    const gateway: AsyncApiGateway = new AsyncApiGateway(auth, messages, shell)

    server = new HttpServer({ port: 0 })
    server.use(error_handler_middleware())
    server.use(logging_middleware())

    const api_routes = setup_api_routes(auth, messages, shell)
    const gateway_routes = setup_gateway_route(gateway)
    register_routes(server, [...api_routes, ...gateway_routes])

    server.start()
    client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
  })

  afterEach(() => {
    if (server) {
      server.stop()
      server = null
    }
  })

  it("should serve GET /api/auth/status", async () => {
    const res: { status: number; body: { is_authenticated: boolean; source: string } } = await client.get("/api/auth/status") as { status: number; body: { is_authenticated: boolean; source: string } }
    expect(res.status).toBe(200)
    expect(res.body.is_authenticated).toBe(false)
    expect(res.body.source).toBe("none")
  })

  it("should serve GET /api/auth/validate", async () => {
    const res: { status: number; body: { valid: boolean } } = await client.get("/api/auth/validate") as { status: number; body: { valid: boolean } }
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(false)
  })

  it("should serve POST /api/messages and GET /api/messages", async () => {
    const post_res: { status: number; body: { id: string; content: string; role: string } } = await client.post("/api/messages", { content: "hello", role: "user" }) as { status: number; body: { id: string; content: string; role: string } }
    expect(post_res.status).toBe(201)
    expect(post_res.body.id).toBe("1")
    expect(post_res.body.content).toBe("hello")
    expect(post_res.body.role).toBe("user")

    const get_res: { status: number; body: { messages: { id: string }[]; count: number } } = await client.get("/api/messages") as { status: number; body: { messages: { id: string }[]; count: number } }
    expect(get_res.status).toBe(200)
    expect(get_res.body.count).toBe(1)
    expect(get_res.body.messages[0].id).toBe("1")
  })

  it("should serve DELETE /api/messages", async () => {
    await client.post("/api/messages", { content: "a", role: "user" })
    await client.post("/api/messages", { content: "b", role: "user" })

    const del_res: { status: number; body: { cleared: boolean } } = await client.delete("/api/messages") as { status: number; body: { cleared: boolean } }
    expect(del_res.status).toBe(200)
    expect(del_res.body.cleared).toBe(true)

    const get_res: { status: number; body: { count: number } } = await client.get("/api/messages") as { status: number; body: { count: number } }
    expect(get_res.body.count).toBe(0)
  })

  it("should serve POST /api/shell/run and GET /api/shell/history", async () => {
    const run_res: { status: number; body: { exit_code: number; stdout: string } } = await client.post("/api/shell/run", { command: "echo test", timeout_ms: 5000 }) as { status: number; body: { exit_code: number; stdout: string } }
    expect(run_res.status).toBe(200)
    expect(run_res.body.exit_code).toBe(0)
    // V1: 真实执行，stdout 是 "test" 而非 mock 的 "Executed: echo test"
    expect(run_res.body.stdout.trim()).toBe("test")

    const hist_res: { status: number; body: { history: { command: string }[]; count: number } } = await client.get("/api/shell/history") as { status: number; body: { history: { command: string }[]; count: number } }
    expect(hist_res.status).toBe(200)
    expect(hist_res.body.count).toBe(1)
    expect(hist_res.body.history[0].command).toBe("echo test")
  })

  it("should serve POST /api/gateway (unified entry)", async () => {
    const res: { status: number; body: { success: boolean; data: { is_authenticated: boolean } } } = await client.post("/api/gateway", { action: "auth.status", payload: {} }) as { status: number; body: { success: boolean; data: { is_authenticated: boolean } } }
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.is_authenticated).toBe(false)
  })

  it("should return 400 for failed gateway request", async () => {
    const res: { status: number; body: { success: boolean; error_code: number } } = await client.post("/api/gateway", { action: "unknown.action", payload: {} }) as { status: number; body: { success: boolean; error_code: number } }
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error_code).toBe(1000)
  })

  it("should handle invalid message role gracefully", async () => {
    const res: { status: number; body: { role: string } } = await client.post("/api/messages", { content: "test", role: "invalid_role" }) as { status: number; body: { role: string } }
    expect(res.status).toBe(201)
    expect(res.body.role).toBe("user")
  })

  it("should return 404 for unknown routes", async () => {
    const res: { status: number } = await client.get("/api/unknown") as { status: number }
    expect(res.status).toBe(404)
  })
})

describe("W4 engine HTTP server integration", () => {
  it("should start HTTP server from engine and serve requests", async () => {
    // V2: 引擎 HTTP 服务器现在集成鉴权中间件，需设置 API_KEYS 并携带 Bearer Token
    const test_key: string = "w4-engine-test-key"
    process.env.API_KEYS = test_key
    try {
      const { ClaudeCodeEngine } = await import("../../src/index.ts")
      const engine: { start: () => Promise<void>; start_http_server: (port?: number) => { get_port: () => number; stop: () => void }; stop: () => void } = new ClaudeCodeEngine({
        cwd: "/tmp",
        initial_messages: [],
        max_turns: 10,
        verbose: false,
      }) as unknown as { start: () => Promise<void>; start_http_server: (port?: number) => { get_port: () => number; stop: () => void }; stop: () => void }

      await engine.start()
      const server: { get_port: () => number; stop: () => void } = engine.start_http_server(0)
      const port: number = server.get_port()

      const client: HttpClient = new HttpClient({ base_url: `http://localhost:${port}` })
      const res: { status: number; body: { is_authenticated: boolean } } = await client.get("/api/auth/status", { authorization: `Bearer ${test_key}` }) as { status: number; body: { is_authenticated: boolean } }
      expect(res.status).toBe(200)
      expect(res.body.is_authenticated).toBe(true)

      server.stop()
      engine.stop()
    } finally {
      delete process.env.API_KEYS
    }
  })
})
