import { log_info } from "../../../core_infra/infra/global_logger.ts"
import { json_response, sse_response } from "../../../core_infra/infra/http_middlewares.ts"
import type { HttpContext, HttpHandler } from "../../../core_infra/infra/http_router.ts"
import type {
  IAsyncAuthService,
  IAsyncMessageService,
  IAsyncShellService,
  IAsyncApiGateway,
} from "../../../core_infra/core/i_async_services.ts"
import type { ApiRequest } from "../../../core_infra/core/i_api_gateway.ts"
import type { ConversationEngine } from "../../services/conversation_engine.ts"
import type { SessionManager } from "../../services/session_manager.ts"
import type { AgentRegistry } from "../../services/agent_registry.ts"
import type { TaskOrchestrator } from "../../services/task_orchestrator.ts"
import type { SkillRegistry } from "../../services/skill_registry.ts"
import type { Planner } from "../../services/planner.ts"
import type { Daemon } from "../../services/daemon.ts"
import type { ConfigManager } from "../../services/config_manager.ts"
import type { HealthEndpoint } from "../../../core_infra/infra/health_endpoint.ts"
import type { AgentAction } from "../../../core_infra/core/i_agent.ts"
import type { TaskStep } from "../../../core_infra/core/i_task.ts"
import type { SkillDefinition } from "../../../core_infra/core/i_skill.ts"
import type { PlanPhase } from "../../../core_infra/core/i_plan.ts"

/**
 * HTTP API 路由集合。
 *
 * 将异步业务服务暴露为 RESTful HTTP 端点，桥接 HttpServer 到 AsyncApiGateway。
 *
 * 路由设计：
 *   GET    /api/auth/status     → auth.get_status()
 *   GET    /api/auth/validate   → auth.validate()
 *   POST   /api/messages        → messages.add(content, role)
 *   GET    /api/messages        → messages.get_all()
 *   DELETE /api/messages        → messages.clear()
 *   POST   /api/shell/run       → shell.run(command, timeout_ms)
 *   GET    /api/shell/history   → shell.get_history()
 *   POST   /api/gateway         → gateway.handle_request(action, payload)  统一入口
 */

export interface ApiRoute {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  handler: HttpHandler
}

/**
 * 创建 RESTful API 路由，直接调用各 async 服务。
 */
export function setup_api_routes(
  auth: IAsyncAuthService,
  messages: IAsyncMessageService,
  shell: IAsyncShellService,
): ApiRoute[] {
  const routes: ApiRoute[] = []

  // ---- Auth ----
  routes.push({
    method: "GET",
    path: "/api/auth/status",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const status = await auth.get_status()
      return json_response(status, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/auth/validate",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const valid = await auth.validate()
      return json_response({ valid }, 200)
    },
  })

  // ---- Messages ----
  routes.push({
    method: "POST",
    path: "/api/messages",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { content?: string; role?: string }
      const content: string = String(body.content ?? "")
      const role: "user" | "assistant" | "system" = validate_role(body.role)
      const msg = await messages.add(content, role)
      return json_response(msg, 201)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/messages",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const all = await messages.get_all()
      return json_response({ messages: all, count: all.length }, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/messages",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      await messages.clear()
      return json_response({ cleared: true }, 200)
    },
  })

  // ---- Shell ----
  routes.push({
    method: "POST",
    path: "/api/shell/run",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { command?: string; timeout_ms?: number }
      const result = await shell.run({
        command: String(body.command ?? ""),
        timeout_ms: Number(body.timeout_ms ?? 5000),
      })
      return json_response(result, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/shell/history",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const history = await shell.get_history()
      return json_response({ history, count: history.length }, 200)
    },
  })

  log_info("api_routes_setup")
  return routes
}

/**
 * 创建统一网关路由，通过 AsyncApiGateway 路由所有请求。
 *
 * POST /api/gateway  body: { action: string, payload: Record<string, unknown> }
 */
