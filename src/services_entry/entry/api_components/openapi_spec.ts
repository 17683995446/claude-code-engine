import { CLI_VERSION } from "../cli_sdk/cli_args.ts"

/**
 * V17: OpenAPI 3.0 文档结构（简化版）。
 */
export interface OpenApiSpec {
  openapi: string
  info: OpenApiInfo
  servers: OpenApiServer[]
  paths: Record<string, Record<string, OpenApiOperation>>
  components: OpenApiComponents
}

export interface OpenApiInfo {
  title: string
  description: string
  version: string
  license?: { name: string; url: string }
}

export interface OpenApiServer {
  url: string
  description: string
}

export interface OpenApiOperation {
  summary: string
  description: string
  tags: string[]
  security?: Array<Record<string, unknown>>
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses: Record<string, OpenApiResponse>
}

export interface OpenApiParameter {
  name: string
  in: "query" | "path" | "header"
  required: boolean
  schema: { type: string }
  description: string
}

export interface OpenApiRequestBody {
  required: boolean
  content: Record<string, { schema: { type: string; properties?: Record<string, { type: string; description?: string }> } }>
}

export interface OpenApiResponse {
  description: string
  content?: Record<string, { schema: { type: string; properties?: Record<string, { type: string; description?: string }> } }>
}

export interface OpenApiComponents {
  securitySchemes: Record<string, { type: string; scheme: string; bearerFormat: string }>
  schemas: Record<string, { type: string; properties: Record<string, { type: string; description?: string }> }>
}

/**
 * V17: API 端点元数据。
 */
export interface EndpointInfo {
  method: string
  path: string
  summary: string
  description: string
  tag: string
  requires_auth: boolean
}

/**
 * V17: 所有 API 端点元数据列表。
 */
