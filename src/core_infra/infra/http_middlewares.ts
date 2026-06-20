import { log_info, log_warn } from "./global_logger.ts"
import { build_error_response_from_unknown } from "./friendly_error.ts"
import type { HttpContext, HttpMiddleware } from "./http_router.ts"

/**
 * HTTP 中间件集合。
 *
 * 提供常用的中间件实现：日志、CORS、错误处理、请求ID。
 */

/**
 * 请求日志中间件。
 *
 * 记录每个请求的方法、路径和响应状态。
 */
export function logging_middleware(): HttpMiddleware {
  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    const start: number = Date.now()
    log_info(`http_log_start: ${ctx.method} ${ctx.path}`)

    const response = await next()

    const elapsed: number = Date.now() - start
    log_info(`http_log_end: ${ctx.method} ${ctx.path} ${response.status} ${elapsed}ms`)
    return response
  }
}

/**
 * CORS 中间件。
 *
 * 添加跨域资源共享头。
 */
export function cors_middleware(allowed_origins: string = "*"): HttpMiddleware {
  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    if (ctx.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowed_origins,
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-max-age": "86400",
        },
      })
    }

    const response = await next()
    response.headers.set("access-control-allow-origin", allowed_origins)
    return response
  }
}

/**
 * 错误处理中间件。
 *
 * V14: 捕获下游处理函数的异常，返回包含错误码、描述和修复建议的友好 500 响应。
 */
export function error_handler_middleware(): HttpMiddleware {
  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    try {
      return await next()
    } catch (e) {
      log_warn(`http_error: ${ctx.method} ${ctx.path} ${e}`)
      const error_body = build_error_response_from_unknown(e)
      return new Response(
        JSON.stringify(error_body),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      )
    }
  }
}

/**
 * 请求 ID 中间件。
 *
 * 为每个请求生成唯一 ID，存入 ctx.state 和响应头。
 */
export function request_id_middleware(): HttpMiddleware {
  return async (ctx: HttpContext, next: () => Promise<Response>): Promise<Response> => {
    const request_id: string = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    ctx.state["request_id"] = request_id

    const response = await next()
    response.headers.set("x-request-id", request_id)
    return response
  }
}

/**
 * JSON 响应工具函数。
 */
export function json_response(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/**
 * 纯文本响应工具函数。
 */
export function text_response(data: string, status: number = 200): Response {
  return new Response(data, { status, headers: { "content-type": "text/plain" } })
}

/**
 * SSE（Server-Sent Events）响应工具函数（V5）。
 *
 * 将异步生成器的每个分块序列化为 SSE 事件格式（`data: <json>\n\n`），
 * 流结束后发送 `data: [DONE]\n\n` 终止标记。
 *
 * 响应头：
 *   - content-type: text/event-stream
 *   - cache-control: no-cache
 *   - connection: keep-alive
 *   - x-accel-buffering: no（禁用 Nginx 缓冲）
 *
 * @param stream 异步生成器，每个 yield 的值会被 JSON.stringify 后作为 SSE data
 * @returns Response（基于 ReadableStream，流式推送）
 */
export function sse_response(stream: AsyncGenerator<unknown>): Response {
  const encoder: TextEncoder = new TextEncoder()
  const readable: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
    async start(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
      try {
        for await (const chunk of stream) {
          const data: string = `data: ${JSON.stringify(chunk)}\n\n`
          controller.enqueue(encoder.encode(data))
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      } catch (e) {
        const err_data: string = `data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`
        controller.enqueue(encoder.encode(err_data))
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(readable, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}
