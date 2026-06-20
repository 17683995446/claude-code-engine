import { describe, it, expect, afterEach } from "bun:test"
import { HttpServer } from "../../src/core_infra/infra/http_server.ts"
import { HttpClient } from "../../src/core_infra/infra/http_client.ts"
import { HttpRouter, type HttpContext } from "../../src/core_infra/infra/http_router.ts"
import {
  logging_middleware,
  cors_middleware,
  error_handler_middleware,
  request_id_middleware,
  json_response,
  text_response,
} from "../../src/core_infra/infra/http_middlewares.ts"

// ============================================================
// U4: 网络层测试
// HTTP server、client、router、middleware
// ============================================================

let server: HttpServer | null = null

afterEach(() => {
  if (server) {
    server.stop()
    server = null
  }
})

// ---- HttpRouter 单元测试 ----
describe("U4 HttpRouter", () => {
  it("should match exact path", async () => {
    const router = new HttpRouter()
    router.get("/hello", () => text_response("world"))

    const ctx: HttpContext = {
      method: "GET",
      path: "/hello",
      query: {},
      headers: {},
      body: null,
      params: {},
      state: {},
    }
    const response = await router.handle(ctx)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("world")
  })

  it("should match path params", async () => {
    const router = new HttpRouter()
    router.get("/users/:id", (ctx) => text_response(`user_${ctx.params.id}`))

    const ctx: HttpContext = {
      method: "GET",
      path: "/users/42",
      query: {},
      headers: {},
      body: null,
      params: {},
      state: {},
    }
    const response = await router.handle(ctx)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("user_42")
  })

  it("should return 404 for unmatched routes", async () => {
    const router = new HttpRouter()
    router.get("/hello", () => text_response("world"))

    const ctx: HttpContext = {
      method: "GET",
      path: "/nonexistent",
      query: {},
      headers: {},
      body: null,
      params: {},
      state: {},
    }
    const response = await router.handle(ctx)
    expect(response.status).toBe(404)
  })

  it("should distinguish methods", async () => {
    const router = new HttpRouter()
    router.get("/item", () => text_response("get"))
    router.post("/item", () => text_response("post"))

    const get_ctx: HttpContext = {
      method: "GET", path: "/item", query: {}, headers: {}, body: null, params: {}, state: {},
    }
    const post_ctx: HttpContext = {
      method: "POST", path: "/item", query: {}, headers: {}, body: null, params: {}, state: {},
    }

    expect(await (await router.handle(get_ctx)).text()).toBe("get")
    expect(await (await router.handle(post_ctx)).text()).toBe("post")
  })

  it("should support multiple params", async () => {
    const router = new HttpRouter()
    router.get("/orgs/:org/repos/:repo", (ctx) =>
      json_response({ org: ctx.params.org, repo: ctx.params.repo }),
    )

    const ctx: HttpContext = {
      method: "GET",
      path: "/orgs/acme/repos/widget",
      query: {},
      headers: {},
      body: null,
      params: {},
      state: {},
    }
    const response = await router.handle(ctx)
    const body = await response.json()
    expect(body).toEqual({ org: "acme", repo: "widget" })
  })

  it("should execute middleware chain", async () => {
    const router = new HttpRouter()
    const order: string[] = []

    router.use(async (_ctx, next) => {
      order.push("mw1_before")
      const r = await next()
      order.push("mw1_after")
      return r
    })
    router.use(async (_ctx, next) => {
      order.push("mw2_before")
      const r = await next()
      order.push("mw2_after")
      return r
    })
    router.get("/test", () => {
      order.push("handler")
      return text_response("ok")
    })

    const ctx: HttpContext = {
      method: "GET", path: "/test", query: {}, headers: {}, body: null, params: {}, state: {},
    }
    await router.handle(ctx)
    expect(order).toEqual(["mw1_before", "mw2_before", "handler", "mw2_after", "mw1_after"])
  })
})