export const API_ENDPOINTS: EndpointInfo[] = [
  // Health
  { method: "GET", path: "/health", summary: "Full health report", description: "Returns the overall health status of the engine. No authentication required.", tag: "Health", requires_auth: false },
  { method: "GET", path: "/health/live", summary: "Liveness probe", description: "Kubernetes liveness probe endpoint. Returns 200 if the process is alive.", tag: "Health", requires_auth: false },
  { method: "GET", path: "/health/ready", summary: "Readiness probe", description: "Kubernetes readiness probe endpoint. Returns 200 if ready to serve traffic.", tag: "Health", requires_auth: false },

  // Auth
  { method: "GET", path: "/api/auth/status", summary: "Get auth status", description: "Returns the current authentication status and token info.", tag: "Auth", requires_auth: true },
  { method: "GET", path: "/api/auth/validate", summary: "Validate auth", description: "Validates the current authentication token.", tag: "Auth", requires_auth: true },

  // Messages
  { method: "POST", path: "/api/messages", summary: "Add message", description: "Adds a new message to the conversation.", tag: "Messages", requires_auth: true },
  { method: "GET", path: "/api/messages", summary: "Get all messages", description: "Returns all messages in the conversation.", tag: "Messages", requires_auth: true },
  { method: "DELETE", path: "/api/messages", summary: "Clear messages", description: "Clears all messages from the conversation.", tag: "Messages", requires_auth: true },

  // Shell
  { method: "POST", path: "/api/shell/run", summary: "Run shell command", description: "Executes a shell command and returns the output.", tag: "Shell", requires_auth: true },
  { method: "GET", path: "/api/shell/history", summary: "Get shell history", description: "Returns the history of executed shell commands.", tag: "Shell", requires_auth: true },

  // Gateway
  { method: "POST", path: "/api/gateway", summary: "Unified gateway", description: "Unified API gateway for all operations.", tag: "Gateway", requires_auth: true },

  // Chat
  { method: "POST", path: "/api/chat", summary: "Chat (non-streaming)", description: "Sends a chat message and returns a complete response.", tag: "Chat", requires_auth: true },
  { method: "POST", path: "/api/chat/stream", summary: "Chat (streaming)", description: "Sends a chat message and returns a streaming SSE response.", tag: "Chat", requires_auth: true },

  // Sessions
  { method: "POST", path: "/api/sessions", summary: "Create session", description: "Creates a new conversation session.", tag: "Sessions", requires_auth: true },
  { method: "GET", path: "/api/sessions", summary: "List sessions", description: "Returns a list of all sessions.", tag: "Sessions", requires_auth: true },
  { method: "GET", path: "/api/sessions/:id", summary: "Get session", description: "Returns details of a specific session.", tag: "Sessions", requires_auth: true },
  { method: "DELETE", path: "/api/sessions/:id", summary: "Delete session", description: "Deletes a specific session.", tag: "Sessions", requires_auth: true },
  { method: "POST", path: "/api/sessions/:id/messages", summary: "Add session message", description: "Adds a message to a specific session.", tag: "Sessions", requires_auth: true },

  // Agents (V6)
  { method: "GET", path: "/api/agents", summary: "List agents", description: "Returns all registered agents. (V6)", tag: "Agents", requires_auth: true },
  { method: "GET", path: "/api/agents/:id", summary: "Get agent", description: "Returns details of a specific agent. (V6)", tag: "Agents", requires_auth: true },
  { method: "POST", path: "/api/agents/:id/action", summary: "Execute agent action", description: "Executes an action on a specific agent. (V6)", tag: "Agents", requires_auth: true },

  // Tasks (V7)
  { method: "GET", path: "/api/tasks", summary: "List tasks", description: "Returns all tasks. (V7)", tag: "Tasks", requires_auth: true },
  { method: "POST", path: "/api/tasks", summary: "Create task", description: "Creates a new task with steps. (V7)", tag: "Tasks", requires_auth: true },
  { method: "GET", path: "/api/tasks/:id", summary: "Get task", description: "Returns details of a specific task. (V7)", tag: "Tasks", requires_auth: true },
  { method: "POST", path: "/api/tasks/:id/run", summary: "Run task", description: "Starts execution of a task. (V7)", tag: "Tasks", requires_auth: true },

  // Skills (V8)
  { method: "GET", path: "/api/skills", summary: "List skills", description: "Returns all registered skills. (V8)", tag: "Skills", requires_auth: true },
  { method: "GET", path: "/api/skills/:id", summary: "Get skill", description: "Returns details of a specific skill. (V8)", tag: "Skills", requires_auth: true },
  { method: "POST", path: "/api/skills/learn", summary: "Learn skill", description: "Registers a new skill from definition. (V8)", tag: "Skills", requires_auth: true },
  { method: "POST", path: "/api/skills/:id/execute", summary: "Execute skill", description: "Executes a specific skill with input. (V8)", tag: "Skills", requires_auth: true },

  // Plans (V9)
  { method: "GET", path: "/api/plans", summary: "List plans", description: "Returns all plans. (V9)", tag: "Plans", requires_auth: true },
  { method: "POST", path: "/api/plans", summary: "Create plan", description: "Creates a new long-running plan. (V9)", tag: "Plans", requires_auth: true },
  { method: "GET", path: "/api/plans/:id", summary: "Get plan", description: "Returns details of a specific plan. (V9)", tag: "Plans", requires_auth: true },
  { method: "POST", path: "/api/plans/:id/start", summary: "Start plan", description: "Starts execution of a plan. (V9)", tag: "Plans", requires_auth: true },
  { method: "POST", path: "/api/plans/:id/pause", summary: "Pause plan", description: "Pauses a running plan. (V9)", tag: "Plans", requires_auth: true },
  { method: "POST", path: "/api/plans/:id/resume", summary: "Resume plan", description: "Resumes a paused plan. (V9)", tag: "Plans", requires_auth: true },
  { method: "POST", path: "/api/plans/:id/cancel", summary: "Cancel plan", description: "Cancels a plan. (V9)", tag: "Plans", requires_auth: true },

  // Daemon (V10)
  { method: "GET", path: "/api/daemon/status", summary: "Daemon status", description: "Returns the daemon status. (V10)", tag: "Daemon", requires_auth: true },
  { method: "GET", path: "/api/daemon/metrics", summary: "Daemon metrics", description: "Returns daemon metrics. (V10)", tag: "Daemon", requires_auth: true },
  { method: "GET", path: "/api/daemon/events", summary: "Daemon events", description: "Returns daemon event log. (V10)", tag: "Daemon", requires_auth: true },
  { method: "POST", path: "/api/daemon/start", summary: "Start daemon", description: "Starts the daemon. (V10)", tag: "Daemon", requires_auth: true },
  { method: "POST", path: "/api/daemon/stop", summary: "Stop daemon", description: "Stops the daemon. (V10)", tag: "Daemon", requires_auth: true },
  { method: "POST", path: "/api/daemon/pause", summary: "Pause daemon", description: "Pauses the daemon. (V10)", tag: "Daemon", requires_auth: true },
  { method: "POST", path: "/api/daemon/resume", summary: "Resume daemon", description: "Resumes the daemon. (V10)", tag: "Daemon", requires_auth: true },
  { method: "POST", path: "/api/daemon/recover", summary: "Recover plans", description: "Triggers manual plan recovery. (V10)", tag: "Daemon", requires_auth: true },
  { method: "POST", path: "/api/daemon/reset", summary: "Reset recovery counter", description: "Resets the daemon recovery failure counter. (V10)", tag: "Daemon", requires_auth: true },

  // Config (V11)
  { method: "GET", path: "/api/config", summary: "Get all config", description: "Returns all configuration values. (V11)", tag: "Config", requires_auth: true },
  { method: "GET", path: "/api/config/status", summary: "Config status", description: "Returns config load/reload status. (V11)", tag: "Config", requires_auth: true },
  { method: "GET", path: "/api/config/:key", summary: "Get config value", description: "Returns a specific configuration value. (V11)", tag: "Config", requires_auth: true },
  { method: "POST", path: "/api/config/:key", summary: "Set config value", description: "Sets a configuration value. (V11)", tag: "Config", requires_auth: true },
  { method: "POST", path: "/api/config/reload", summary: "Reload config", description: "Triggers configuration hot reload. (V11)", tag: "Config", requires_auth: true },

  // Docs (V17)
  { method: "GET", path: "/api/docs", summary: "API documentation", description: "Returns HTML API documentation. (V17)", tag: "Docs", requires_auth: false },
  { method: "GET", path: "/api/openapi.json", summary: "OpenAPI spec", description: "Returns OpenAPI 3.0 specification. (V17)", tag: "Docs", requires_auth: false },
  { method: "GET", path: "/api/endpoints", summary: "Endpoint list", description: "Returns machine-readable endpoint list. (V17)", tag: "Docs", requires_auth: false },
]

