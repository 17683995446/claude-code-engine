import { log_info } from "../../../core_infra/infra/global_logger.ts"
import { json_response, text_response } from "../../../core_infra/infra/http_middlewares.ts"
import type { HttpHandler } from "../../../core_infra/infra/http_router.ts"
import type { ApiRoute } from "./api_routes.ts"
import {
  generate_openapi_spec,
  get_endpoint_list,
  generate_html_docs,
} from "./openapi_spec.ts"

/**
 * V17: 设置 API 文档路由。
 *
 * 提供三个端点：
 *   GET /api/docs         - HTML 格式的 API 文档页面
 *   GET /api/openapi.json - OpenAPI 3.0 JSON spec
 *   GET /api/endpoints    - 机器可读的端点列表
 *
 * 所有文档端点无需鉴权。
 */
export function setup_docs_routes(base_url: string = "http://localhost:3000"): ApiRoute[] {
  log_info("docs_routes_setup")

  const docs_handler: HttpHandler = async () => {
    const html: string = generate_html_docs(base_url)
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const openapi_handler: HttpHandler = async () => {
    const spec = generate_openapi_spec(base_url)
    return json_response(spec, 200)
  }

  const endpoints_handler: HttpHandler = async () => {
    const list = get_endpoint_list()
    return json_response(list, 200)
  }

  return [
    { method: "GET", path: "/api/docs", handler: docs_handler },
    { method: "GET", path: "/api/openapi.json", handler: openapi_handler },
    { method: "GET", path: "/api/endpoints", handler: endpoints_handler },
  ]
}
