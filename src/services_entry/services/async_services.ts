import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { AsyncCircuitBreaker } from "../../core_infra/infra/async_circuit_breaker.ts"
import { log_info, log_warn } from "../../core_infra/infra/global_logger.ts"
import { create_message, normalize_message } from "../../core_infra/core/message_pipeline.ts"
import type { Message } from "../../core_infra/core/message_types.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"
import { ErrorCode } from "../../core_infra/core/error_code_enum.ts"
import { validate_auth_token } from "./auth_validator.ts"
import { execute_command_async, validate_command, set_allowed_cwd } from "./shell_executor.ts"
import type { AuthStatus, AuthToken } from "./auth_types.ts"
import type { ShellCommand, ShellResult } from "./shell_types.ts"
import type { ApiRequest, ApiResponse } from "../../core_infra/core/i_api_gateway.ts"
import type {
  IAsyncAuthService,
  IAsyncMessageService,
  IAsyncShellService,
  IAsyncApiGateway,
} from "../../core_infra/core/i_async_services.ts"

/**
 * AsyncAuthService - 异步认证服务。
 *
 * 使用 AsyncLock 保护 token 状态，避免并发 set_token 竞态。
 * 使用 AsyncCircuitBreaker 包裹 validate，防止连续认证失败时雪崩。
 */
export class AsyncAuthService implements IAsyncAuthService {
  private token: AuthToken | null = null
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(5, 30000)

  async validate(): Promise<boolean> {
    log_info("async_auth_validate")
    return this.breaker.execute(async () => {
      const acquired: boolean = await this.lock.acquire(5000)
      if (!acquired) {
        log_warn("async_auth_validate_lock_failed")
        return false
      }
      try {
        const has_token: boolean = this.token !== null && this.token.token.length > 0
        const not_expired: boolean = !(await this.is_token_expired_unlocked())
        return has_token && not_expired
      } finally {
        this.lock.release()
      }
    }, false)
  }

  async set_token(token: AuthToken): Promise<void> {
    log_info(`async_auth_set_token: source=${token.source}`)
    validate_auth_token(token)
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("async_auth_set_token_lock_failed")
    }
    try {
      this.token = token
    } finally {
      this.lock.release()
    }
  }

  async get_status(): Promise<AuthStatus> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("async_auth_get_status_lock_failed")
      return { is_authenticated: false, source: "none" }
    }
    try {
      if (this.token === null) {
        return { is_authenticated: false, source: "none" }
      }
      if (await this.is_token_expired_unlocked()) {
        return { is_authenticated: false, source: this.token.source }
      }
      return { is_authenticated: true, source: this.token.source }
    } finally {
      this.lock.release()
    }
  }

  async is_token_expired(): Promise<boolean> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return true
    }
    try {
      return await this.is_token_expired_unlocked()
    } finally {
      this.lock.release()
    }
  }

  private async is_token_expired_unlocked(): Promise<boolean> {
    if (this.token === null) {
      return true
    }
    if (!Number.isFinite(this.token.expires_at)) {
      log_warn("async_auth_invalid_expires_at")
      return true
    }
    return Date.now() > this.token.expires_at
  }

  async to_object(): Promise<Record<string, unknown>> {
    return { has_token: this.token !== null }
  }
}

/**
 * AsyncMessageService - 异步消息服务。
 *
 * 使用 AsyncLock 保护 messages 数组，避免并发 add/clear 竞态。
 * 使用 AsyncCircuitBreaker 包裹 add，防止消息创建持续失败时雪崩。
 * 可选注入 IStorage 实现持久化：add/clear 时自动保存/删除，load_from_storage 恢复。
 */
export class AsyncMessageService implements IAsyncMessageService {
  private messages: Message[] = []
  private id_counter: number = 0
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(5, 30000)
  private readonly storage: IStorage | null = null
  private readonly storage_key: string = "messages"

  constructor(storage?: IStorage) {
    if (storage) {
      this.storage = storage
      log_info("async_message_service_persistent")
    }
  }

  async validate(): Promise<boolean> {
    return true
  }

  async add(content: string, role: "user" | "assistant" | "system"): Promise<Message> {
    log_info(`async_message_add: role=${role}`)
    return this.breaker.execute(async () => {
      const acquired: boolean = await this.lock.acquire(5000)
      if (!acquired) {
        throw new Error("async_message_add_lock_failed")
      }
      try {
        this.id_counter += 1
        const msg: Message = create_message(String(this.id_counter), content, role)
        this.messages.push(msg)
        await this.persist()
        return { ...msg }
      } finally {
        this.lock.release()
      }
    }, null as unknown as Message)
  }

