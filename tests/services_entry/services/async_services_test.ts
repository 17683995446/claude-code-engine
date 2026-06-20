import { describe, it, expect } from "bun:test"
import {
  AsyncAuthService,
  AsyncMessageService,
  AsyncShellService,
  AsyncApiGateway,
} from "../../../src/services_entry/services/async_services.ts"
import type { ApiRequest } from "../../../src/core_infra/core/i_api_gateway.ts"

// ============================================================
// W3: 异步业务服务测试
// AsyncAuthService / AsyncMessageService / AsyncShellService / AsyncApiGateway
// ============================================================

describe("W3 AsyncAuthService", () => {
  it("should start unauthenticated", async () => {
    const svc: AsyncAuthService = new AsyncAuthService()
    const status: { is_authenticated: boolean; source: string } = await svc.get_status()
    expect(status.is_authenticated).toBe(false)
    expect(status.source).toBe("none")
  })

  it("should set token and validate", async () => {
    const svc: AsyncAuthService = new AsyncAuthService()
    await svc.set_token({
      source: "test",
      token: "abc123",
      expires_at: Date.now() + 3600000,
    })
    const valid: boolean = await svc.validate()
    expect(valid).toBe(true)
    const status: { is_authenticated: boolean; source: string } = await svc.get_status()
    expect(status.is_authenticated).toBe(true)
    expect(status.source).toBe("test")
  })

  it("should detect expired token", async () => {
    const svc: AsyncAuthService = new AsyncAuthService()
    await svc.set_token({
      source: "test",
      token: "abc123",
      expires_at: Date.now() - 1000,
    })
    const expired: boolean = await svc.is_token_expired()
    expect(expired).toBe(true)
    const valid: boolean = await svc.validate()
    expect(valid).toBe(false)
  })

  it("should reject invalid expires_at", async () => {
    const svc: AsyncAuthService = new AsyncAuthService()
    await svc.set_token({
      source: "test",
      token: "abc123",
      expires_at: Number.NaN,
    })
    const expired: boolean = await svc.is_token_expired()
    expect(expired).toBe(true)
  })

  it("should serialize to object", async () => {
    const svc: AsyncAuthService = new AsyncAuthService()
    const obj1: Record<string, unknown> = await svc.to_object()
    expect(obj1.has_token).toBe(false)
    await svc.set_token({
      source: "test",
      token: "abc123",
      expires_at: Date.now() + 3600000,
    })
    const obj2: Record<string, unknown> = await svc.to_object()
    expect(obj2.has_token).toBe(true)
  })

  it("should handle concurrent set_token safely", async () => {
    const svc: AsyncAuthService = new AsyncAuthService()
    await Promise.all([
      svc.set_token({ source: "a", token: "t1", expires_at: Date.now() + 1000 }),
      svc.set_token({ source: "b", token: "t2", expires_at: Date.now() + 1000 }),
      svc.set_token({ source: "c", token: "t3", expires_at: Date.now() + 1000 }),
    ])
    const status: { is_authenticated: boolean; source: string } = await svc.get_status()
    expect(status.is_authenticated).toBe(true)
    expect(["a", "b", "c"]).toContain(status.source)
  })
})

