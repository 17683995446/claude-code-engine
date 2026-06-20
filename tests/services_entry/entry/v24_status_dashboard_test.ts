import { describe, test, expect } from "bun:test"
import {
  generate_dashboard_html,
  setup_dashboard_routes,
  DASHBOARD_DATA_SOURCES,
} from "../../../src/services_entry/entry/api_components/status_dashboard.ts"
import { HttpServer } from "../../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../../src/core_infra/infra/http_client.ts"
import { CLI_VERSION } from "../../../src/services_entry/entry/cli_sdk/cli_args.ts"

describe("V24 DASHBOARD_DATA_SOURCES", () => {
  test("should expose data source list", () => {
    expect(Array.isArray(DASHBOARD_DATA_SOURCES)).toBe(true)
    expect(DASHBOARD_DATA_SOURCES.length).toBeGreaterThan(0)
  })

  test("each data source should have required fields", () => {
    for (const src of DASHBOARD_DATA_SOURCES) {
      expect(typeof src.key).toBe("string")
      expect(src.key.length).toBeGreaterThan(0)
      expect(typeof src.label).toBe("string")
      expect(typeof src.path).toBe("string")
      expect(src.path.startsWith("/")).toBe(true)
      expect(["GET", "POST"]).toContain(src.method)
      expect(typeof src.requires_auth).toBe("boolean")
      expect(typeof src.refresh_interval_ms).toBe("number")
      expect(src.refresh_interval_ms).toBeGreaterThan(0)
      expect(typeof src.description).toBe("string")
    }
  })

  test("should include health data source without auth", () => {
    const health = DASHBOARD_DATA_SOURCES.find(s => s.key === "health")
    expect(health).toBeDefined()
    expect(health!.path).toBe("/health")
    expect(health!.requires_auth).toBe(false)
  })

  test("should include agents data source with auth", () => {
    const agents = DASHBOARD_DATA_SOURCES.find(s => s.key === "agents")
    expect(agents).toBeDefined()
    expect(agents!.path).toBe("/api/agents")
    expect(agents!.requires_auth).toBe(true)
  })

  test("should include daemon data source", () => {
    const daemon = DASHBOARD_DATA_SOURCES.find(s => s.key === "daemon")
    expect(daemon).toBeDefined()
    expect(daemon!.path).toBe("/api/daemon/status")
  })

  test("should include sessions data source", () => {
    const sessions = DASHBOARD_DATA_SOURCES.find(s => s.key === "sessions")
    expect(sessions).toBeDefined()
    expect(sessions!.path).toBe("/api/sessions")
  })

  test("all keys should be unique", () => {
    const keys = DASHBOARD_DATA_SOURCES.map(s => s.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

describe("V24 generate_dashboard_html", () => {
  test("should generate valid HTML", () => {
    const html = generate_dashboard_html()
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<html")
    expect(html).toContain("</html>")
    expect(html).toContain("<title>Claude Code Engine - Status Dashboard</title>")
  })

  test("should contain version", () => {
    const html = generate_dashboard_html()
    expect(html).toContain(CLI_VERSION)
  })

  test("should embed data sources JSON", () => {
    const html = generate_dashboard_html()
    for (const src of DASHBOARD_DATA_SOURCES.slice(0, 5)) {
      expect(html).toContain(src.path)
      expect(html).toContain(src.key)
    }
  })

  test("should contain overview section", () => {
    const html = generate_dashboard_html()
    expect(html).toContain('id="overview"')
  })

  test("should contain panels section", () => {
    const html = generate_dashboard_html()
    expect(html).toContain('id="panels"')
  })

  test("should contain auto-refresh controls", () => {
    const html = generate_dashboard_html()
    expect(html).toContain('id="autoRefresh"')
    expect(html).toContain('id="refreshInterval"')
    expect(html).toContain('id="refreshBtn"')
  })

  test("should contain API key input", () => {
    const html = generate_dashboard_html()
    expect(html).toContain('id="apiKey"')
  })

  test("should contain last refresh indicator", () => {
    const html = generate_dashboard_html()
    expect(html).toContain('id="lastRefresh"')
  })

  test("should contain fetch logic for data sources", () => {
    const html = generate_dashboard_html()
    expect(html).toContain("fetch(")
    expect(html).toContain("Authorization")
    expect(html).toContain("Bearer")
  })

  test("should contain status pill styles", () => {
    const html = generate_dashboard_html()
    expect(html).toContain("status-pill")
    expect(html).toContain("running")
  })

  test("should contain stat card styles", () => {
    const html = generate_dashboard_html()
    expect(html).toContain("stat-card")
    expect(html).toContain("health-good")
    expect(html).toContain("health-warn")
    expect(html).toContain("health-bad")
  })

  test("should include base_url in script", () => {
    const html = generate_dashboard_html("http://localhost:3000")
    expect(html).toContain("http://localhost:3000")
  })

  test("should contain panel rendering for each data source", () => {
    const html = generate_dashboard_html()
    // The renderPanelBody function should reference each data source key
    for (const src of DASHBOARD_DATA_SOURCES) {
      expect(html).toContain('"' + src.key + '"')
    }
  })

  test("should contain refresh scheduling logic", () => {
    const html = generate_dashboard_html()
    expect(html).toContain("scheduleRefresh")
    expect(html).toContain("setInterval")
    expect(html).toContain("clearInterval")
  })
})

describe("V24 setup_dashboard_routes", () => {
  test("should return 2 routes", () => {
    const routes = setup_dashboard_routes()
    expect(routes.length).toBe(2)

    const paths = routes.map((r) => r.path)
    expect(paths).toContain("/api/dashboard")
    expect(paths).toContain("/api/dashboard/spec")

    for (const route of routes) {
      expect(route.method).toBe("GET")
      expect(typeof route.handler).toBe("function")
    }
  })
})

describe("V24 dashboard integration", () => {
  test("GET /api/dashboard should return HTML", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_dashboard_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/dashboard")
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("text/html")
    expect(response.body).toContain("<!DOCTYPE html>")
    expect(response.body).toContain("Status Dashboard")

    server.stop()
  })

  test("GET /api/dashboard/spec should return data source list", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_dashboard_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/dashboard/spec")
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("application/json")
    expect(response.body.total).toBe(DASHBOARD_DATA_SOURCES.length)
    expect(response.body.data_sources).toBeDefined()
    expect(response.body.version).toBe(CLI_VERSION)
    expect(Array.isArray(response.body.data_sources)).toBe(true)

    server.stop()
  })

  test("dashboard should be accessible without auth", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_dashboard_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/dashboard")
    expect(response.status).toBe(200)

    server.stop()
  })

  test("dashboard HTML should contain all data source paths", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_dashboard_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/dashboard")
    for (const src of DASHBOARD_DATA_SOURCES) {
      expect(response.body).toContain(src.path)
    }

    server.stop()
  })
})
