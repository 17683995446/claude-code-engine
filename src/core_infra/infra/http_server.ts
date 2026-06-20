import { log_info, log_warn, log_error } from "./global_logger.ts"
import { HttpRouter, type HttpContext, type HttpMethod, type HttpMiddleware } from "./http_router.ts"

/**
 * HTTP 服务器配置。
 */
export interface HttpServerConfig {
  port: number
  hostname?: string
}

/**
 * HttpServer - HTTP 服务器。
 *
 * 基于 Bun.serve 实现，集成路由和中间件。
 */
export class HttpServer {
  private router: HttpRouter
  private config: HttpServerConfig
  private server: ReturnType<typeof Bun.serve> | null = null
  private middlewares: HttpMiddleware[] = []

  constructor(config: HttpServerConfig) {
    log_info(`http_server_created: port=${config.port}`)
    this.config = config
    this.router = new HttpRouter()
  }

  use(middleware: HttpMiddleware): void {
    log_info("http_server_use_middleware")
    this.router.use(middleware)
  }

  get(pattern: string, handler: (ctx: HttpContext) => Promise<Response> | Response): void {
    this.router.get(pattern, handler)
  }

  post(pattern: string, handler: (ctx: HttpContext) => Promise<Response> | Response): void {
    this.router.post(pattern, handler)
  }

  put(pattern: string, handler: (ctx: HttpContext) => Promise<Response> | Response): void {
    this.router.put(pattern, handler)
  }

  delete(pattern: string, handler: (ctx: HttpContext) => Promise<Response> | Response): void {
    this.router.delete(pattern, handler)
  }

  start(): void {
    log_info(`http_server_start: ${this.config.hostname ?? "0.0.0.0"}:${this.config.port}`)
    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.hostname,
      fetch: async (req: Request): Promise<Response> => {
        return this.handle_request(req)
      },
    })
    log_info(`http_server_listening: ${this.server.port}`)
  }

  stop(): void {
    log_info("http_server_stop")
    if (this.server) {
      this.server.stop()
      this.server = null
    }
  }

  get_port(): number {
    return this.server?.port ?? this.config.port
  }

  private async handle_request(req: Request): Promise<Response> {
    const url = new URL(req.url)
    log_info(`http_request: ${req.method} ${url.pathname}`)

    const ctx: HttpContext = {
      method: req.method as HttpMethod,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(req.headers),
      body: null,
      params: {},
      state: {},
      remote_addr: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    }

    // 解析请求体
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      const content_type = req.headers.get("content-type") ?? ""
      if (content_type.includes("application/json")) {
        try {
          ctx.body = await req.json()
        } catch (e) {
          log_warn(`http_body_parse_failed: ${e}`)
          ctx.body = null
        }
      } else {
        try {
          ctx.body = await req.text()
        } catch {
          ctx.body = null
        }
      }
    }

    try {
      const response = await this.router.handle(ctx)
      return response
    } catch (e) {
      log_error(`http_handler_error: ${e}`)
      return new Response(`Internal Server Error: ${e}`, { status: 500 })
    }
  }
}
