import { log_info, log_warn } from "../../../core_infra/infra/global_logger.ts"
import { json_response } from "../../../core_infra/infra/http_middlewares.ts"
import type { HttpContext, HttpHandler } from "../../../core_infra/infra/http_router.ts"
import type { ApiRoute } from "./api_routes.ts"
import type { ConfigManager } from "../../services/config_manager.ts"

/**
 * V25: 配置项 schema 元数据。
 *
 * 描述每个已知配置键的类型、默认值和约束，用于：
 *   - 前端动态渲染配置表单
 *   - 运行时校验输入值
 *   - 重置到默认值
 */
export interface ConfigFieldSchema {
  /** 配置键（点分路径，如 "daemon.health_check_interval_ms"） */
  key: string
  /** 显示名称 */
  label: string
  /** 值类型 */
  type: "string" | "number" | "boolean" | "array" | "object"
  /** 默认值 */
  default: unknown
  /** 描述 */
  description: string
  /** 是否只读（运行时不可修改） */
  readonly: boolean
  /** 数值范围（type=number 时生效） */
  min?: number
  max?: number
  /** 字符串枚举（type=string 时生效） */
  enum?: string[]
}

/**
 * V25: 已知配置字段 schema 列表。
 *
 * 与 DEFAULT_CONFIG 保持一致，作为配置热更新的单一真相来源。
 */
export const CONFIG_SCHEMA: ConfigFieldSchema[] = [
  {
    key: "port",
    label: "HTTP Port",
    type: "number",
    default: 3000,
    description: "HTTP server listening port",
    readonly: true,
    min: 1,
    max: 65535,
  },
  {
    key: "max_turns",
    label: "Max Conversation Turns",
    type: "number",
    default: 50,
    description: "Maximum conversation turns before context reset",
    readonly: false,
    min: 1,
    max: 1000,
  },
  {
    key: "log_level",
    label: "Log Level",
    type: "string",
    default: "info",
    description: "Logging verbosity level",
    readonly: false,
    enum: ["debug", "info", "warn", "error"],
  },
  {
    key: "verbose",
    label: "Verbose Output",
    type: "boolean",
    default: false,
    description: "Enable verbose console output",
    readonly: false,
  },
  {
    key: "auth.rate_limit_max",
    label: "Rate Limit Max",
    type: "number",
    default: 100,
    description: "Maximum requests per minute per API key",
    readonly: false,
    min: 1,
    max: 10000,
  },
  {
    key: "daemon.health_check_interval_ms",
    label: "Daemon Health Check Interval",
    type: "number",
    default: 5000,
    description: "Interval between daemon health checks in milliseconds",
    readonly: false,
    min: 1000,
    max: 300000,
  },
  {
    key: "daemon.plan_recovery_interval_ms",
    label: "Plan Recovery Interval",
    type: "number",
    default: 3000,
    description: "Interval between plan recovery attempts in milliseconds",
    readonly: false,
    min: 1000,
    max: 300000,
  },
  {
    key: "daemon.auto_recover_plans",
    label: "Auto Recover Plans",
    type: "boolean",
    default: true,
    description: "Whether to automatically recover failed plans",
    readonly: false,
  },
  {
    key: "daemon.max_recovery_failures",
    label: "Max Recovery Failures",
    type: "number",
    default: 5,
    description: "Maximum recovery failures before giving up",
    readonly: false,
    min: 0,
    max: 100,
  },
  {
    key: "session.default_max_history",
    label: "Session Max History",
    type: "number",
    default: 50,
    description: "Default maximum message history per session",
    readonly: false,
    min: 1,
    max: 1000,
  },
  {
    key: "shell.timeout_ms",
    label: "Shell Timeout",
    type: "number",
    default: 30000,
    description: "Shell command execution timeout in milliseconds",
    readonly: false,
    min: 1000,
    max: 600000,
  },
]

/**
 * V25: 配置变更历史记录。
 */
export interface ConfigChangeRecord {
  /** 变更时间戳（毫秒） */
  timestamp: number
  /** 配置键 */
  key: string
  /** 旧值 */
  old_value: unknown
  /** 新值 */
  new_value: unknown
  /** 变更来源（api / reload / batch / reset） */
  source: string
}

/**
 * V25: 校验结果。
 */
export interface ConfigValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 错误信息（valid=false 时） */
  error?: string
}

/**
 * V25: 批量更新结果。
 */