describe("W3 AsyncMessageService", () => {
  it("should start empty", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    const all: unknown[] = await svc.get_all()
    expect(all.length).toBe(0)
    const obj: Record<string, unknown> = await svc.to_object()
    expect(obj.count).toBe(0)
  })

  it("should add messages with incrementing ids", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    const m1: { id: string; content: string; role: string } = await svc.add("hello", "user")
    const m2: { id: string; content: string; role: string } = await svc.add("world", "assistant")
    expect(m1.id).toBe("1")
    expect(m2.id).toBe("2")
    expect(m1.content).toBe("hello")
    expect(m2.content).toBe("world")
    const all: unknown[] = await svc.get_all()
    expect(all.length).toBe(2)
  })

  it("should normalize messages", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    await svc.add("  hello  ", "user")
    await svc.add("  world  ", "assistant")
    const normalized: { content: string }[] = await svc.normalize_all()
    expect(normalized[0].content).toBe("hello")
    expect(normalized[1].content).toBe("world")
  })

  it("should clear messages", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    await svc.add("a", "user")
    await svc.add("b", "user")
    await svc.clear()
    const all: unknown[] = await svc.get_all()
    expect(all.length).toBe(0)
  })

  it("should return message copies (no reference leak)", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    const m1: { content: string } = await svc.add("original", "user")
    m1.content = "mutated"
    const all: { content: string }[] = await svc.get_all()
    expect(all[0].content).toBe("original")
  })

  it("should handle concurrent adds safely", async () => {
    const svc: AsyncMessageService = new AsyncMessageService()
    await Promise.all([
      svc.add("m1", "user"),
      svc.add("m2", "user"),
      svc.add("m3", "user"),
      svc.add("m4", "user"),
      svc.add("m5", "user"),
    ])
    const all: unknown[] = await svc.get_all()
    expect(all.length).toBe(5)
    const obj: Record<string, unknown> = await svc.to_object()
    expect(obj.count).toBe(5)
  })
})

describe("W3 AsyncShellService", () => {
  it("should execute valid command", async () => {
    const svc: AsyncShellService = new AsyncShellService("/tmp")
    const result: { exit_code: number; stdout: string; stderr: string } = await svc.run({
      command: "echo hello",
      timeout_ms: 5000,
    })
    expect(result.exit_code).toBe(0)
    // V1: 真实执行，stdout 是 "hello" 而非 mock 的 "Executed: echo hello"
    expect(result.stdout.trim()).toBe("hello")
  })

  it("should reject invalid command", async () => {
    const svc: AsyncShellService = new AsyncShellService()
    const result: { exit_code: number; stdout: string; stderr: string } = await svc.run({
      command: "",
      timeout_ms: 5000,
    })
    expect(result.exit_code).toBe(1)
    // invalid command throws, breaker catches and returns fallback with stderr="circuit_open"
    expect(result.stderr).toBe("circuit_open")
  })

  it("should track history", async () => {
    const svc: AsyncShellService = new AsyncShellService()
    await svc.run({ command: "cmd1", timeout_ms: 5000 })
    await svc.run({ command: "cmd2", timeout_ms: 5000 })
    const history: { command: string }[] = await svc.get_history()
    expect(history.length).toBe(2)
    expect(history[0].command).toBe("cmd1")
    expect(history[1].command).toBe("cmd2")
  })

  it("should return history copies (no reference leak)", async () => {
    const svc: AsyncShellService = new AsyncShellService()
    await svc.run({ command: "original", timeout_ms: 5000 })
    const h1: { command: string }[] = await svc.get_history()
    h1[0].command = "mutated"
    const h2: { command: string }[] = await svc.get_history()
    expect(h2[0].command).toBe("original")
  })

  it("should serialize to object", async () => {
    const svc: AsyncShellService = new AsyncShellService()
    await svc.run({ command: "cmd1", timeout_ms: 5000 })
    const obj: Record<string, unknown> = await svc.to_object()
    expect(obj.history_count).toBe(1)
  })
})

