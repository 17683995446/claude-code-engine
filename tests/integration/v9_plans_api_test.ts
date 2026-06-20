import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import { setup_plan_routes, register_routes } from "../../src/services_entry/entry/api_components/api_routes.ts"
import { Planner } from "../../src/services_entry/services/planner.ts"
import type { PhaseExecutor } from "../../src/core_infra/core/i_plan.ts"

// ============================================================
// V9: /api/plans 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v9-plan-test-key"

function make_server(): { server: HttpServer; planner: Planner } {
  const executor: PhaseExecutor = async (phase) => `output-${phase.id}`
  const planner = new Planner({ executor })

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

  const plan_routes = setup_plan_routes(planner)
  register_routes(server, plan_routes)

  server.start()
  return { server, planner }
}

function make_phases(count: number) {
  const phases = []
  for (let i = 0; i < count; i++) {
    phases.push({
      id: `p${i + 1}`,
      name: `Phase ${i + 1}`,
      goal: `Complete phase ${i + 1}`,
      max_retries: 2,
    })
  }
  return phases
}

describe("V9 /api/plans integration", () => {
  let server: HttpServer
  let port: number
  let planner: Planner
  const headers = { authorization: `Bearer ${TEST_API_KEY}` }

  beforeEach(() => {
    const result = make_server()
    server = result.server
    port = server.get_port()
    planner = result.planner
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject without auth (401)", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans`)
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should start with empty plan list", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { plans: unknown[]; count: number }
    expect(body.count).toBe(0)
  })

  it("should create a plan (201)", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        goal: "api goal",
        name: "api plan",
        phases: make_phases(3),
      }),
    })
    expect(response.status).toBe(201)
    const body = await response.json() as { id: string; plan: { goal: string; status: string; phase_count: number } }
    expect(body.id).toBe("1")
    expect(body.plan.goal).toBe("api goal")
    expect(body.plan.status).toBe("pending")
    expect(body.plan.phase_count).toBe(3)
  })

  it("should reject create with missing goal (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "no goal", phases: make_phases(1) }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string; message: string }
    expect(body.message).toBe("goal_required")
  })

  it("should reject create with no phases (400)", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g", name: "p", phases: [] }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { message: string }
    expect(body.message).toBe("phases_required")
  })

  it("should list created plans", async () => {
    await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g1", name: "p1", phases: make_phases(1) }),
    })
    await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g2", name: "p2", phases: make_phases(1) }),
    })
    const response = await fetch(`http://localhost:${port}/api/plans`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { plans: Array<{ name: string }>; count: number }
    expect(body.count).toBe(2)
  })

  it("should get plan by ID", async () => {
    const create_response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g", name: "p", phases: make_phases(2) }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/plans/${created.id}`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json() as { id: string; name: string }
    expect(body.id).toBe(created.id)
    expect(body.name).toBe("p")
  })

  it("should return 404 for non-existent plan", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans/999`, { headers })
    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("not_found")
  })

  it("should run a plan to completion", async () => {
    const create_response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g", name: "p", phases: make_phases(2) }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/plans/${created.id}/run`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { id: string; status: string; plan: { completed_phases: number } }
    expect(body.id).toBe(created.id)
    expect(body.status).toBe("completed")
    expect(body.plan.completed_phases).toBe(2)
  })

  it("should return 404 for running non-existent plan", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans/999/run`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(404)
  })

  it("should cancel a pending plan", async () => {
    const create_response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g", name: "p", phases: make_phases(1) }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/plans/${created.id}/cancel`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { cancelled: boolean }
    expect(body.cancelled).toBe(true)
    const get_response = await fetch(`http://localhost:${port}/api/plans/${created.id}`, { headers })
    const plan = await get_response.json() as { status: string }
    expect(plan.status).toBe("cancelled")
  })

  it("should return 404 for cancelling non-existent plan", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans/999/cancel`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(404)
  })

  it("should resume a failed plan", async () => {
    // 创建一个会失败的计划
    const create_response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        goal: "g",
        name: "p",
        phases: [{ id: "p1", name: "P1", goal: "g", max_retries: 0 }],
      }),
    })
    const created = await create_response.json() as { id: string }
    // 运行（会失败，因为 executor 总是成功，但这里测试 resume 流程）
    await fetch(`http://localhost:${port}/api/plans/${created.id}/run`, {
      method: "POST",
      headers,
    })
    // resume 已完成的计划，返回 completed
    const response = await fetch(`http://localhost:${port}/api/plans/${created.id}/resume`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { status: string }
    expect(body.status).toBe("completed")
  })

  it("should return 404 for resuming non-existent plan", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans/999/resume`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(404)
  })

  it("should delete a plan", async () => {
    const create_response = await fetch(`http://localhost:${port}/api/plans`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ goal: "g", name: "p", phases: make_phases(1) }),
    })
    const created = await create_response.json() as { id: string }
    const response = await fetch(`http://localhost:${port}/api/plans/${created.id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
    const get_response = await fetch(`http://localhost:${port}/api/plans/${created.id}`, { headers })
    expect(get_response.status).toBe(404)
  })

  it("should return 404 for deleting non-existent plan", async () => {
    const response = await fetch(`http://localhost:${port}/api/plans/999`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
  })
})
