import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_task_routes, setup_agent_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { TaskOrchestrator } from "../../src/services_entry/services/task_orchestrator.ts"
import { AgentRegistry } from "../../src/services_entry/services/agent_registry.ts"
import { ShellAgent, ChatAgent } from "../../src/services_entry/services/agents.ts"
import { AsyncShellService, AsyncMessageService } from "../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../src/services_entry/services/llm_adapters.ts"
import type { TaskStep } from "../../src/core_infra/core/i_task.ts"

// ============================================================
// V7: /api/tasks 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v7-task-test-key"

function make_server(): {
  server: HttpServer
  orchestrator: TaskOrchestrator
  registry: AgentRegistry
  shell_id: string
  chat_id: string
} {
  const shell = new AsyncShellService("/tmp")
  const llm = new MockLlmAdapter("mock-task-api")
  const messages = new AsyncMessageService()
  const registry = new AgentRegistry()
  const shell_agent = new ShellAgent("shell-1", shell)
  const chat_agent = new ChatAgent("chat-1", llm, messages)
  // 同步注册（在 server 启动前完成）
  // 注意：register 是 async，这里用 void 启动但测试中会 await
  const orchestrator = new TaskOrchestrator(registry)

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
  const task_routes = setup_task_routes(orchestrator)
  register_routes(server, [...agent_routes, ...task_routes])

  server.start()
  return { server, orchestrator, registry, shell_id: "shell-1", chat_id: "chat-1" }
}