/**
 * V17: 生成完整的 OpenAPI 3.0 规范。
 */
export function generate_openapi_spec(base_url: string = "http://localhost:3000"): OpenApiSpec {
  const paths: Record<string, Record<string, OpenApiOperation>> = {}

  for (const endpoint of API_ENDPOINTS) {
    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {}
    }
    const operation: OpenApiOperation = {
      summary: endpoint.summary,
      description: endpoint.description,
      tags: [endpoint.tag],
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        "400": {
          description: "Bad request",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string", description: "Error category" },
                  code: { type: "number", description: "Error code" },
                  message: { type: "string", description: "Error message" },
                  description: { type: "string", description: "Human-readable description" },
                  suggestion: { type: "string", description: "Actionable fix suggestion" },
                },
              },
            },
          },
        },
        "401": {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string" },
                  code: { type: "number" },
                  suggestion: { type: "string", description: "Provide API key in Authorization header" },
                },
              },
            },
          },
        },
        "404": {
          description: "Not found",
          content: {
            "application/json": {
              schema: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } } },
            },
          },
        },
        "500": {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string" },
                  code: { type: "number" },
                  description: { type: "string" },
                  suggestion: { type: "string" },
                },
              },
            },
          },
        },
      },
    }

    if (endpoint.requires_auth) {
      operation.security = [{ bearerAuth: [] }]
    }

    paths[endpoint.path][endpoint.method.toLowerCase()] = operation
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Claude Code Engine API",
      description: "Multi-agent collaboration, skill self-enhancement, long-task planning, and perpetual daemon system.\n\n## Authentication\n\nMost endpoints require an API key. Provide it in the `Authorization: Bearer <key>` header.\n\n## Error Responses\n\nAll error responses include `error`, `code`, `name`, `message`, `description`, and `suggestion` fields for easy debugging.",
      version: CLI_VERSION,
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: [
      { url: base_url, description: "Local server" },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error category (lowercase)" },
            code: { type: "number", description: "Numeric error code" },
            name: { type: "string", description: "Error code name" },
            message: { type: "string", description: "Specific error message" },
            description: { type: "string", description: "Human-readable description" },
            suggestion: { type: "string", description: "Actionable fix suggestion" },
          },
        },
        Message: {
          type: "object",
          properties: {
            id: { type: "string", description: "Message ID" },
            content: { type: "string", description: "Message content" },
            role: { type: "string", description: "Message role (user/assistant/system)" },
            timestamp: { type: "number", description: "Unix timestamp" },
          },
        },
      },
    },
  }
}