export interface ConfigBatchUpdateResult {
  /** 成功更新的键 */
  updated: string[]
  /** 跳过的键（校验失败或只读） */
  skipped: Array<{ key: string; reason: string }>
  /** 变更记录数 */
  changes: number
}

/**
 * V25: 配置热更新管理器。
 *
 * 在 ConfigManager 之上提供增强的运行时配置管理能力：
 *   - 批量更新（带校验）
 *   - 单值校验（不实际写入）
 *   - 重置到默认值
 *   - 变更历史审计
 *   - 配置 schema 元数据
 *   - 与上次 reload 的差异
 *
 * 设计原则：
 *   - 不修改 ConfigManager 内部状态，仅包装增强
 *   - 所有变更记录在内存中（最多 max_history 条）
 *   - 校验失败不写入，保证配置一致性
 *   - 只读字段拒绝修改
 */
export class ConfigHotReloader {
  private readonly manager: ConfigManager
  private readonly history: ConfigChangeRecord[] = []
  private readonly max_history: number
  private readonly snapshot_before_reload: Map<string, unknown> = new Map()

  constructor(manager: ConfigManager, max_history: number = 200) {
    this.manager = manager
    this.max_history = max_history
    log_info("config_hot_reloader_created")
  }

  /**
   * 获取配置 schema。
   */
  get_schema(): ConfigFieldSchema[] {
    return [...CONFIG_SCHEMA]
  }

  /**
   * 查找指定键的 schema。
   */
  find_schema(key: string): ConfigFieldSchema | undefined {
    return CONFIG_SCHEMA.find((s) => s.key === key)
  }

  /**
   * 校验配置值（不写入）。
   */
  validate(key: string, value: unknown): ConfigValidationResult {
    const schema = this.find_schema(key)
    if (!schema) {
      // 未知键允许写入（用户自定义配置），但标记为未校验
      return { valid: true }
    }
    if (schema.readonly) {
      return { valid: false, error: `field '${key}' is readonly` }
    }
    if (schema.type === "number") {
      const num = Number(value)
      if (!Number.isFinite(num)) {
        return { valid: false, error: `field '${key}' must be a number` }
      }
      if (schema.min !== undefined && num < schema.min) {
        return { valid: false, error: `field '${key}' must be >= ${schema.min}` }
      }
      if (schema.max !== undefined && num > schema.max) {
        return { valid: false, error: `field '${key}' must be <= ${schema.max}` }
      }
    } else if (schema.type === "boolean") {
      if (typeof value !== "boolean" && value !== "true" && value !== "false") {
        return { valid: false, error: `field '${key}' must be a boolean` }
      }
    } else if (schema.type === "string") {
      if (typeof value !== "string") {
        return { valid: false, error: `field '${key}' must be a string` }
      }
      if (schema.enum && !schema.enum.includes(value)) {
        return { valid: false, error: `field '${key}' must be one of: ${schema.enum.join(", ")}` }
      }
    } else if (schema.type === "array") {
      if (!Array.isArray(value)) {
        return { valid: false, error: `field '${key}' must be an array` }
      }
    }
    return { valid: true }
  }

  /**
   * 设置单个配置值（带校验和历史记录）。
   *
   * @returns 校验失败返回 { ok: false, error }，成功返回 { ok: true }
   */
  set(key: string, value: unknown, source: string = "api"): { ok: boolean; error?: string } {
    const validation = this.validate(key, value)
    if (!validation.valid) {
      log_warn(`config_hot_reloader_set_rejected: ${key} ${validation.error}`)
      return { ok: false, error: validation.error }
    }
    const old_value = this.manager.get<unknown>(key)
    // 类型规范化（字符串 "true"/"false" → boolean，数字字符串 → number）
    const normalized = this.normalize_value(key, value)
    this.manager.set(key, normalized)
    this.record_change(key, old_value, normalized, source)
    return { ok: true }
  }

  /**
   * 批量更新配置。
   *
   * 逐个校验并写入，校验失败的键跳过但不影响其他键。
   */
  batch_update(
    updates: Record<string, unknown>,
    source: string = "batch",
  ): ConfigBatchUpdateResult {
    const updated: string[] = []
    const skipped: Array<{ key: string; reason: string }> = []
    let changes: number = 0

    for (const [key, value] of Object.entries(updates)) {
      const result = this.set(key, value, source)
      if (result.ok) {
        updated.push(key)
        changes++
      } else {
        skipped.push({ key, reason: result.error ?? "validation_failed" })
      }
    }

    log_info(`config_hot_reloader_batch: ${updated.length} updated, ${skipped.length} skipped`)
    return { updated, skipped, changes }
  }

