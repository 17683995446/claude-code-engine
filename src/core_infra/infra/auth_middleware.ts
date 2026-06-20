import { log_info, log_warn } from "./global_logger.ts"
import { json_response } from "./http_middlewares.ts"
import { TokenBucketLimiter } from "./token_bucket_limiter.ts"
import type { HttpContext, HttpMiddleware } from "./http_router.ts"

/**
 * HTTP 鉴权与速率限制中间件（V2）。
 *
 * 提供：
 *   - Bearer Token / API Key 鉴权
 *   - 基于 TokenBucketLimiter 的速率限制（按客户端 IP）
 *   - 公开端点白名单（如 /health、/ready 不需鉴权）
 *   - 鉴权失败审计日志
 *
 * 同时保留原 AuthMiddleware 类（简单 token 校验器）供独立使用与旧测试兼容。
 */

/**
 * AuthMiddleware - 简单的 token 校验器（独立工具类）。
 *
 * 维护一组合法 token，提供 add_valid_token / check 接口。
 * 不依赖 HttpContext，可在非 HTTP 场景下独立使用。
 */
export class AuthMiddleware {
  private valid_tokens: Set<string> = new Set()

  add_valid_token(token: string): void {
    if (token && token.length > 0) {
      this.valid_tokens.add(token)
    }
  }

  check(token: string | null | undefined): boolean {
    if (token === null || token === undefined) {
      return false
    }
    return this.valid_tokens.has(token)
  }
}

export interface AuthMiddlewareConfig {
  /** 合法的 API Key 集合（Bearer token 值） */
  api_keys: Set<string>
  /** 不需要鉴权的路径前缀（如 /health、/ready、/metrics） */
  public_paths: string[]
  /** 是否启用速率限制 */
  rate_limit_enabled: boolean
  /** 速率限制：最大令牌数 */
  rate_limit_max: number
  /** 速率限制：令牌补充间隔（ms） */
  rate_limit_refill_ms: number
}

export const DEFAULT_AUTH_CONFIG: AuthMiddlewareConfig = {
  api_keys: new Set<string>(),
  public_paths: ["/health", "/ready", "/metrics"],
  rate_limit_enabled: true,
  rate_limit_max: 100,
  rate_limit_refill_ms: 1000,
}

/**
 * 鉴权中间件工厂。
 *
 * 校验 Authorization: Bearer <token> 头，token 必须在 api_keys 集合中。
 * 公开端点（public_paths）跳过鉴权。
 *
 * @param config 鉴权配置
 */
export function auth_middleware(config: AuthMiddlewareConfig): HttpMiddleware {
  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    // 公开端点跳过鉴权
    for (const prefix of config.public_paths) {
      if (ctx.path === prefix || ctx.path.startsWith(prefix + "/")) {
        return next()
      }
    }

    // 提取 Authorization 头（headers 是 Record<string, string>，键名小写）
    const auth_header: string | undefined = ctx.headers["authorization"]
    if (!auth_header) {
      log_warn(`auth_missing: ${ctx.method} ${ctx.path} ip=${ctx.remote_addr}`)
      return json_response(
        { error: "unauthorized", message: "missing_authorization_header" },
        401,
      )
    }

    // 校验 Bearer token
    const token: string | null = extract_bearer_token(auth_header)
    if (!token) {
      log_warn(`auth_invalid_format: ${ctx.method} ${ctx.path}`)
      return json_response(
        { error: "unauthorized", message: "invalid_authorization_format" },
        401,
      )
    }

    if (!config.api_keys.has(token)) {
      log_warn(`auth_invalid_token: ${ctx.method} ${ctx.path} token=${token.slice(0, 8)}...`)
      return json_response(
        { error: "unauthorized", message: "invalid_api_key" },
        401,
      )
    }

    // 鉴权通过，存入 ctx.state 供后续使用
    ctx.state["api_key"] = token
    log_info(`auth_ok: ${ctx.method} ${ctx.path}`)
    return next()
  }
}

/**
 * 速率限制中间件工厂。
 *
 * 按客户端 IP 维护独立的 TokenBucketLimiter。
 * 超出限制返回 429 Too Many Requests。
 *
 * @param config 鉴权配置（复用速率限制参数）
 */
export function rate_limit_middleware(config: AuthMiddlewareConfig): HttpMiddleware {
  const buckets: Map<string, TokenBucketLimiter> = new Map()

  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    if (!config.rate_limit_enabled) {
      return next()
    }

    const client_ip: string = ctx.remote_addr || "unknown"
    let bucket: TokenBucketLimiter | undefined = buckets.get(client_ip)
    if (!bucket) {
      bucket = new TokenBucketLimiter(config.rate_limit_max, config.rate_limit_refill_ms)
      buckets.set(client_ip, bucket)
    }

    if (!bucket.try_acquire()) {
      log_warn(`rate_limited: ${ctx.method} ${ctx.path} ip=${client_ip}`)
      return json_response(
        {
          error: "too_many_requests",
          message: "rate_limit_exceeded",
          retry_after_ms: config.rate_limit_refill_ms,
        },
        429,
      )
    }

    ctx.state["rate_limit_remaining"] = bucket.remaining()
    const response: Response = await next()
    response.headers.set("x-ratelimit-remaining", String(bucket.remaining()))
    return response
  }
}

/**
 * 从 Authorization 头提取 Bearer token。
 * 支持 "Bearer <token>" 和 "ApiKey <token>" 格式。
 */
function extract_bearer_token(header: string): string | null {
  const parts: string[] = header.split(" ")
  if (parts.length !== 2) {
    return null
  }
  const scheme: string = parts[0].toLowerCase()
  if (scheme !== "bearer" && scheme !== "apikey") {
    return null
  }
  const token: string = parts[1].trim()
  if (token.length === 0) {
    return null
  }
  return token
}

/**
 * 从环境变量加载 API Keys。
 *
 * 格式：API_KEYS=key1,key2,key3
 * 若未设置，返回空集合（此时所有非公开端点都将被拒绝）。
 */
export function load_api_keys_from_env(): Set<string> {
  const env_keys: string | undefined = process.env.API_KEYS
  if (!env_keys) {
    log_info("auth_no_api_keys_env: using empty set")
    return new Set<string>()
  }
  const keys: string[] = env_keys
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
  log_info(`auth_loaded_api_keys: ${keys.length}`)
  return new Set(keys)
}
