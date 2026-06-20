import { describe, test, expect } from "bun:test"
import {
  generate_debug_console_html,
  setup_debug_console_routes,
} from "../../../src/services_entry/entry/api_components/api_debug_console.ts"
import { HttpServer } from "../../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../../src/core_infra/infra/http_client.ts"
import { API_ENDPOINTS } from "../../../src/services_entry/entry/api_components/openapi_spec.ts"
import { CLI_VERSION } from "../../../src/services_entry/entry/cli_sdk/cli_args.ts"

describe("V23 generate_debug_console_html", () => {
  test("should generate valid HTML", () => {
    const html = generate_debug_console_html()
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<html")
    expect(html).toContain("</html>")
    expect(html).toContain("<title>Claude Code Engine - API Debug Console</title>")
  })

  test("should contain version", () => {
    const html = generate_debug_console_html()
    expect(html).toContain(CLI_VERSION)
  })

  test("should contain all endpoint data", () => {
    const html = generate_debug_console_html()
    // HTML 中嵌入了端点 JSON 数据
    for (const ep of API_ENDPOINTS.slice(0, 5)) {
      expect(html).toContain(ep.path)
    }
  })

  test("should contain interactive elements", () => {
    const html = generate_debug_console_html()
    expect(html).toContain("endpointList")
    expect(html).toContain("sendBtn")
    expect(html).toContain("requestPath")
    expect(html).toContain("requestBody")
    expect(html).toContain("responseOutput")
    expect(html).toContain("apiKey")
  })

  test("should contain tag filter buttons", () => {
    const html = generate_debug_console_html()
    expect(html).toContain("tag-btn")
    expect(html).toContain('data-tag="ALL"')
  })

  test("should contain CSS styles for method badges", () => {
    const html = generate_debug_console_html()
    expect(html).toContain("method-GET")
    expect(html).toContain("method-POST")
    expect(html).toContain("method-PUT")
    expect(html).toContain("method-DELETE")
  })

  test("should contain JavaScript for fetch requests", () => {
    const html = generate_debug_console_html()
    expect(html).toContain("fetch(")
    expect(html).toContain("Authorization")
    expect(html).toContain("Bearer")
  })

  test("should include base_url in script", () => {
    const html = generate_debug_console_html("http://localhost:3000")
    expect(html).toContain("http://localhost:3000")
  })
})

describe("V23 setup_debug_console_routes", () => {
  test("should return 2 routes", () => {
    const routes = setup_debug_console_routes()
    expect(routes.length).toBe(2)

    const paths = routes.map((r) => r.path)
    expect(paths).toContain("/api/debug")
    expect(paths).toContain("/api/debug/spec")

    for (const route of routes) {
      expect(route.method).toBe("GET")
      expect(typeof route.handler).toBe("function")
    }
  })
})

describe("V23 debug console integration", () => {
  test("GET /api/debug should return HTML", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_debug_console_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/debug")
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("text/html")
    expect(response.body).toContain("<!DOCTYPE html>")
    expect(response.body).toContain("API Debug Console")

    server.stop()
  })

  test("GET /api/debug/spec should return endpoint list", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_debug_console_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/debug/spec")
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("application/json")
    expect(response.body.total).toBe(API_ENDPOINTS.length)
    expect(response.body.endpoints).toBeDefined()
    expect(response.body.version).toBe(CLI_VERSION)
    expect(Array.isArray(response.body.endpoints)).toBe(true)

    server.stop()
  })

  test("debug console should be accessible without auth", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_debug_console_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    // 不带 Authorization 头也能访问
    const response = await client.get("/api/debug")
    expect(response.status).toBe(200)

    server.stop()
  })
})