describe("V7 /api/tasks integration", () => {
  let server: HttpServer
  let port: number
  let orchestrator: TaskOrchestrator
  let registry: AgentRegistry
  let shell_id: string
  let chat_id: string
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(async () => {
    const result = make_server()
    server = result.server
    port = server.get_port()
    orchestrator = result.orchestrator
    registry = result.registry
    shell_id = result.shell_id
    chat_id = result.chat_id
    // 预注册并启动 Agent
    const shell = new AsyncShellService("/tmp")
    const llm = new MockLlmAdapter("mock-pre-task")
    const messages = new AsyncMessageService()
    const shell_agent = new ShellAgent(shell_id, shell)
    const chat_agent = new ChatAgent(chat_id, llm, messages)
    await registry.register(shell_agent)
    await registry.register(chat_agent)
    await registry.start_agent(shell_id)
    await registry.start_agent(chat_id)
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject without auth (401)", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks`)
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should start with empty task list", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { tasks: unknown[]; count: number }
    expect(body.count).toBe(0)
    expect(body.tasks.length).toBe(0)
  })

  it("should create a task (201)", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo api", timeout_ms: 5000 }, depends_on: [] },
    ]
    const response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "api-task", description: "via api", steps }),
    })
    expect(response.status).toBe(201)
    const body = await response.json() as { id: string; task: { name: string; status: string; step_count: number } }
    expect(body.id).toBe("1")
    expect(body.task.name).toBe("api-task")
    expect(body.task.status).toBe("pending")
    expect(body.task.step_count).toBe(1)
  })

  it("should reject create with missing name (400)", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo x", timeout_ms: 5000 }, depends_on: [] },
    ]
    const response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ description: "no name", steps }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string; message: string }
    expect(body.error).toBe("invalid_argument")
    expect(body.message).toBe("name_required")
  })

  it("should reject create with empty steps (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "empty", steps: [] }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string; message: string }
    expect(body.message).toBe("steps_required")
  })

  it("should reject create with invalid DAG (400)", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo a", timeout_ms: 5000 }, depends_on: ["s2"] },
      { id: "s2", agent_id: shell_id, action_type: "shell.run", input: { command: "echo b", timeout_ms: 5000 }, depends_on: ["s1"] },
    ]
    const response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "circular", steps }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string; message: string }
    expect(body.message).toContain("circular_dependency_detected")
  })

  it("should list created tasks", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo a", timeout_ms: 5000 }, depends_on: [] },
    ]
    await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "task-a", steps }),
    })
    await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "task-b", steps }),
    })
    const response = await fetch(`http://localhost:${port}/api/tasks`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { tasks: Array<{ name: string }>; count: number }
    expect(body.count).toBe(2)
  })

  it("should get task by ID", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo get", timeout_ms: 5000 }, depends_on: [] },
    ]
    const create_response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "get-task", steps }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/tasks/${created.id}`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { id: string; name: string }
    expect(body.id).toBe(created.id)
    expect(body.name).toBe("get-task")
  })

  it("should return 404 for non-existent task", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks/999`, { headers })
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("not_found")
  })

  it("should run a task to completion", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo run-api", timeout_ms: 5000 }, depends_on: [] },
    ]
    const create_response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "run-task", steps }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/tasks/${created.id}/run`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { id: string; status: string; task: { completed_steps: number } }
    expect(body.id).toBe(created.id)
    expect(body.status).toBe("completed")
    expect(body.task.completed_steps).toBe(1)
  })

  it("should run a multi-step DAG task", async () => {
    const steps: TaskStep[] = [
      { id: "a", agent_id: shell_id, action_type: "shell.run", input: { command: "echo a", timeout_ms: 5000 }, depends_on: [] },
      { id: "b", agent_id: chat_id, action_type: "chat.send", input: { message: "step b" }, depends_on: [] },
      { id: "c", agent_id: shell_id, action_type: "shell.run", input: { command: "echo c", timeout_ms: 5000 }, depends_on: ["a", "b"] },
    ]
    const create_response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "dag-task", steps }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/tasks/${created.id}/run`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { status: string; task: { completed_steps: number } }
    expect(body.status).toBe("completed")
    expect(body.task.completed_steps).toBe(3)
  })

  it("should return 404 for running non-existent task", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks/999/run`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("not_found")
  })

  it("should cancel a pending task", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo cancel", timeout_ms: 5000 }, depends_on: [] },
    ]
    const create_response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "cancel-task", steps }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/tasks/${created.id}/cancel`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { cancelled: boolean }
    expect(body.cancelled).toBe(true)
    // 验证状态
    const get_response = await fetch(`http://localhost:${port}/api/tasks/${created.id}`, { headers })
    const task = await get_response.json() as { status: string }
    expect(task.status).toBe("cancelled")
  })

  it("should return 404 for cancelling non-existent task", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks/999/cancel`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(404)
  })

  it("should delete a task", async () => {
    const steps: TaskStep[] = [
      { id: "s1", agent_id: shell_id, action_type: "shell.run", input: { command: "echo del", timeout_ms: 5000 }, depends_on: [] },
    ]
    const create_response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "del-task", steps }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/tasks/${created.id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
    // 验证已删除
    const get_response = await fetch(`http://localhost:${port}/api/tasks/${created.id}`, { headers })
    expect(get_response.status).toBe(404)
  })

  it("should return 404 for deleting non-existent task", async () => {
    const response = await fetch(`http://localhost:${port}/api/tasks/999`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
  })

  it("should handle fault tolerance: failed step cascades to dependents", async () => {
    const steps: TaskStep[] = [
      { id: "failing", agent_id: shell_id, action_type: "unknown.action", input: {}, depends_on: [] },
      { id: "dependent", agent_id: shell_id, action_type: "shell.run", input: { command: "echo dep", timeout_ms: 5000 }, depends_on: ["failing"] },
      { id: "independent", agent_id: shell_id, action_type: "shell.run", input: { command: "echo indep", timeout_ms: 5000 }, depends_on: [] },
    ]
    const create_response = await fetch(`http://localhost:${port}/api/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "fault-task", steps }),
    })
    const created = await create_response.json() as { id: string }
    const run_response = await fetch(`http://localhost:${port}/api/tasks/${created.id}/run`, {
      method: "POST",
      headers,
    })
    const body = await run_response.json() as { status: string; task: { completed_steps: number } }
    expect(body.status).toBe("failed")
    // independent 完成，dependent 取消，failing 失败 → completed_steps = 1
    expect(body.task.completed_steps).toBe(1)
  })
})
