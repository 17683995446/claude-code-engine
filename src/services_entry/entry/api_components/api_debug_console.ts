import { log_info } from "../../../core_infra/infra/global_logger.ts"
import { json_response } from "../../../core_infra/infra/http_middlewares.ts"
import type { HttpHandler } from "../../../core_infra/infra/http_router.ts"
import type { ApiRoute } from "./api_routes.ts"
import { API_ENDPOINTS } from "./openapi_spec.ts"
import { CLI_VERSION } from "../cli_sdk/cli_args.ts"

/**
 * V23: 生成 API 调试控制台 HTML 页面。
 *
 * 提供一个交互式 Web 界面，用户可以：
 *   - 浏览所有 API 端点
 *   - 发送测试请求
 *   - 查看响应
 *   - 自动填充请求模板
 */
export function generate_debug_console_html(base_url: string = ""): string {
  // 按标签分组端点
  const endpoints_by_tag: Record<string, typeof API_ENDPOINTS> = {}
  for (const ep of API_ENDPOINTS) {
    if (!endpoints_by_tag[ep.tag]) {
      endpoints_by_tag[ep.tag] = []
    }
    endpoints_by_tag[ep.tag].push(ep)
  }

  // 生成端点数据 JSON
  const endpoints_json = JSON.stringify(API_ENDPOINTS)

  // 生成标签按钮
  const tag_buttons = Object.keys(endpoints_by_tag)
    .sort()
    .map((tag) => `<button class="tag-btn" data-tag="${tag}">${tag}</button>`)
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Engine - API Debug Console</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .header { background: #2c3e50; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 18px; }
    .header .version { font-size: 12px; opacity: 0.8; }
    .container { display: flex; height: calc(100vh - 60px); }
    .sidebar { width: 300px; background: white; border-right: 1px solid #ddd; overflow-y: auto; }
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .tag-filters { padding: 10px; border-bottom: 1px solid #eee; display: flex; flex-wrap: wrap; gap: 5px; }
    .tag-btn { padding: 4px 10px; border: 1px solid #ddd; background: #f8f8f8; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .tag-btn.active { background: #3498db; color: white; border-color: #3498db; }
    .endpoint-list { padding: 0; }
    .endpoint-item { padding: 10px 15px; border-bottom: 1px solid #eee; cursor: pointer; }
    .endpoint-item:hover { background: #f0f7ff; }
    .endpoint-item.active { background: #e3f2fd; }
    .endpoint-method { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; color: white; margin-right: 8px; min-width: 50px; text-align: center; }
    .method-GET { background: #3498db; }
    .method-POST { background: #2ecc71; }
    .method-PUT { background: #f39c12; }
    .method-DELETE { background: #e74c3c; }
    .endpoint-path { font-family: monospace; font-size: 13px; }
    .endpoint-summary { font-size: 11px; color: #666; margin-top: 3px; }
    .request-panel { padding: 20px; border-bottom: 1px solid #ddd; background: white; }
    .request-panel h3 { margin-bottom: 10px; }
    .form-row { margin-bottom: 10px; }
    .form-row label { display: block; font-size: 12px; color: #666; margin-bottom: 3px; }
    .form-row input, .form-row textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; font-size: 13px; }
    .form-row textarea { min-height: 100px; resize: vertical; }
    .btn-send { padding: 8px 20px; background: #2ecc71; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 14px; }
    .btn-send:hover { background: #27ae60; }
    .btn-send:disabled { background: #bdc3c7; cursor: not-allowed; }
    .response-panel { flex: 1; padding: 20px; overflow-y: auto; background: #1e1e1e; color: #d4d4d4; }
    .response-panel pre { font-family: "SF Mono", Monaco, monospace; font-size: 13px; white-space: pre-wrap; word-wrap: break-word; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; margin-bottom: 10px; }
    .status-2xx { background: #2ecc71; color: white; }
    .status-4xx { background: #f39c12; color: white; }
    .status-5xx { background: #e74c3c; color: white; }
    .auth-input { margin-bottom: 10px; }
    .auth-input input { width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Claude Code Engine - API Debug Console</h1>
    <span class="version">v${CLI_VERSION}</span>
  </div>
  <div class="container">
    <div class="sidebar">
      <div class="tag-filters">
        <button class="tag-btn active" data-tag="ALL">ALL</button>
        ${tag_buttons}
      </div>
      <div class="endpoint-list" id="endpointList"></div>
    </div>
    <div class="main">
      <div class="request-panel">
        <div class="auth-input">
          <label>API Key (for authenticated endpoints):</label>
          <input type="text" id="apiKey" placeholder="Enter API key...">
        </div>
        <h3 id="endpointTitle">Select an endpoint</h3>
        <div class="form-row">
          <label>Method & Path:</label>
          <input type="text" id="requestPath" readonly>
        </div>
        <div class="form-row" id="bodyRow" style="display:none;">
          <label>Request Body (JSON):</label>
          <textarea id="requestBody" placeholder='{"key": "value"}'></textarea>
        </div>
        <div class="form-row">
          <button class="btn-send" id="sendBtn" disabled>Send Request</button>
        </div>
      </div>
      <div class="response-panel">
        <pre id="responseOutput">// Select an endpoint from the left panel to start debugging</pre>
      </div>
    </div>
  </div>

  <script>
    const endpoints = ${endpoints_json};
    const baseUrl = "${base_url}";
    let currentEndpoint = null;

    // Render endpoints
    function renderEndpoints(tag) {
      const list = document.getElementById("endpointList");
      list.innerHTML = "";
      const filtered = tag === "ALL" ? endpoints : endpoints.filter(e => e.tag === tag);
      filtered.forEach((ep, idx) => {
        const div = document.createElement("div");
        div.className = "endpoint-item";
        div.dataset.index = idx;
        div.innerHTML = '<span class="endpoint-method method-' + ep.method + '">' + ep.method + '</span><span class="endpoint-path">' + ep.path + '</span><div class="endpoint-summary">' + ep.summary + '</div>';
        div.onclick = () => selectEndpoint(ep);
        list.appendChild(div);
      });
    }

    // Tag filter
    document.querySelectorAll(".tag-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".tag-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderEndpoints(btn.dataset.tag);
      };
    });

    // Select endpoint
    function selectEndpoint(ep) {
      currentEndpoint = ep;
      document.querySelectorAll(".endpoint-item").forEach(item => item.classList.remove("active"));
      document.getElementById("endpointTitle").textContent = ep.summary;
      document.getElementById("requestPath").value = ep.method + " " + ep.path;
      document.getElementById("sendBtn").disabled = false;

      // Show body input for POST/PUT
      const bodyRow = document.getElementById("bodyRow");
      if (ep.method === "POST" || ep.method === "PUT") {
        bodyRow.style.display = "block";
        document.getElementById("requestBody").value = '{\\n  "message": "test"\\n}';
      } else {
        bodyRow.style.display = "none";
      }

      document.getElementById("responseOutput").textContent = "// Ready to send " + ep.method + " " + ep.path;
    }

    // Send request
    document.getElementById("sendBtn").onclick = async () => {
      if (!currentEndpoint) return;
      const output = document.getElementById("responseOutput");
      output.textContent = "// Sending request...";

      const path = currentEndpoint.path;
      const method = currentEndpoint.method;
      const apiKey = document.getElementById("apiKey").value;
      const body = document.getElementById("requestBody").value;

      const headers = { "Content-Type": "application/json" };
      if (apiKey && currentEndpoint.requires_auth) {
        headers["Authorization"] = "Bearer " + apiKey;
      }

      try {
        const options = { method, headers };
        if (method === "POST" || method === "PUT") {
          options.body = body;
        }
        const response = await fetch(path, options);
        const text = await response.text();
        let formatted = text;
        try {
          formatted = JSON.stringify(JSON.parse(text), null, 2);
        } catch {}
        const statusClass = response.status < 300 ? "status-2xx" : response.status < 500 ? "status-4xx" : "status-5xx";
        output.innerHTML = '<span class="status-badge ' + statusClass + '">' + response.status + ' ' + response.statusText + '</span>\\n\\n' + formatted;
      } catch (e) {
        output.textContent = "// Error: " + e.message;
      }
    };

    // Initial render
    renderEndpoints("ALL");
  </script>
</body>
</html>`
}

/**
 * V23: 设置 API 调试控制台路由。
 *
 * 提供一个端点：
 *   GET /api/debug  - 交互式 API 调试控制台（HTML 页面）
 *
 * 无需鉴权，方便开发者快速测试。
 */
export function setup_debug_console_routes(): ApiRoute[] {
  log_info("debug_console_routes_setup")

  const debug_handler: HttpHandler = async () => {
    const html: string = generate_debug_console_html()
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const spec_handler: HttpHandler = async () => {
    // 返回端点列表（供调试控制台前端使用）
    return json_response({
      endpoints: API_ENDPOINTS,
      total: API_ENDPOINTS.length,
      version: CLI_VERSION,
    }, 200)
  }

  return [
    { method: "GET", path: "/api/debug", handler: debug_handler },
    { method: "GET", path: "/api/debug/spec", handler: spec_handler },
  ]
}
