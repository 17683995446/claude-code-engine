import { log_info, log_warn } from "./global_logger.ts"

/**
 * HTTP 请求方法类型。
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"

/**
 * HTTP 请求上下文。
 */
export interface HttpContext {
  method: HttpMethod
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  params: Record<string, string>
  state: Record<string, unknown>
  remote_addr: string
}

/**
 * HTTP 处理函数。
 */
export type HttpHandler = (ctx: HttpContext) => Promise<Response> | Response

/**
 * 中间件函数。
 */
export type HttpMiddleware = (ctx: HttpContext, next: () => Promise<Response>) => Promise<Response>

/**
 * 路由条目。
 */
interface Route {
  method: HttpMethod
  pattern: string
  regex: RegExp
  param_names: string[]
  handler: HttpHandler
}

/**
 * HttpRouter - HTTP 路由器。
 *
 * 支持路径参数（如 /users/:id）、HTTP 方法区分、中间件链。
 */
export class HttpRouter {
  private routes: Route[] = []
  private middlewares: HttpMiddleware[] = []

  use(middleware: HttpMiddleware): void {
    log_info("router_use_middleware")
    this.middlewares.push(middleware)
  }

  add(method: HttpMethod, pattern: string, handler: HttpHandler): void {
    log_info(`router_add: ${method} ${pattern}`)
    const param_names: string[] = []
    const regex_str: string = pattern.replace(/:([^/]+)/g, (_, name) => {
      param_names.push(name)
      return "([^/]+)"
    })
    const regex: RegExp = new RegExp(`^${regex_str}$`)
    this.routes.push({ method, pattern, regex, param_names, handler })
  }

  get(pattern: string, handler: HttpHandler): void {
    this.add("GET", pattern, handler)
  }

  post(pattern: string, handler: HttpHandler): void {
    this.add("POST", pattern, handler)
  }

  put(pattern: string, handler: HttpHandler): void {
    this.add("PUT", pattern, handler)
  }

  delete(pattern: string, handler: HttpHandler): void {
    this.add("DELETE", pattern, handler)
  }

  async handle(ctx: HttpContext): Promise<Response> {
    log_info(`router_handle: ${ctx.method} ${ctx.path}`)

    // 查找匹配路由
    let matched_route: Route | undefined
    for (const route of this.routes) {
      if (route.method !== ctx.method) {
        continue
      }
      const match = route.regex.exec(ctx.path)
      if (match) {
        matched_route = route
        for (let i = 0; i < route.param_names.length; i++) {
          ctx.params[route.param_names[i]] = match[i + 1]
        }
        break
      }
    }

    // 构建处理函数：有匹配路由则执行 handler，否则返回 404
    const not_found = (): Response => {
      log_warn(`router_not_found: ${ctx.method} ${ctx.path}`)
      return new Response("Not Found", { status: 404 })
    }

    let handler: () => Promise<Response> = () => {
      if (matched_route) {
        return matched_route.handler(ctx)
      }
      return Promise.resolve(not_found())
    }

    // 构建中间件链（中间件始终执行，即使没有匹配路由）
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i]
      const next = handler
      handler = () => mw(ctx, next)
    }

    return handler()
  }

  get_route_count(): number {
    return this.routes.length
  }
}
