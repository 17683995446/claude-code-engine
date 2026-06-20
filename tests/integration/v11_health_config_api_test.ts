import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import {
  auth_middleware,
  rate_limit_middleware,
  DEFAULT_AUTH_CONFIG,
} from "../../src/core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "../../src/core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "../../src/core_infra/infra/http_middlewares.ts"
import {
  setup_health_routes,
  setup_config_routes,
  register_routes,
} from "../../src/services_entry/entry/api_components/api_routes.ts"
import { HealthEndpoint } from "../../src/core_infra/infra/health_endpoint.ts"
import { ConfigManager } from "../../src/services_entry/services/config_manager.ts"

// ============================================================
// V11: /health 和 /api/config 端点集成测试
// ============================================================

const TEST_API_KEY: string = "v11-test-key"

function make_server(): {
  server: HttpServer
  health: HealthEndpoint
  config_mgr: ConfigManager
} {
  const health = new HealthEndpoint()
  const config_mgr = new ConfigManager()

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

  const health_routes = setup_health_routes(health)
  const config_routes = setup_config_routes(config_mgr)
  register_routes(server, [...health_routes, ...config_routes])

  server.start()
  return { server, health, config_mgr }
}

describe("V11 /health integration", () => {
  let server: HttpServer
  let port: number
  let health: HealthEndpoint

  beforeEach(() => {
    const result = make_server()
    server = result.server
    port = server.get_port()
    health = result.health
  })

  afterEach(() => {
    server.stop()
  })

  it("should return health report without auth", async () => {
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe("healthy")
    expect(body.checks).toBeDefined()
    expect(body.uptime_ms).toBeGreaterThanOrEqual(0)
  })

  it("should return liveness without auth", async () => {
    const response = await fetch(`http://localhost:${port}/health/live`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe("healthy")
  })

  it("should return readiness without auth", async () => {
    const response = await fetch(`http://localhost:${port}/health/ready`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe("healthy")
    expect(body.checks).toBeDefined()
  })

  it("should return 503 when unhealthy", async () => {
    health.add_probe("failing", () => false)
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.status).toBe("unhealthy")
  })

  it("should include probe results", async () => {
    health.add_probe("custom", () => true)
    const response = await fetch(`http://localhost:${port}/health`)
    const body = await response.json()
    const custom_check = body.checks.find((c: { name: string }) => c.name === "custom")
    expect(custom_check).toBeDefined()
    expect(custom_check.status).toBe("healthy")
  })

  it("should handle async probes", async () => {
    health.add_probe("async", async () => {
      await new Promise((r) => setTimeout(r, 10))
      return true
    })
    const response = await fetch(`http://localhost:${port}/health`)
    const body = await response.json()
    const async_check = body.checks.find((c: { name: string }) => c.name === "async")
    expect(async_check).toBeDefined()
    expect(async_check.status).toBe("healthy")
    expect(async_check.latency_ms).toBeGreaterThanOrEqual(0)
  })
})

describe("V11 /api/config integration", () => {
  let server: HttpServer
  let port: number
  let config_mgr: ConfigManager
  const headers = { authorization: `Bearer ${TEST_API_KEY}`, "content-type": "application/json" }

  beforeEach(() => {
    const result = make_server()
    server = result.server
    port = server.get_port()
    config_mgr = result.config_mgr
  })

  afterEach(() => {
    server.stop()
  })

  it("should reject without auth (401)", async () => {
    const response = await fetch(`http://localhost:${port}/api/config`)
    expect(response.status).toBe(401)
    response.body?.cancel()
  })

  it("should get empty config", async () => {
    const response = await fetch(`http://localhost:${port}/api/config`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.count).toBe(0)
  })

  it("should set and get config value", async () => {
    const set_response = await fetch(`http://localhost:${port}/api/config/test_key`, {
      method: "POST",
      headers,
      body: JSON.stringify({ value: "test_value" }),
    })
    expect(set_response.status).toBe(200)
    const set_body = await set_response.json()
    expect(set_body.set).toBe(true)

    const get_response = await fetch(`http://localhost:${port}/api/config/test_key`, { headers })
    expect(get_response.status).toBe(200)
    const get_body = await get_response.json()
    expect(get_body.key).toBe("test_key")
    expect(get_body.value).toBe("test_value")
  })

  it("should return 404 for missing key", async () => {
    const response = await fetch(`http://localhost:${port}/api/config/missing`, { headers })
    expect(response.status).toBe(404)
  })

  it("should return 400 when value missing", async () => {
    const response = await fetch(`http://localhost:${port}/api/config/key`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it("should list all config", async () => {
    await fetch(`http://localhost:${port}/api/config/a`, {
      method: "POST",
      headers,
      body: JSON.stringify({ value: 1 }),
    })
    await fetch(`http://localhost:${port}/api/config/b`, {
      method: "POST",
      headers,
      body: JSON.stringify({ value: 2 }),
    })
    const response = await fetch(`http://localhost:${port}/api/config`, { headers })
    const body = await response.json()
    expect(body.count).toBe(2)
    expect(body.config.a).toBe(1)
    expect(body.config.b).toBe(2)
  })

  it("should get config status", async () => {
    const response = await fetch(`http://localhost:${port}/api/config/status`, { headers })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.loaded).toBe(false)
    expect(body.key_count).toBe(0)
  })

  it("should reload config (fail without file)", async () => {
    const response = await fetch(`http://localhost:${port}/api/config/reload`, {
      method: "POST",
      headers,
    })
    expect(response.status).toBe(400)
  })
})