/**
 * V17: 获取端点列表（用于 /api/endpoints 端点）。
 */
export function get_endpoint_list(): { total: number; endpoints: EndpointInfo[]; tags: string[] } {
  const tags: string[] = [...new Set(API_ENDPOINTS.map((e) => e.tag))].sort()
  return {
    total: API_ENDPOINTS.length,
    endpoints: API_ENDPOINTS,
    tags,
  }
}

/**
 * V17: 生成 HTML 格式的 API 文档。
 */
export function generate_html_docs(base_url: string = "http://localhost:3000"): string {
  const endpoints_by_tag: Record<string, EndpointInfo[]> = {}
  for (const ep of API_ENDPOINTS) {
    if (!endpoints_by_tag[ep.tag]) {
      endpoints_by_tag[ep.tag] = []
    }
    endpoints_by_tag[ep.tag].push(ep)
  }

  const sections: string[] = []
  for (const tag of Object.keys(endpoints_by_tag).sort()) {
    const endpoints = endpoints_by_tag[tag]
    const rows: string[] = endpoints.map((ep) => {
      const auth_badge: string = ep.requires_auth
        ? '<span style="color: #e74c3c;">Auth</span>'
        : '<span style="color: #27ae60;">Public</span>'
      const method_color: string = {
        GET: "#3498db",
        POST: "#2ecc71",
        PUT: "#f39c12",
        DELETE: "#e74c3c",
      }[ep.method] ?? "#7f8c8d"
      return `        <tr>
          <td><span style="color: ${method_color}; font-weight: bold;">${ep.method}</span></td>
          <td><code>${ep.path}</code></td>
          <td>${ep.summary}</td>
          <td>${auth_badge}</td>
        </tr>`
    }).join("\n")
    sections.push(`      <h2 id="${tag.toLowerCase()}">${tag}</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Path</th><th>Description</th><th>Auth</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Engine API Documentation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h2 { color: #2c3e50; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ecf0f1; }
    th { background-color: #f8f9fa; font-weight: 600; }
    code { background-color: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: "SF Mono", Monaco, monospace; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .links { margin: 20px 0; }
    .links a { margin-right: 15px; color: #3498db; text-decoration: none; }
    .links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Claude Code Engine API</h1>
    <span>Version: ${CLI_VERSION}</span>
  </div>
  <p>Multi-agent collaboration, skill self-enhancement, long-task planning, and perpetual daemon system.</p>
  <div class="links">
    <a href="/api/openapi.json">OpenAPI JSON</a>
    <a href="/api/endpoints">Endpoint List (JSON)</a>
    <a href="/health">Health Check</a>
  </div>
  <p><strong>Base URL:</strong> <code>${base_url}</code></p>
  <p><strong>Authentication:</strong> Most endpoints require an API key in the <code>Authorization: Bearer &lt;key&gt;</code> header.</p>

${sections.join("\n\n")}

  <h2>Error Responses</h2>
  <p>All error responses include the following fields:</p>
  <table>
    <thead>
      <tr><th>Field</th><th>Type</th><th>Description</th></tr>
    </thead>
    <tbody>
      <tr><td><code>error</code></td><td>string</td><td>Error category (lowercase)</td></tr>
      <tr><td><code>code</code></td><td>number</td><td>Numeric error code</td></tr>
      <tr><td><code>name</code></td><td>string</td><td>Error code name</td></tr>
      <tr><td><code>message</code></td><td>string</td><td>Specific error message</td></tr>
      <tr><td><code>description</code></td><td>string</td><td>Human-readable description</td></tr>
      <tr><td><code>suggestion</code></td><td>string</td><td>Actionable fix suggestion</td></tr>
    </tbody>
  </table>
</body>
</html>`
}
