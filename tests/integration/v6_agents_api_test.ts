import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_agent_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { AgentRegistry } from "../../src/services_entry/services/agent_registry.ts"
import { ShellAgent, ChatAgent } from "../../src/services_entry/services/agents.ts"
import { AsyncShellService, AsyncMessageService } from "../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../src/services_entry/services/llm_adapters.ts"

// ============================================================
// V6: /api/agents 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v6-agent-test-key"

function make_server(): { server: HttpServer; registry: AgentRegistry } {
  const shell = new AsyncShellService("/tmp")
  const llm = new MockLlmAdapter("mock-agent-api")
  const messages = new AsyncMessageService()
  const registry = new AgentRegistry()

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

  const agent_routes = setup_agent_routes(registry)
  register_routes(server, agent_routes)

  server.start()
  return { server, registry }
}

describe("V6 /api/agents integration", () => {
  let server: HttpServer
  let port: number
  let registry: AgentRegistry
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(async () => {
    const result = make_server()
    server = result.server
    port = server.get_port()
    registry = result.registry
    // 预注册 Agent
    const shell = new AsyncShellService("/tmp")
    const llm = new MockLlmAdapter("mock-pre")
    const messages = new AsyncMessageService()
    const shell_agent = new ShellAgent("1", shell)
    const chat_agent = new ChatAgent("2", llm, messages)
    await registry.register(shell_agent)
    await registry.register(chat_agent)
    await registry.start_agent("1")
    await registry.start_agent("2")
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject without auth (401)", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents`)
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should list all agents", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { agents: Array<{ id: string; type: string }>; count: number }
    expect(body.count).toBe(2)
    expect(body.agents[0].id).toBe("1")
    expect(body.agents[1].id).toBe("2")
  })

  it("should get agent by ID", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/1`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { id: string; name: string; type: string; capabilities: Array<{ name: string }> }
    expect(body.id).toBe("1")
    expect(body.name).toBe("ShellAgent")
    expect(body.type).toBe("shell")
    expect(body.capabilities.length).toBe(2)
  })

  it("should return 404 for non-existent agent", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/999`, { headers })
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("not_found")
  })

  it("should invoke shell agent action", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/1/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ type: "shell.run", input: { command: "echo agent-api", timeout_ms: 5000 } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; output: { stdout: string }; error: string | null }
    expect(body.success).toBe(true)
    expect(body.output.stdout.trim()).toBe("agent-api")
    expect(body.error).toBeNull()
  })

  it("should invoke chat agent action", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/2/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ type: "chat.send", input: { message: "via agent api" } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; output: { content: string } }
    expect(body.success).toBe(true)
    expect(body.output.content).toBe("[Mock] via agent api")
  })

  it("should reject invoke with missing action type (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/1/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("invalid_argument")
  })

  it("should return 404 for invoking non-existent agent", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/999/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ type: "shell.run", input: { command: "echo test" } }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain("agent_not_found")
  })

  it("should start an agent", async () => {
    const shell = new AsyncShellService("/tmp")
    const agent = new ShellAgent("3", shell)
    await registry.register(agent)
    const response = await fetch(`http://localhost:${port}/api/agents/3/start`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { started: boolean }
    expect(body.started).toBe(true)
    expect(agent.get_status()).toBe("running")
  })

  it("should stop an agent", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/1/stop`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { stopped: boolean }
    expect(body.stopped).toBe(true)
  })

  it("should delete an agent", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/1`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
    // 验证已删除
    const get_response = await fetch(`http://localhost:${port}/api/agents/1`, { headers })
    expect(get_response.status).toBe(404)
  })

  it("should return 404 for deleting non-existent agent", async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/999`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
  })
})