export function setup_gateway_route(gateway: IAsyncApiGateway): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "POST",
    path: "/api/gateway",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { action?: string; payload?: Record<string, unknown> }
      const request: ApiRequest = {
        action: String(body.action ?? ""),
        payload: body.payload ?? {},
      }
      const response = await gateway.handle_request(request)
      const status: number = response.success ? 200 : 400
      return json_response(response, status)
    },
  })

  log_info("gateway_route_setup")
  return routes
}

/**
 * 创建对话引擎路由（V3）。
 *
 * POST /api/chat          body: { message: string }  → engine.chat(message)
 * GET  /api/chat/history  → engine.get_messages()
 * DELETE /api/chat/history → engine.clear()
 */
export function setup_chat_routes(engine: ConversationEngine): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "POST",
    path: "/api/chat",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { message?: string }
      const message: string = String(body.message ?? "")
      if (message.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "message_required" },
          400,
        )
      }
      const response = await engine.chat(message)
      return json_response(response, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/chat/history",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const messages = await engine.get_messages()
      return json_response({ messages, count: messages.length }, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/chat/history",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      await engine.clear()
      return json_response({ cleared: true }, 200)
    },
  })

  log_info("chat_routes_setup")
  return routes
}

/**
 * 创建会话管理路由（V4）。
 *
 * POST   /api/sessions                → 创建会话  body: { title?, system_prompt?, max_history? }
 * GET    /api/sessions                → 列出所有会话
 * GET    /api/sessions/:id            → 获取会话详情
 * DELETE /api/sessions/:id            → 删除会话
 * POST   /api/sessions/:id/chat       → 在会话中对话  body: { message: string }
 * GET    /api/sessions/:id/history    → 获取会话历史
 * DELETE /api/sessions/:id/history    → 清空会话历史
 */
export function setup_session_routes(manager: SessionManager): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "POST",
    path: "/api/sessions",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { title?: string; system_prompt?: string; max_history?: number }
      const session = await manager.create_session({
        title: body.title,
        system_prompt: body.system_prompt,
        max_history: body.max_history,
      })
      return json_response(session, 201)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/sessions",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const sessions = await manager.list_sessions()
      return json_response({ sessions, count: sessions.length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/sessions/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const session = await manager.get_session(id)
      if (!session) {
        return json_response({ error: "not_found", message: "session_not_found" }, 404)
      }
      return json_response(session, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/sessions/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const deleted: boolean = await manager.delete_session(id)
      if (!deleted) {
        return json_response({ error: "not_found", message: "session_not_found" }, 404)
      }
      return json_response({ deleted: true }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/sessions/:id/chat",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const body = (ctx.body ?? {}) as { message?: string }
      const message: string = String(body.message ?? "")
      if (message.length === 0) {
        return json_response({ error: "invalid_argument", message: "message_required" }, 400)
      }
      const session = await manager.get_session(id)
      if (!session) {
        return json_response({ error: "not_found", message: "session_not_found" }, 404)
      }
      const response = await manager.chat(id, message)
      return json_response(response, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/sessions/:id/history",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const session = await manager.get_session(id)
      if (!session) {
        return json_response({ error: "not_found", message: "session_not_found" }, 404)
      }
      const history = await manager.get_history(id)
      return json_response({ messages: history, count: history.length }, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/sessions/:id/history",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const cleared: boolean = await manager.clear_history(id)
      if (!cleared) {
        return json_response({ error: "not_found", message: "session_not_found" }, 404)
      }
      return json_response({ cleared: true }, 200)
    },
  })

  log_info("session_routes_setup")
  return routes
}

/**
 * 创建流式对话路由（V5）。
 *
 * POST /api/chat/stream                → 流式对话  body: { message: string }
 * POST /api/sessions/:id/chat/stream   → 会话流式对话  body: { message: string }
 *
 * 响应格式：Server-Sent Events（text/event-stream）
 * 每个事件为 `data: <json>\n\n`，json 为 LlmStreamChunk：
 *   - { type: "delta", content: "..." }    增量内容
 *   - { type: "done", finish_reason, usage } 流结束
 * 流末尾发送 `data: [DONE]\n\n` 终止标记。
 */
export function setup_stream_routes(
  engine: ConversationEngine,
  manager: SessionManager,
): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "POST",
    path: "/api/chat/stream",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { message?: string }
      const message: string = String(body.message ?? "")
      if (message.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "message_required" },
          400,
        )
      }
      const stream = engine.stream_chat(message)
      return sse_response(stream)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/sessions/:id/chat/stream",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const body = (ctx.body ?? {}) as { message?: string }
      const message: string = String(body.message ?? "")
      if (message.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "message_required" },
          400,
        )
      }
      const session = await manager.get_session(id)
      if (!session) {
        return json_response({ error: "not_found", message: "session_not_found" }, 404)
      }
      const stream = manager.stream_chat(id, message)
      return sse_response(stream)
    },
  })

  log_info("stream_routes_setup")
  return routes
}