  /**
   * 重置指定键到默认值。
   */
  reset(key: string, source: string = "reset"): { ok: boolean; error?: string } {
    const schema = this.find_schema(key)
    if (!schema) {
      return { ok: false, error: `unknown config key: ${key}` }
    }
    return this.set(key, schema.default, source)
  }

  /**
   * 重置所有已知键到默认值。
   */
  reset_all(source: string = "reset"): ConfigBatchUpdateResult {
    const updates: Record<string, unknown> = {}
    for (const schema of CONFIG_SCHEMA) {
      if (!schema.readonly) {
        updates[schema.key] = schema.default
      }
    }
    return this.batch_update(updates, source)
  }

  /**
   * 记录配置变更。
   */
  private record_change(
    key: string,
    old_value: unknown,
    new_value: unknown,
    source: string,
  ): void {
    const record: ConfigChangeRecord = {
      timestamp: Date.now(),
      key,
      old_value,
      new_value,
      source,
    }
    this.history.push(record)
    // 超出上限时丢弃最旧的记录
    while (this.history.length > this.max_history) {
      this.history.shift()
    }
  }

  /**
   * 规范化值类型（根据 schema）。
   */
  private normalize_value(key: string, value: unknown): unknown {
    const schema = this.find_schema(key)
    if (!schema) {
      return value
    }
    if (schema.type === "number") {
      return Number(value)
    }
    if (schema.type === "boolean") {
      if (typeof value === "string") {
        return value === "true" || value === "1" || value === "yes"
      }
      return Boolean(value)
    }
    return value
  }

  /**
   * 获取变更历史。
   *
   * @param limit 最多返回的记录数（默认全部）
   * @param key_filter 只返回指定键的变更（可选）
   */
  get_history(limit?: number, key_filter?: string): ConfigChangeRecord[] {
    let records = [...this.history]
    if (key_filter) {
      records = records.filter((r) => r.key === key_filter)
    }
    if (limit !== undefined && limit > 0) {
      records = records.slice(-limit)
    }
    return records
  }

  /**
   * 在 reload 前快照当前配置（用于后续 diff）。
   */
  snapshot_before_reload(): void {
    this.snapshot_before_reload.clear()
    const all = this.manager.get_all()
    for (const [key, value] of Object.entries(all)) {
      this.snapshot_before_reload.set(key, value)
    }
    log_info("config_hot_reloader_snapshot_taken")
  }

  /**
   * 执行 reload 并记录变更。
   */
  reload(): { ok: boolean; changes: number; error?: string } {
    this.snapshot_before_reload()
    const success = this.manager.reload()
    if (!success) {
      return { ok: false, changes: 0, error: "reload_failed" }
    }
    // 对比快照，记录差异
    const current = this.manager.get_all()
    let changes = 0
    for (const [key, value] of Object.entries(current)) {
      const old = this.snapshot_before_reload.get(key)
      if (old !== value && JSON.stringify(old) !== JSON.stringify(value)) {
        this.record_change(key, old, value, "reload")
        changes++
      }
    }
    // 快照中存在但 reload 后消失的键
    for (const [key, old] of this.snapshot_before_reload) {
      if (!(key in current)) {
        this.record_change(key, old, undefined, "reload")
        changes++
      }
    }
    log_info(`config_hot_reloader_reload: ${changes} changes`)
    return { ok: true, changes }
  }

  /**
   * 获取当前配置与默认值的差异。
   *
   * 返回所有与默认值不同的键。
   */
  get_diff(): Array<{ key: string; current: unknown; default: unknown }> {
    const diff: Array<{ key: string; current: unknown; default: unknown }> = []
    for (const schema of CONFIG_SCHEMA) {
      const current = this.manager.get<unknown>(schema.key)
      if (current === undefined) {
        continue
      }
      if (JSON.stringify(current) !== JSON.stringify(schema.default)) {
        diff.push({ key: schema.key, current, default: schema.default })
      }
    }
    return diff
  }

  /**
   * 清空变更历史。
   */
  clear_history(): void {
    this.history.length = 0
    log_info("config_hot_reloader_history_cleared")
  }
}