// ---- HTTP Server 集成测试 ----
describe("U4 HttpServer integration", () => {
  it("should serve GET requests", async () => {
    server = new HttpServer({ port: 0 })
    server.get("/hello", () => text_response("world"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/hello")

    expect(response.status).toBe(200)
    expect(response.text).toBe("world")
  })

  it("should serve POST requests with JSON body", async () => {
    server = new HttpServer({ port: 0 })
    server.post("/echo", (ctx) => json_response({ received: ctx.body }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.post("/echo", { message: "hello" })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ received: { message: "hello" } })
  })

  it("should handle path params", async () => {
    server = new HttpServer({ port: 0 })
    server.get("/users/:id", (ctx) => json_response({ id: ctx.params.id }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/users/42")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: "42" })
  })

  it("should return 404 for unknown routes", async () => {
    server = new HttpServer({ port: 0 })
    server.get("/known", () => text_response("ok"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/unknown")

    expect(response.status).toBe(404)
  })

  it("should handle query parameters", async () => {
    server = new HttpServer({ port: 0 })
    server.get("/search", (ctx) => json_response({ q: ctx.query.q, page: ctx.query.page }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/search?q=hello&page=2")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ q: "hello", page: "2" })
  })

  it("should support PUT and DELETE", async () => {
    server = new HttpServer({ port: 0 })
    server.put("/items/:id", (ctx) => json_response({ updated: ctx.params.id }))
    server.delete("/items/:id", (ctx) => json_response({ deleted: ctx.params.id }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    const put_resp = await client.put("/items/5", { name: "updated" })
    expect(put_resp.status).toBe(200)
    expect(put_resp.body).toEqual({ updated: "5" })

    const del_resp = await client.delete("/items/5")
    expect(del_resp.status).toBe(200)
    expect(del_resp.body).toEqual({ deleted: "5" })
  })
})

// ---- 中间件测试 ----
describe("U4 middleware integration", () => {
  it("logging middleware should not break requests", async () => {
    server = new HttpServer({ port: 0 })
    server.use(logging_middleware())
    server.get("/test", () => text_response("ok"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/test")
    expect(response.status).toBe(200)
    expect(response.text).toBe("ok")
  })

  it("CORS middleware should add headers", async () => {
    server = new HttpServer({ port: 0 })
    server.use(cors_middleware())
    server.get("/test", () => text_response("ok"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/test")
    expect(response.status).toBe(200)
    expect(response.headers["access-control-allow-origin"]).toBe("*")
  })

  it("CORS middleware should handle OPTIONS preflight", async () => {
    server = new HttpServer({ port: 0 })
    server.use(cors_middleware())
    server.get("/test", () => text_response("ok"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.request("OPTIONS", "/test")
    expect(response.status).toBe(204)
    expect(response.headers["access-control-allow-origin"]).toBe("*")
    expect(response.headers["access-control-allow-methods"]).toContain("GET")
  })

  it("error handler middleware should catch errors", async () => {
    server = new HttpServer({ port: 0 })
    server.use(error_handler_middleware())
    server.get("/crash", () => {
      throw new Error("handler_crash")
    })
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/crash")
    expect(response.status).toBe(500)
    // V14: 友好错误响应包含 error、code、name、message、description、suggestion
    expect(response.body).toHaveProperty("error", "unknown_error")
    expect(response.body).toHaveProperty("code", 1000)
    expect(response.body).toHaveProperty("name", "UNKNOWN_ERROR")
    expect(response.body).toHaveProperty("message", "handler_crash")
    expect(response.body).toHaveProperty("description")
    expect(response.body).toHaveProperty("suggestion")
  })

  it("request ID middleware should add request ID", async () => {
    server = new HttpServer({ port: 0 })
    server.use(request_id_middleware())
    server.get("/test", () => text_response("ok"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/test")
    expect(response.status).toBe(200)
    expect(response.headers["x-request-id"]).toMatch(/^req_\d+_/)
  })

  it("should compose multiple middlewares", async () => {
    server = new HttpServer({ port: 0 })
    server.use(request_id_middleware())
    server.use(logging_middleware())
    server.use(cors_middleware())
    server.use(error_handler_middleware())
    server.get("/api/:id", (ctx) => json_response({ id: ctx.params.id, req_id: ctx.state.request_id }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/api/42")
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty("id", "42")
    expect(response.body).toHaveProperty("req_id")
    expect(response.headers["x-request-id"]).toBeDefined()
    expect(response.headers["access-control-allow-origin"]).toBe("*")
  })
})

// ---- HTTP Client 测试 ----
describe("U4 HttpClient", () => {
  it("should send and receive JSON", async () => {
    server = new HttpServer({ port: 0 })
    server.post("/data", (ctx) => json_response({ echo: ctx.body }))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.post("/data", { key: "value" })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ echo: { key: "value" } })
  })

  it("should send default headers", async () => {
    server = new HttpServer({ port: 0 })
    server.get("/headers", (ctx) => json_response({ custom: ctx.headers["x-custom"] }))
    server.start()

    const client = new HttpClient({
      base_url: `http://localhost:${server.get_port()}`,
      default_headers: { "x-custom": "my_value" },
    })
    const response = await client.get("/headers")
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ custom: "my_value" })
  })

  it("should handle 404 response", async () => {
    server = new HttpServer({ port: 0 })
    server.get("/exists", () => text_response("ok"))
    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })
    const response = await client.get("/missing")
    expect(response.status).toBe(404)
    expect(response.ok).toBe(false)
  })
})

// ---- 端到端 API 测试 ----
describe("U4 end-to-end API", () => {
  it("should handle full CRUD lifecycle", async () => {
    server = new HttpServer({ port: 0 })
    server.use(error_handler_middleware())
    server.use(request_id_middleware())

    const items: Map<string, Record<string, unknown>> = new Map()

    // Create
    server.post("/items", (ctx) => {
      const body = ctx.body as Record<string, unknown>
      const id = String(body.id ?? Date.now())
      items.set(id, body)
      return json_response({ created: id }, 201)
    })

    // Read
    server.get("/items/:id", (ctx) => {
      const item = items.get(ctx.params.id)
      if (!item) {
        return json_response({ error: "not_found" }, 404)
      }
      return json_response(item)
    })

    // Update
    server.put("/items/:id", (ctx) => {
      const body = ctx.body as Record<string, unknown>
      items.set(ctx.params.id, body)
      return json_response({ updated: ctx.params.id })
    })

    // Delete
    server.delete("/items/:id", (ctx) => {
      items.delete(ctx.params.id)
      return json_response({ deleted: ctx.params.id })
    })

    // List
    server.get("/items", () => {
      return json_response(Array.from(items.entries()).map(([id, v]) => ({ id, ...v })))
    })

    server.start()

    const client = new HttpClient({ base_url: `http://localhost:${server.get_port()}` })

    // Create
    const create_resp = await client.post("/items", { id: "1", name: "alice" })
    expect(create_resp.status).toBe(201)
    expect(create_resp.body).toEqual({ created: "1" })

    // Read
    const read_resp = await client.get("/items/1")
    expect(read_resp.status).toBe(200)
    expect(read_resp.body).toEqual({ id: "1", name: "alice" })

    // Update
    const update_resp = await client.put("/items/1", { id: "1", name: "bob" })
    expect(update_resp.status).toBe(200)

    // Read updated
    const read2_resp = await client.get("/items/1")
    expect(read2_resp.body).toEqual({ id: "1", name: "bob" })

    // List
    const list_resp = await client.get("/items")
    expect(list_resp.status).toBe(200)
    expect(list_resp.body).toHaveLength(1)

    // Delete
    const del_resp = await client.delete("/items/1")
    expect(del_resp.status).toBe(200)

    // Read deleted
    const read3_resp = await client.get("/items/1")
    expect(read3_resp.status).toBe(404)
  })
})