/**
 * 创建 Agent 管理路由（V6）。
 *
 * GET    /api/agents                → 列出所有 Agent
 * GET    /api/agents/:id            → 获取 Agent 详情
 * POST   /api/agents/:id/start      → 启动 Agent
 * POST   /api/agents/:id/stop       → 停止 Agent
 * DELETE /api/agents/:id            → 注销 Agent
 * POST   /api/agents/:id/invoke     → 调用 Agent 动作  body: { type: string, input: {} }
 */
export function setup_agent_routes(registry: AgentRegistry): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "GET",
    path: "/api/agents",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const agents = await registry.list()
      return json_response({ agents, count: agents.length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/agents/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const agent = await registry.get(id)
      if (!agent) {
        return json_response({ error: "not_found", message: "agent_not_found" }, 404)
      }
      return json_response(agent.get_info(), 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/agents/:id/start",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const started: boolean = await registry.start_agent(id)
      if (!started) {
        return json_response({ error: "not_found", message: "agent_not_found" }, 404)
      }
      return json_response({ started: true }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/agents/:id/stop",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const stopped: boolean = await registry.stop_agent(id)
      if (!stopped) {
        return json_response({ error: "not_found", message: "agent_not_found" }, 404)
      }
      return json_response({ stopped: true }, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/agents/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const deleted: boolean = await registry.unregister(id)
      if (!deleted) {
        return json_response({ error: "not_found", message: "agent_not_found" }, 404)
      }
      return json_response({ deleted: true }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/agents/:id/invoke",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const body = (ctx.body ?? {}) as { type?: string; input?: Record<string, unknown> }
      const action: AgentAction = {
        type: String(body.type ?? ""),
        input: body.input ?? {},
      }
      if (action.type.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "action_type_required" },
          400,
        )
      }
      const result = await registry.invoke(id, action)
      const status: number = result.success ? 200 : 400
      return json_response(result, status)
    },
  })

  log_info("agent_routes_setup")
  return routes
}

/**
 * 创建任务编排路由（V7）。
 *
 * POST   /api/tasks                → 创建任务  body: { name, description, steps: TaskStep[] }
 * GET    /api/tasks                → 列出所有任务摘要
 * GET    /api/tasks/:id            → 获取任务摘要
 * POST   /api/tasks/:id/run        → 执行任务
 * POST   /api/tasks/:id/cancel     → 取消任务
 * DELETE /api/tasks/:id            → 删除任务（从内存移除）
 */