describe("W3 AsyncApiGateway", () => {
  function make_gateway(): AsyncApiGateway {
    return new AsyncApiGateway(new AsyncAuthService(), new AsyncMessageService(), new AsyncShellService())
  }

  it("should route auth.status", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const req: ApiRequest = { action: "auth.status", payload: {} }
    const res: { success: boolean; data: unknown } = await gw.handle_request(req)
    expect(res.success).toBe(true)
    const status: { is_authenticated: boolean } = res.data as { is_authenticated: boolean }
    expect(status.is_authenticated).toBe(false)
  })

  it("should route message.add and message.list", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const add_req: ApiRequest = {
      action: "message.add",
      payload: { content: "hello", role: "user" },
    }
    const add_res: { success: boolean; data: { id: string } } = await gw.handle_request(add_req)
    expect(add_res.success).toBe(true)
    expect(add_res.data.id).toBe("1")

    const list_req: ApiRequest = { action: "message.list", payload: {} }
    const list_res: { success: boolean; data: unknown[] } = await gw.handle_request(list_req)
    expect(list_res.success).toBe(true)
    expect(list_res.data.length).toBe(1)
  })

  it("should route message.clear", async () => {
    const gw: AsyncApiGateway = make_gateway()
    await gw.handle_request({ action: "message.add", payload: { content: "x", role: "user" } })
    const res: { success: boolean; data: { cleared: boolean } } = await gw.handle_request({
      action: "message.clear",
      payload: {},
    })
    expect(res.success).toBe(true)
    expect(res.data.cleared).toBe(true)
    const list_res: { success: boolean; data: unknown[] } = await gw.handle_request({
      action: "message.list",
      payload: {},
    })
    expect(list_res.data.length).toBe(0)
  })

  it("should route shell.run and shell.history", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const run_res: { success: boolean; data: { exit_code: number } } = await gw.handle_request({
      action: "shell.run",
      payload: { command: "echo test", timeout_ms: 5000 },
    })
    expect(run_res.success).toBe(true)
    expect(run_res.data.exit_code).toBe(0)

    const hist_res: { success: boolean; data: unknown[] } = await gw.handle_request({
      action: "shell.history",
      payload: {},
    })
    expect(hist_res.success).toBe(true)
    expect(hist_res.data.length).toBe(1)
  })

  it("should route auth.validate", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const res: { success: boolean; data: boolean } = await gw.handle_request({
      action: "auth.validate",
      payload: {},
    })
    expect(res.success).toBe(true)
    expect(res.data).toBe(false)
  })

  it("should reject empty action", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const res: { success: boolean; error_code: number } = await gw.handle_request({
      action: "",
      payload: {},
    })
    expect(res.success).toBe(false)
    expect(res.error_code).toBe(1001)
  })

  it("should handle unknown action gracefully", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const res: { success: boolean; error_code: number; data: { error: string } } = await gw.handle_request({
      action: "unknown.action",
      payload: {},
    })
    expect(res.success).toBe(false)
    expect(res.error_code).toBe(1000)
    expect(res.data.error).toContain("unknown_action")
  })

  it("should handle null request", async () => {
    const gw: AsyncApiGateway = make_gateway()
    const res: { success: boolean; error_code: number } = await gw.handle_request(null as unknown as ApiRequest)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe(1001)
  })
})

describe("W3 async services integration with ClaudeCodeEngine", () => {
  it("should resolve async services from engine", async () => {
    const { ClaudeCodeEngine } = await import("../../../src/index.ts")
    const engine: { get_async_auth: () => unknown; get_async_messages: () => unknown; get_async_shell: () => unknown; get_async_gateway: () => { handle_request: (r: ApiRequest) => Promise<unknown> } } = new ClaudeCodeEngine({
      cwd: "/tmp",
      max_turns: 10,
    }) as unknown as { get_async_auth: () => unknown; get_async_messages: () => unknown; get_async_shell: () => unknown; get_async_gateway: () => { handle_request: (r: ApiRequest) => Promise<unknown> } }

    expect(engine.get_async_auth()).toBeDefined()
    expect(engine.get_async_messages()).toBeDefined()
    expect(engine.get_async_shell()).toBeDefined()
    expect(engine.get_async_gateway()).toBeDefined()

    const gw: { handle_request: (r: ApiRequest) => Promise<{ success: boolean }> } = engine.get_async_gateway() as { handle_request: (r: ApiRequest) => Promise<{ success: boolean }> }
    const res: { success: boolean } = await gw.handle_request({ action: "auth.status", payload: {} }) as { success: boolean }
    expect(res.success).toBe(true)
  })
})