  async normalize_all(): Promise<Message[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      return this.messages.map((m) => normalize_message({ ...m }))
    } finally {
      this.lock.release()
    }
  }

  async get_all(): Promise<Message[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      return this.messages.map((m) => ({ ...m }))
    } finally {
      this.lock.release()
    }
  }

  async clear(): Promise<void> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("async_message_clear_lock_failed")
      return
    }
    try {
      this.messages = []
      this.id_counter = 0
      if (this.storage) {
        await this.storage.delete(this.storage_key).catch((e: unknown) => {
          log_warn(`async_message_clear_persist_failed: ${e}`)
        })
      }
    } finally {
      this.lock.release()
    }
  }

  async to_object(): Promise<Record<string, unknown>> {
    return { count: this.messages.length }
  }

  /**
   * 从持久化存储加载消息（仅在注入了 IStorage 时有效）。
   * 加载后恢复 messages 数组和 id_counter。
   */
  async load_from_storage(): Promise<void> {
    if (!this.storage) {
      return
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("async_message_load_lock_failed")
      return
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (Array.isArray(data)) {
        this.messages = data as Message[]
        let max_id: number = 0
        for (const m of this.messages) {
          const id_num: number = Number(m.id)
          if (Number.isFinite(id_num) && id_num > max_id) {
            max_id = id_num
          }
        }
        this.id_counter = max_id
        log_info(`async_message_loaded: ${this.messages.length}`)
      }
    } finally {
      this.lock.release()
    }
  }

  private async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    await this.storage.save(this.storage_key, this.messages).catch((e: unknown) => {
      log_warn(`async_message_persist_failed: ${e}`)
    })
  }
}

/**
 * AsyncShellService - 异步 Shell 服务。
 *
 * 使用 AsyncCircuitBreaker 包裹 run，防止命令执行持续失败时雪崩。
 * 使用 AsyncLock 保护 history，避免并发写入竞态。
 * V1：使用 Bun.spawn 真实执行命令，支持安全控制（黑名单/超时/cwd 限制）。
 */
export class AsyncShellService implements IAsyncShellService {
  private history: ShellCommand[] = []
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(3, 30000)
  private readonly max_history: number = 1000
  private readonly cwd: string | null = null

  constructor(cwd?: string) {
    if (cwd) {
      this.cwd = cwd
      set_allowed_cwd(cwd)
    }
  }

  async validate(): Promise<boolean> {
    return true
  }

  async run(cmd: ShellCommand): Promise<ShellResult> {
    log_info(`async_shell_run: ${cmd.command}`)
    const fallback: ShellResult = { exit_code: 1, stdout: "", stderr: "circuit_open" }
    return this.breaker.execute(async () => {
      if (!validate_command(cmd)) {
        log_warn("async_shell_run_invalid_command")
        throw new Error("invalid_command")
      }
      const result: ShellResult = await execute_command_async(cmd, this.cwd ?? undefined)
      const acquired: boolean = await this.lock.acquire(5000)
      if (!acquired) {
        log_warn("async_shell_history_lock_failed")
        return result
      }
      try {
        this.history.push({ ...cmd })
        if (this.history.length > this.max_history) {
          this.history.shift()
        }
      } finally {
        this.lock.release()
      }
      return result
    }, fallback)
  }

  async get_history(): Promise<ShellCommand[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      return this.history.map((c) => ({ ...c }))
    } finally {
      this.lock.release()
    }
  }

  async to_object(): Promise<Record<string, unknown>> {
    return { history_count: this.history.length }
  }
}

/**
 * AsyncApiGateway - 异步 API 网关。
 *
 * 将请求路由到对应的异步业务服务，修复原 ApiGateway 只回显不路由的问题。
 * 支持的 action：
 *   - auth.status / auth.validate
 *   - message.add / message.list / message.clear
 *   - shell.run / shell.history
 */
export class AsyncApiGateway implements IAsyncApiGateway {
  private readonly auth: IAsyncAuthService
  private readonly messages: IAsyncMessageService
  private readonly shell: IAsyncShellService

  constructor(auth: IAsyncAuthService, messages: IAsyncMessageService, shell: IAsyncShellService) {
    this.auth = auth
    this.messages = messages
    this.shell = shell
  }

  async handle_request(request: ApiRequest): Promise<ApiResponse> {
    if (!request || typeof request.action !== "string" || request.action.length === 0) {
      log_warn("async_api_gateway_invalid_request")
      return { success: false, error_code: ErrorCode.INVALID_ARGUMENT, data: null }
    }
    log_info(`async_api_gateway_handle_request: action=${request.action}`)

    try {
      const data: unknown = await this.dispatch(request)
      return { success: true, error_code: null, data }
    } catch (error) {
      log_warn(`async_api_gateway_error: ${error}`)
      return {
        success: false,
        error_code: ErrorCode.UNKNOWN_ERROR,
        data: { error: String(error) },
      }
    }
  }

  private async dispatch(request: ApiRequest): Promise<unknown> {
    const action: string = request.action
    const payload: Record<string, unknown> = request.payload || {}

    switch (action) {
      case "auth.status":
        return await this.auth.get_status()
      case "auth.validate":
        return await this.auth.validate()
      case "message.add":
        return await this.messages.add(
          String(payload.content ?? ""),
          (payload.role as "user" | "assistant" | "system") ?? "user",
        )
      case "message.list":
        return await this.messages.get_all()
      case "message.clear":
        await this.messages.clear()
        return { cleared: true }
      case "shell.run":
        return await this.shell.run({
          command: String(payload.command ?? ""),
          timeout_ms: Number(payload.timeout_ms ?? 5000),
        })
      case "shell.history":
        return await this.shell.get_history()
      default:
        throw new Error(`unknown_action: ${action}`)
    }
  }
}
