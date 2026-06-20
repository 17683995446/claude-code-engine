import { describe, test, expect } from "bun:test"
import {
  generate_openapi_spec,
  get_endpoint_list,
  generate_html_docs,
  API_ENDPOINTS,
} from "../../../src/services_entry/entry/api_components/openapi_spec.ts"
import { setup_docs_routes } from "../../../src/services_entry/entry/api_components/api_docs_routes.ts"
import { HttpServer } from "../../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../../src/core_infra/infra/http_client.ts"
import { CLI_VERSION } from "../../../src/services_entry/entry/cli_sdk/cli_args.ts"

describe("V17 API_ENDPOINTS", () => {
  test("should contain all expected endpoints", () => {
    expect(API_ENDPOINTS.length).toBeGreaterThan(40)

    // 验证关键端点存在
    const paths = API_ENDPOINTS.map((e) => e.path)
    expect(paths).toContain("/health")
    expect(paths).toContain("/api/auth/status")
    expect(paths).toContain("/api/messages")
    expect(paths).toContain("/api/agents")
    expect(paths).toContain("/api/tasks")
    expect(paths).toContain("/api/skills")
    expect(paths).toContain("/api/plans")
    expect(paths).toContain("/api/daemon/status")
    expect(paths).toContain("/api/config")
    expect(paths).toContain("/api/docs")
    expect(paths).toContain("/api/openapi.json")
    expect(paths).toContain("/api/endpoints")
  })

  test("each endpoint should have required fields", () => {
    for (const ep of API_ENDPOINTS) {
      expect(ep.method.length).toBeGreaterThan(0)
      expect(ep.path.length).toBeGreaterThan(0)
      expect(ep.summary.length).toBeGreaterThan(0)
      expect(ep.description.length).toBeGreaterThan(0)
      expect(ep.tag.length).toBeGreaterThan(0)
      expect(typeof ep.requires_auth).toBe("boolean")
    }
  })

  test("health endpoints should not require auth", () => {
    const health_endpoints = API_ENDPOINTS.filter((e) => e.tag === "Health")
    expect(health_endpoints.length).toBe(3)
    for (const ep of health_endpoints) {
      expect(ep.requires_auth).toBe(false)
    }
  })

  test("docs endpoints should not require auth", () => {
    const docs_endpoints = API_ENDPOINTS.filter((e) => e.tag === "Docs")
    expect(docs_endpoints.length).toBe(3)
    for (const ep of docs_endpoints) {
      expect(ep.requires_auth).toBe(false)
    }
  })
})

describe("V17 generate_openapi_spec", () => {
  test("should generate valid OpenAPI 3.0 spec", () => {
    const spec = generate_openapi_spec()
    expect(spec.openapi).toBe("3.0.3")
    expect(spec.info.title).toBe("Claude Code Engine API")
    expect(spec.info.version).toBe(CLI_VERSION)
    expect(spec.servers.length).toBe(1)
    expect(spec.servers[0].url).toBe("http://localhost:3000")
  })

  test("should include all endpoint paths", () => {
    const spec = generate_openapi_spec()
    for (const ep of API_ENDPOINTS) {
      expect(spec.paths[ep.path]).toBeDefined()
      expect(spec.paths[ep.path][ep.method.toLowerCase()]).toBeDefined()
    }
  })

  test("each operation should have summary and responses", () => {
    const spec = generate_openapi_spec()
    for (const ep of API_ENDPOINTS) {
      const op = spec.paths[ep.path][ep.method.toLowerCase()]
      expect(op.summary).toBe(ep.summary)
      expect(op.description).toBe(ep.description)
      expect(op.tags).toContain(ep.tag)
      expect(op.responses["200"]).toBeDefined()
      expect(op.responses["400"]).toBeDefined()
      expect(op.responses["500"]).toBeDefined()
    }
  })

  test("auth-required endpoints should have security", () => {
    const spec = generate_openapi_spec()
    const auth_ep = API_ENDPOINTS.find((e) => e.requires_auth)!
    const op = spec.paths[auth_ep.path][auth_ep.method.toLowerCase()]
    expect(op.security).toBeDefined()
    expect(op.security![0]).toHaveProperty("bearerAuth")
  })

  test("public endpoints should not have security", () => {
    const spec = generate_openapi_spec()
    const public_ep = API_ENDPOINTS.find((e) => !e.requires_auth)!
    const op = spec.paths[public_ep.path][public_ep.method.toLowerCase()]
    expect(op.security).toBeUndefined()
  })

  test("should include bearer auth security scheme", () => {
    const spec = generate_openapi_spec()
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined()
    expect(spec.components.securitySchemes.bearerAuth.type).toBe("http")
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe("bearer")
  })

  test("should include error response schema", () => {
    const spec = generate_openapi_spec()
    expect(spec.components.schemas.ErrorResponse).toBeDefined()
    expect(spec.components.schemas.ErrorResponse.properties.error).toBeDefined()
    expect(spec.components.schemas.ErrorResponse.properties.code).toBeDefined()
    expect(spec.components.schemas.ErrorResponse.properties.suggestion).toBeDefined()
  })

  test("should use custom base_url", () => {
    const spec = generate_openapi_spec("http://example.com:8080")
    expect(spec.servers[0].url).toBe("http://example.com:8080")
  })
})

