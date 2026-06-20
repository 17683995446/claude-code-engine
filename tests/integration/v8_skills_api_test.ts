import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_skill_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { SkillRegistry } from "../../src/services_entry/services/skill_registry.ts"
import { ShellExecuteSkill, ChatCompleteSkill, EchoSkill } from "../../src/services_entry/services/skills.ts"
import { AsyncShellService } from "../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../src/services_entry/services/llm_adapters.ts"
import type { SkillDefinition } from "../../src/core_infra/core/i_skill.ts"

// ============================================================
// V8: /api/skills 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v8-skill-test-key"

async function make_server(): Promise<{ server: HttpServer; registry: SkillRegistry }> {
  const shell = new AsyncShellService("/tmp")
  const llm = new MockLlmAdapter("mock-skill-api")
  const registry = new SkillRegistry()
  await registry.register(new ShellExecuteSkill(shell))
  await registry.register(new ChatCompleteSkill(llm))
  await registry.register(new EchoSkill())

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

  const skill_routes = setup_skill_routes(registry)
  register_routes(server, skill_routes)

  server.start()
  return { server, registry }
}

describe("V8 /api/skills integration", () => {
  let server: HttpServer
  let port: number
  let registry: SkillRegistry
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(async () => {
    const result = await make_server()
    server = result.server
    port = server.get_port()
    registry = result.registry
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject without auth (401)", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills`)
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should list all skills", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { skills: Array<{ id: string }>; count: number }
    expect(body.count).toBe(3)
    const ids = body.skills.map((s) => s.id).sort()
    expect(ids).toEqual(["chat.complete", "echo", "shell.execute"])
  })

  it("should get skill definition by ID", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/echo`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { metadata: { id: string }; input_schema: unknown[] }
    expect(body.metadata.id).toBe("echo")
    expect(body.input_schema.length).toBe(1)
  })

  it("should return 404 for non-existent skill", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/nonexistent`, { headers })
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("not_found")
  })

  it("should invoke echo skill", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/echo/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ input: { message: "via-api" } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; output: { echoed: string } }
    expect(body.success).toBe(true)
    expect(body.output.echoed).toBe("via-api")
  })

  it("should invoke shell.execute skill", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/shell.execute/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ input: { command: "echo skill-shell", timeout_ms: 5000 } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; output: { stdout: string } }
    expect(body.success).toBe(true)
    expect(body.output.stdout.trim()).toBe("skill-shell")
  })

  it("should return 400 for invalid skill input", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/echo/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain("missing_required_parameter")
  })

  it("should return 400 for invoking non-existent skill", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/nonexistent/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain("skill_not_found")
  })

  it("should learn a new composite skill (201)", async () => {
    const def: SkillDefinition = {
      metadata: {
        id: "learned.api-echo-twice",
        name: "ApiEchoTwice",
        version: "1.0.0",
        description: "Echo twice via API",
        category: "composite",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "message", type: "string", required: true, description: "" },
      ],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "s1", skill_id: "echo", input: { message: "${input.message}" }, depends_on: [] },
        { id: "s2", skill_id: "echo", input: { message: "${input.message}" }, depends_on: [] },
      ],
      output_mapping: {
        first: "${s1.output.echoed}",
        second: "${s2.output.echoed}",
      },
    }
    const response = await fetch(`http://localhost:${port}/api/skills/learn`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(def),
    })
    expect(response.status).toBe(201)
    const body = await response.json() as { id: string; skill: { metadata: { id: string } } }
    expect(body.id).toBe("learned.api-echo-twice")
    expect(body.skill.metadata.id).toBe("learned.api-echo-twice")
  })

  it("should invoke a learned composite skill", async () => {
    const def: SkillDefinition = {
      metadata: {
        id: "learned.api-pipeline",
        name: "ApiPipeline",
        version: "1.0.0",
        description: "",
        category: "composite",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "command", type: "string", required: true, description: "" },
      ],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "run", skill_id: "shell.execute", input: { command: "${input.command}", timeout_ms: 5000 }, depends_on: [] },
        { id: "echo", skill_id: "echo", input: { message: "${run.output.stdout}" }, depends_on: ["run"] },
      ],
      output_mapping: {
        stdout: "${run.output.stdout}",
        echoed: "${echo.output.echoed}",
      },
    }
    await fetch(`http://localhost:${port}/api/skills/learn`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(def),
    })
    const response = await fetch(`http://localhost:${port}/api/skills/learned.api-pipeline/invoke`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ input: { command: "echo composed" } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; output: { stdout: string; echoed: string } }
    expect(body.success).toBe(true)
    expect(body.output.stdout.trim()).toBe("composed")
    expect(body.output.echoed.trim()).toBe("composed")
  })

  it("should reject learn with missing metadata (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/learn`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ handler_type: "composite" }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string; message: string }
    expect(body.message).toBe("metadata_id_required")
  })

  it("should reject learn with invalid composite (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/learn`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        metadata: { id: "bad", name: "Bad", version: "1.0.0", description: "", category: "x", builtin: false, created_at: Date.now() },
        input_schema: [],
        output_schema: [],
        handler_type: "builtin",
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { message: string }
    expect(body.message).toContain("learn_skill_requires_composite_handler")
  })

  it("should delete a learned skill", async () => {
    const def: SkillDefinition = {
      metadata: {
        id: "learned.deletable",
        name: "Deletable",
        version: "1.0.0",
        description: "",
        category: "composite",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "s1", skill_id: "echo", input: { message: "x" }, depends_on: [] },
      ],
      output_mapping: { out: "${s1.output.echoed}" },
    }
    await fetch(`http://localhost:${port}/api/skills/learn`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(def),
    })
    const response = await fetch(`http://localhost:${port}/api/skills/learned.deletable`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
    // 验证已删除
    const get_response = await fetch(`http://localhost:${port}/api/skills/learned.deletable`, { headers })
    expect(get_response.status).toBe(404)
  })

  it("should not delete builtin skill (404)", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/echo`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string; message: string }
    expect(body.message).toBe("skill_not_found_or_builtin")
  })

  it("should return 404 for deleting non-existent skill", async () => {
    const response = await fetch(`http://localhost:${port}/api/skills/nonexistent`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
  })
})