/**
 * V25: 设置配置热更新 API 路由。
 *
 * 在现有 /api/config/* 路由之上扩展：
 *   GET    /api/config/schema          → 获取配置 schema
 *   POST   /api/config/validate        → 校验配置值  body: { key, value }
 *   POST   /api/config/batch           → 批量更新    body: { updates: { key: value, ... } }
 *   POST   /api/config/reset/:key      → 重置单个键
 *   POST   /api/config/reset-all       → 重置所有可变键
 *   GET    /api/config/history         → 获取变更历史  query: ?limit=N&key=xxx
 *   GET    /api/config/diff            → 获取与默认值的差异
 *   POST   /api/config/hot-reload      → 热重载（带变更追踪）
 *   DELETE /api/config/history         → 清空变更历史
 */
export function setup_hot_reload_routes(manager: ConfigManager): ApiRoute[] {
  const reloader = new ConfigHotReloader(manager)
  const routes: ApiRoute[] = []

  // GET /api/config/schema
  routes.push({
    method: "GET",
    path: "/api/config/schema",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      return json_response({
        schema: reloader.get_schema(),
        total: CONFIG_SCHEMA.length,
      }, 200)
    },
  })

  // POST /api/config/validate
  routes.push({
    method: "POST",
    path: "/api/config/validate",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { key?: string; value?: unknown }
      const key = String(body.key ?? "")
      if (key.length === 0) {
        return json_response(
          { error: "invalid_argument", message: "key_required" },
          400,
        )
      }
      const result = reloader.validate(key, body.value)
      return json_response({ key, value: body.value, ...result }, 200)
    },
  })

  // POST /api/config/batch
  routes.push({
    method: "POST",
    path: "/api/config/batch",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const body = (ctx.body ?? {}) as { updates?: Record<string, unknown> }
      const updates = body.updates ?? {}
      if (Object.keys(updates).length === 0) {
        return json_response(
          { error: "invalid_argument", message: "updates_required" },
          400,
        )
      }
      const result = reloader.batch_update(updates, "api_batch")
      return json_response(result, 200)
    },
  })

  // POST /api/config/reset/:key
  routes.push({
    method: "POST",
    path: "/api/config/reset/:key",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const key = ctx.params["key"] ?? ""
      const result = reloader.reset(key, "api_reset")
      if (!result.ok) {
        return json_response(
          { error: "reset_failed", message: result.error },
          400,
        )
      }
      return json_response({ key, reset: true }, 200)
    },
  })

  // POST /api/config/reset-all
  routes.push({
    method: "POST",
    path: "/api/config/reset-all",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const result = reloader.reset_all("api_reset_all")
      return json_response(result, 200)
    },
  })

  // GET /api/config/history
  routes.push({
    method: "GET",
    path: "/api/config/history",
    handler: async (ctx: HttpContext): Promise<Response> => {
      const query = ctx.query ?? {}
      const limit = query.limit ? parseInt(String(query.limit), 10) : undefined
      const key_filter = query.key ? String(query.key) : undefined
      const records = reloader.get_history(limit, key_filter)
      return json_response({ history: records, count: records.length }, 200)
    },
  })

  // DELETE /api/config/history
  routes.push({
    method: "DELETE",
    path: "/api/config/history",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      reloader.clear_history()
      return json_response({ cleared: true }, 200)
    },
  })

  // GET /api/config/diff
  routes.push({
    method: "GET",
    path: "/api/config/diff",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const diff = reloader.get_diff()
      return json_response({ diff, count: diff.length }, 200)
    },
  })

  // POST /api/config/hot-reload
  routes.push({
    method: "POST",
    path: "/api/config/hot-reload",
    handler: async (_ctx: HttpContext): Promise<Response> => {
      const result = reloader.reload()
      if (!result.ok) {
        return json_response(
          { error: "reload_failed", message: result.error },
          400,
        )
      }
      return json_response({
        reloaded: true,
        changes: result.changes,
      }, 200)
    },
  })

  log_info("hot_reload_routes_setup")
  return routes
}

/**
 * V25: 从 ConfigManager 创建 ConfigHotReloader 实例。
 *
 * 供需要直接操作热更新器的场景使用（如 CLI 命令）。
 */
export function create_hot_reloader(manager: ConfigManager, max_history?: number): ConfigHotReloader {
  return new ConfigHotReloader(manager, max_history)
}