export function setup_task_routes(orchestrator: TaskOrchestrator): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "POST",
    path: "/api/tasks",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as {
        name?: string
        description?: string
        steps?: TaskStep[]
      }
      const name: string = String(body.name ?? "")
      const description: string = String(body.description ?? "")
      const steps: TaskStep[] = Array.isArray(body.steps) ? body.steps : []
      if (name.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "name_required" },
          400,
        )
      }
      if (steps.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "steps_required" },
          400,
        )
      }
      try {
        const id: string = await orchestrator.create_task(name, description, steps)
        const summary = await orchestrator.get_task_summary(id)
        return json_response({ id, task: summary }, 201)
      } catch (e) {
        return json_response(
          { error: "invalid_argument", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "GET",
    path: "/api/tasks",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const tasks = await orchestrator.list_tasks()
      return json_response({ tasks, count: tasks.length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/tasks/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const summary = await orchestrator.get_task_summary(id)
      if (!summary) {
        return json_response({ error: "not_found", message: "task_not_found" }, 404)
      }
      return json_response(summary, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/tasks/:id/run",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      try {
        const status = await orchestrator.run_task(id)
        const summary = await orchestrator.get_task_summary(id)
        return json_response({ id, status, task: summary }, 200)
      } catch (e) {
        return json_response(
          { error: "not_found", message: String((e as Error).message) },
          404,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/tasks/:id/cancel",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const cancelled: boolean = await orchestrator.cancel_task(id)
      if (!cancelled) {
        return json_response(
          { error: "not_found", message: "task_not_found_or_not_cancellable" },
          404,
        )
      }
      return json_response({ cancelled: true }, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/tasks/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const deleted: boolean = await orchestrator.delete_task(id)
      if (!deleted) {
        return json_response({ error: "not_found", message: "task_not_found" }, 404)
      }
      return json_response({ deleted: true }, 200)
    },
  })

  log_info("task_routes_setup")
  return routes
}

/**
 * 创建技能管理路由（V8）。
 *
 * GET    /api/skills                → 列出所有技能元数据
 * GET    /api/skills/:id            → 获取技能定义
 * POST   /api/skills/:id/invoke     → 调用技能  body: { input: Record<string, unknown> }
 * POST   /api/skills/learn          → 学习新技能（自我增强）  body: SkillDefinition
 * DELETE /api/skills/:id            → 注销学习型技能（内置技能不可注销）
 */
export function setup_skill_routes(registry: SkillRegistry): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "GET",
    path: "/api/skills",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const skills = await registry.list()
      return json_response({ skills, count: skills.length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/skills/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const definition = await registry.get_definition(id)
      if (!definition) {
        return json_response({ error: "not_found", message: "skill_not_found" }, 404)
      }
      return json_response(definition, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/skills/:id/invoke",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const body = (ctx.body ?? {}) as { input?: Record<string, unknown> }
      const input: Record<string, unknown> = body.input ?? {}
      const result = await registry.invoke(id, input)
      const status: number = result.success ? 200 : 400
      return json_response(result, status)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/skills/learn",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as SkillDefinition
      if (!body.metadata || !body.metadata.id) {
        return json_response(
          { error: "invalid_argument", message: "metadata_id_required" },
          400,
        )
      }
      try {
        const id: string = await registry.learn_skill(body)
        const definition = await registry.get_definition(id)
        return json_response({ id, skill: definition }, 201)
      } catch (e) {
        return json_response(
          { error: "invalid_argument", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/skills/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const deleted: boolean = await registry.unregister(id)
      if (!deleted) {
        return json_response(
          { error: "not_found", message: "skill_not_found_or_builtin" },
          404,
        )
      }
      return json_response({ deleted: true }, 200)
    },
  })

  log_info("skill_routes_setup")
  return routes
}

/**
 * 创建计划管理路由（V9）。
 *
 * POST   /api/plans                → 创建计划  body: { goal, name, phases, metadata? }
 * GET    /api/plans                → 列出所有计划摘要
 * GET    /api/plans/:id            → 获取计划摘要
 * POST   /api/plans/:id/run        → 自驱动执行计划
 * POST   /api/plans/:id/pause      → 暂停计划
 * POST   /api/plans/:id/resume     → 恢复计划（断点续传）
 * POST   /api/plans/:id/cancel     → 取消计划
 * DELETE /api/plans/:id            → 删除计划
 */
export function setup_plan_routes(planner: Planner): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "POST",
    path: "/api/plans",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as {
        goal?: string
        name?: string
        phases?: Array<Omit<PlanPhase, "status" | "retry_count" | "started_at" | "completed_at" | "output" | "error">>
        metadata?: Record<string, unknown>
      }
      const goal: string = String(body.goal ?? "")
      const name: string = String(body.name ?? "")
      const phases = Array.isArray(body.phases) ? body.phases : []
      if (goal.length === 0) {
        return json_response({ error: "invalid_argument", message: "goal_required" }, 400)
      }
      if (phases.length === 0) {
        return json_response({ error: "invalid_argument", message: "phases_required" }, 400)
      }
      try {
        const id: string = await planner.create_plan(goal, name, phases, body.metadata ?? {})
        const summary = await planner.get_plan_summary(id)
        return json_response({ id, plan: summary }, 201)
      } catch (e) {
        return json_response(
          { error: "invalid_argument", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "GET",
    path: "/api/plans",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const plans = await planner.list_plans()
      return json_response({ plans, count: plans.length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/plans/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const summary = await planner.get_plan_summary(id)
      if (!summary) {
        return json_response({ error: "not_found", message: "plan_not_found" }, 404)
      }
      return json_response(summary, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/plans/:id/run",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      try {
        const status = await planner.run_plan(id)
        const summary = await planner.get_plan_summary(id)
        return json_response({ id, status, plan: summary }, 200)
      } catch (e) {
        return json_response(
          { error: "not_found", message: String((e as Error).message) },
          404,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/plans/:id/pause",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const paused: boolean = await planner.pause_plan(id)
      if (!paused) {
        return json_response(
          { error: "not_found", message: "plan_not_found_or_not_running" },
          404,
        )
      }
      return json_response({ paused: true }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/plans/:id/resume",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      try {
        const status = await planner.resume_plan(id)
        const summary = await planner.get_plan_summary(id)
        return json_response({ id, status, plan: summary }, 200)
      } catch (e) {
        return json_response(
          { error: "not_found", message: String((e as Error).message) },
          404,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/plans/:id/cancel",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const cancelled: boolean = await planner.cancel_plan(id)
      if (!cancelled) {
        return json_response(
          { error: "not_found", message: "plan_not_found_or_not_cancellable" },
          404,
        )
      }
      return json_response({ cancelled: true }, 200)
    },
  })

  routes.push({
    method: "DELETE",
    path: "/api/plans/:id",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const id: string = ctx.params["id"] ?? ""
      const deleted: boolean = await planner.delete_plan(id)
      if (!deleted) {
        return json_response({ error: "not_found", message: "plan_not_found" }, 404)
      }
      return json_response({ deleted: true }, 200)
    },
  })

  log_info("plan_routes_setup")
  return routes
}

/**
 * 创建守护进程路由（V10）。
 *
 * GET   /api/daemon/status    → 获取守护进程状态
 * GET   /api/daemon/metrics   → 获取运行指标
 * GET   /api/daemon/events    → 获取最近事件列表
 * GET   /api/daemon/config    → 获取配置
 * POST  /api/daemon/start     → 启动守护进程
 * POST  /api/daemon/stop      → 停止守护进程
 * POST  /api/daemon/pause     → 暂停守护进程
 * POST  /api/daemon/resume    → 恢复守护进程
 * POST  /api/daemon/health    → 手动触发健康检查
 * POST  /api/daemon/recover   → 手动触发计划恢复
 * POST  /api/daemon/reset     → 重置恢复失败计数
 */
export function setup_daemon_routes(daemon: Daemon): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "GET",
    path: "/api/daemon/status",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      return json_response({ status: daemon.get_status() }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/daemon/metrics",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      return json_response(daemon.get_metrics(), 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/daemon/events",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const events = daemon.get_events()
      return json_response({ events, count: events.length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/daemon/config",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      return json_response(daemon.get_config(), 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/start",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      try {
        const status = await daemon.start()
        return json_response({ status }, 200)
      } catch (e) {
        return json_response(
          { error: "daemon_error", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/stop",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      try {
        const status = await daemon.stop()
        return json_response({ status }, 200)
      } catch (e) {
        return json_response(
          { error: "daemon_error", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/pause",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      try {
        const status = await daemon.pause()
        return json_response({ status }, 200)
      } catch (e) {
        return json_response(
          { error: "daemon_error", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/resume",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      try {
        const status = await daemon.resume()
        return json_response({ status }, 200)
      } catch (e) {
        return json_response(
          { error: "daemon_error", message: String((e as Error).message) },
          400,
        )
      }
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/health",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const health = await daemon.run_health_check()
      return json_response({ health }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/recover",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const recovered = await daemon.run_plan_recovery()
      return json_response({ recovered }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/daemon/reset",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      daemon.reset_recovery_failures()
      return json_response({ reset: true }, 200)
    },
  })

  log_info("daemon_routes_setup")
  return routes
}

/**
 * 创建健康检查路由（V11）。
 *
 * GET /health      → 完整健康报告（readiness，检查所有探针）
 * GET /health/live → 存活检查（liveness，仅检查进程存活）
 * GET /health/ready → 就绪检查（等同 /health）
 *
 * 这些路由不需要鉴权（K8s 探针需要无认证访问）。
 */
export function setup_health_routes(endpoint: HealthEndpoint): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "GET",
    path: "/health",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const report = await endpoint.check()
      const status: number = report.status === "unhealthy" ? 503 : 200
      return json_response(report, status)
    },
  })

  routes.push({
    method: "GET",
    path: "/health/live",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const status = await endpoint.liveness()
      return json_response({ status }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/health/ready",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const report = await endpoint.readiness()
      const status: number = report.status === "unhealthy" ? 503 : 200
      return json_response(report, status)
    },
  })

  log_info("health_routes_setup")
  return routes
}

/**
 * 创建配置中心路由（V11）。
 *
 * GET    /api/config           → 列出所有配置键值
 * GET    /api/config/:key      → 获取指定配置值
 * POST   /api/config/:key      → 设置配置值  body: { value: unknown }
 * POST   /api/config/reload    → 热重载配置文件
 * GET    /api/config/status    → 获取配置管理器状态
 */
export function setup_config_routes(manager: ConfigManager): ApiRoute[] {
  const routes: ApiRoute[] = []

  routes.push({
    method: "GET",
    path: "/api/config",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const all = manager.get_all()
      return json_response({ config: all, count: Object.keys(all).length }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/config/status",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      return json_response({
        loaded: manager.is_loaded(),
        last_reloaded_at: manager.last_reloaded_at(),
        key_count: manager.keys().length,
      }, 200)
    },
  })

  routes.push({
    method: "GET",
    path: "/api/config/:key",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const key: string = ctx.params["key"] ?? ""
      const value: unknown = manager.get<unknown>(key)
      if (value === undefined) {
        return json_response({ error: "not_found", message: "config_key_not_found" }, 404)
      }
      return json_response({ key, value }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/config/:key",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const key: string = ctx.params["key"] ?? ""
      const body = (ctx.body ?? {}) as { value?: unknown }
      if (body.value === undefined) {
        return json_response(
          { error: "invalid_argument", message: "value_required" },
          400,
        )
      }
      manager.set(key, body.value)
      return json_response({ key, value: body.value, set: true }, 200)
    },
  })

  routes.push({
    method: "POST",
    path: "/api/config/reload",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const success: boolean = manager.reload()
      if (!success) {
        return json_response(
          { error: "reload_failed", message: "config_reload_failed" },
          400,
        )
      }
      return json_response({ reloaded: true, last_reloaded_at: manager.last_reloaded_at() }, 200)
    },
  })

  log_info("config_routes_setup")
  return routes
}

/**
 * 将 API 路由注册到 HttpServer（通过 server.get/post/put/delete 方法）。
 *
 * 用法：
 *   const server = new HttpServer({ port: 3000 })
 *   const routes = setup_api_routes(auth, messages, shell)
 *   register_routes(server, routes)
 *   server.start()
 */
export function register_routes(
  server: {
    get: (path: string, handler: HttpHandler) => void
    post: (path: string, handler: HttpHandler) => void
    put: (path: string, handler: HttpHandler) => void
    delete: (path: string, handler: HttpHandler) => void
  },
  routes: ApiRoute[],
): void {
  for (const route of routes) {
    switch (route.method) {
      case "GET":
        server.get(route.path, route.handler)
        break
      case "POST":
        server.post(route.path, route.handler)
        break
      case "PUT":
        server.put(route.path, route.handler)
        break
      case "DELETE":
        server.delete(route.path, route.handler)
        break
    }
  }
  log_info(`api_routes_registered: ${routes.length}`)
}

function validate_role(role: unknown): "user" | "assistant" | "system" {
  if (role === "user" || role === "assistant" || role === "system") {
    return role
  }
  return "user"
}