describe("V17 get_endpoint_list", () => {
  test("should return total count and endpoints", () => {
    const list = get_endpoint_list()
    expect(list.total).toBe(API_ENDPOINTS.length)
    expect(list.endpoints).toBe(API_ENDPOINTS)
  })

  test("should return unique tags", () => {
    const list = get_endpoint_list()
    expect(list.tags.length).toBeGreaterThan(0)
    // 验证 tags 是去重且排序的
    const unique_tags = [...new Set(API_ENDPOINTS.map((e) => e.tag))].sort()
    expect(list.tags).toEqual(unique_tags)
  })

  test("should include expected tags", () => {
    const list = get_endpoint_list()
    expect(list.tags).toContain("Health")
    expect(list.tags).toContain("Auth")
    expect(list.tags).toContain("Messages")
    expect(list.tags).toContain("Agents")
    expect(list.tags).toContain("Tasks")
    expect(list.tags).toContain("Skills")
    expect(list.tags).toContain("Plans")
    expect(list.tags).toContain("Daemon")
    expect(list.tags).toContain("Config")
    expect(list.tags).toContain("Docs")
  })
})

describe("V17 generate_html_docs", () => {
  test("should generate valid HTML", () => {
    const html = generate_html_docs()
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<html")
    expect(html).toContain("</html>")
    expect(html).toContain("<title>Claude Code Engine API Documentation</title>")
  })

  test("should include version", () => {
    const html = generate_html_docs()
    expect(html).toContain(CLI_VERSION)
  })

  test("should include base_url", () => {
    const html = generate_html_docs("http://custom:9999")
    expect(html).toContain("http://custom:9999")
  })

  test("should include all endpoint paths", () => {
    const html = generate_html_docs()
    for (const ep of API_ENDPOINTS) {
      expect(html).toContain(ep.path)
    }
  })

  test("should include links to OpenAPI and endpoints", () => {
    const html = generate_html_docs()
    expect(html).toContain('href="/api/openapi.json"')
    expect(html).toContain('href="/api/endpoints"')
    expect(html).toContain('href="/health"')
  })

  test("should include error response documentation", () => {
    const html = generate_html_docs()
    expect(html).toContain("Error Responses")
    expect(html).toContain("suggestion")
  })
})

describe("V17 setup_docs_routes", () => {
  test("should return 3 routes", () => {
    const routes = setup_docs_routes()
    expect(routes.length).toBe(3)

    const paths = routes.map((r) => r.path)
    expect(paths).toContain("/api/docs")
    expect(paths).toContain("/api/openapi.json")
    expect(paths).toContain("/api/endpoints")

    for (const route of routes) {
      expect(route.method).toBe("GET")
      expect(typeof route.handler).toBe("function")
    }
  })
})

describe("V17 docs routes integration", () => {
  test("GET /api/docs should return HTML", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_docs_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/docs")
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("text/html")
    expect(response.body).toContain("<!DOCTYPE html>")

    server.stop()
  })

  test("GET /api/openapi.json should return OpenAPI spec", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_docs_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/openapi.json")
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("application/json")
    expect(response.body.openapi).toBe("3.0.3")
    expect(response.body.info.title).toBe("Claude Code Engine API")
    expect(response.body.paths).toBeDefined()

    server.stop()
  })

  test("GET /api/endpoints should return endpoint list", async () => {
    const server = new HttpServer({ port: 0 })
    const routes = setup_docs_routes()
    for (const route of routes) {
      if (route.method === "GET") {
        server.get(route.path, route.handler)
      }
    }
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const response = await client.get("/api/endpoints")
    expect(response.status).toBe(200)
    expect(response.body.total).toBe(API_ENDPOINTS.length)
    expect(response.body.endpoints).toBeDefined()
    expect(response.body.tags).toBeDefined()
    expect(Array.isArray(response.body.endpoints)).toBe(true)
    expect(Array.isArray(response.body.tags)).toBe(true)

    server.stop()
  })
})
