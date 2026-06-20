import { log_info, log_warn, log_error } from "./global_logger.ts"

/**
 * HTTP 客户端配置。
 */
export interface HttpClientConfig {
  base_url?: string
  default_headers?: Record<string, string>
  timeout_ms?: number
}

/**
 * HttpResponse - HTTP 响应封装。
 */
export interface HttpResponse {
  status: number
  ok: boolean
  headers: Record<string, string>
  body: unknown
  text: string
}

/**
 * HttpClient - HTTP 客户端。
 *
 * 基于 fetch 实现，支持超时、默认 headers、JSON 解析。
 */
export class HttpClient {
  private base_url: string
  private default_headers: Record<string, string>
  private timeout_ms: number

  constructor(config: HttpClientConfig = {}) {
    log_info("http_client_created")
    this.base_url = config.base_url ?? ""
    this.default_headers = config.default_headers ?? {}
    this.timeout_ms = config.timeout_ms ?? 30000
  }

  async get(path: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request("GET", path, undefined, headers)
  }

  async post(path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request("POST", path, body, headers)
  }

  async put(path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request("PUT", path, body, headers)
  }

  async delete(path: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request("DELETE", path, undefined, headers)
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse> {
    const url: string = this.base_url + path
    log_info(`http_client_request: ${method} ${url}`)

    const all_headers: Record<string, string> = { ...this.default_headers, ...headers }
    let req_body: BodyInit | undefined = undefined

    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        req_body = body
        if (!all_headers["content-type"]) {
          all_headers["content-type"] = "text/plain"
        }
      } else {
        req_body = JSON.stringify(body)
        if (!all_headers["content-type"]) {
          all_headers["content-type"] = "application/json"
        }
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeout_ms)

      const response = await fetch(url, {
        method,
        headers: all_headers,
        body: req_body,
        signal: controller.signal,
      })

      clearTimeout(timer)

      const text: string = await response.text()
      let parsed_body: unknown = text
      const content_type = response.headers.get("content-type") ?? ""
      if (content_type.includes("application/json") && text.length > 0) {
        try {
          parsed_body = JSON.parse(text)
        } catch {
          // 保持 text
        }
      }

      const resp_headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        resp_headers[key] = value
      })

      return {
        status: response.status,
        ok: response.ok,
        headers: resp_headers,
        body: parsed_body,
        text,
      }
    } catch (e) {
      log_error(`http_client_error: ${method} ${url} ${e}`)
      throw e
    }
  }
}
