import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { AsyncCircuitBreaker } from "../../core_infra/infra/async_circuit_breaker.ts"
import { log_info, log_warn } from "../../core_infra/infra/global_logger.ts"
import type { Message } from "../../core_infra/core/message_types.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"
import type { IAsyncLlmAdapter, LlmResponse, LlmStreamChunk } from "../../core_infra/core/i_llm_adapter.ts"
import type { IAsyncMessageService } from "../../core_infra/core/i_async_services.ts"
import { AsyncMessageService } from "./async_services.ts"
import { ConversationEngine } from "./conversation_engine.ts"
import type {
  Session,
  SessionConfig,
  SessionListItem,
  SessionPersistData,
} from "./session_types.ts"

/**
 * 会话内部状态：消息服务 + 对话引擎。
 */
interface SessionState {
  messages: IAsyncMessageService
  engine: ConversationEngine
}

/**
 * SessionManager - 会话管理器（V4）。
 *
 * 管理多个独立对话会话，每个会话拥有：
 *   - 唯一 session ID
 *   - 独立的 ConversationEngine（消息历史 + LLM 适配器）
 *   - 元数据（标题、创建/更新时间、system prompt）
 *
 * 功能：
 *   - create_session: 创建新会话
 *   - get_session: 获取会话元数据
 *   - list_sessions: 列出所有会话
 *   - delete_session: 删除会话
 *   - chat: 在指定会话中对话
 *   - get_history: 获取会话消息历史
 *   - clear_history: 清空会话历史
 *   - persist / load: 持久化到 IStorage
 *
 * 使用 AsyncLock 保护会话映射，避免并发操作竞态。
 * 使用 AsyncCircuitBreaker 包裹 chat 操作，防止 LLM 持续失败时雪崩。
 */
export class SessionManager {
  private states: Map<string, SessionState> = new Map()
  private metadata: Map<string, Session> = new Map()
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly breaker: AsyncCircuitBreaker = new AsyncCircuitBreaker(5, 30000)
  private readonly llm: IAsyncLlmAdapter
  private readonly storage: IStorage | null
  private readonly storage_key: string = "sessions"
  private readonly default_max_history: number
  private id_counter: number = 0

  constructor(
    llm: IAsyncLlmAdapter,
    options: {
      storage?: IStorage
      default_max_history?: number
    } = {},
  ) {
    this.llm = llm
    this.storage = options.storage ?? null
    this.default_max_history = options.default_max_history ?? 50
    log_info(
      `session_manager_created: storage=${this.storage !== null} max_history=${this.default_max_history}`,
    )
  }

  /**
   * 创建新会话。
   */
  async create_session(config: SessionConfig = {}): Promise<Session> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("session_create_lock_failed")
    }
    try {
      this.id_counter += 1
      const id: string = String(this.id_counter)
      const now: number = Date.now()
      const session: Session = {
        id,
        title: config.title ?? `Session ${id}`,
        created_at: now,
        updated_at: now,
        system_prompt: config.system_prompt ?? null,
        message_count: 0,
      }
      const messages: IAsyncMessageService = new AsyncMessageService()
      const engine: ConversationEngine = new ConversationEngine(messages, this.llm, {
        system_prompt: config.system_prompt ?? undefined,
        max_history: config.max_history ?? this.default_max_history,
      })
      this.states.set(id, { messages, engine })
      this.metadata.set(id, session)
      log_info(`session_created: id=${id} title=${session.title}`)
      await this.persist()
      return { ...session }
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取会话元数据。
   */
  async get_session(id: string): Promise<Session | null> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return null
    }
    try {
      const meta: Session | undefined = this.metadata.get(id)
      if (!meta) {
        return null
      }
      const state: SessionState | undefined = this.states.get(id)
      const messages: Message[] = state ? await state.messages.get_all() : []
      return { ...meta, message_count: messages.length }
    } finally {
      this.lock.release()
    }
  }

  /**
   * 列出所有会话（精简视图）。
   */
  async list_sessions(): Promise<SessionListItem[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      const list: SessionListItem[] = []
      for (const [id, meta] of this.metadata) {
        const state: SessionState | undefined = this.states.get(id)
        const messages: Message[] = state ? await state.messages.get_all() : []
        list.push({
          id,
          title: meta.title,
          created_at: meta.created_at,
          updated_at: meta.updated_at,
          message_count: messages.length,
        })
      }
      list.sort((a, b) => b.updated_at - a.updated_at)
      return list
    } finally {
      this.lock.release()
    }
  }

  /**
   * 删除会话。
   */
  async delete_session(id: string): Promise<boolean> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return false
    }
    try {
      const existed: boolean = this.states.delete(id)
      this.metadata.delete(id)
      if (existed) {
        log_info(`session_deleted: id=${id}`)
        await this.persist()
      }
      return existed
    } finally {
      this.lock.release()
    }
  }

  /**
   * 在指定会话中对话。
   */
  async chat(session_id: string, user_message: string): Promise<LlmResponse> {
    const fallback: LlmResponse = {
      content: "",
      model: "unknown",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      finish_reason: null,
    }
    return this.breaker.execute(async () => {
      const state: SessionState | undefined = this.states.get(session_id)
      if (!state) {
        log_warn(`session_not_found: ${session_id}`)
        throw new Error("session_not_found")
      }
      const response: LlmResponse = await state.engine.chat(user_message)
      // 更新元数据
      const acquired: boolean = await this.lock.acquire(5000)
      if (acquired) {
        try {
          const meta: Session | undefined = this.metadata.get(session_id)
          if (meta) {
            meta.updated_at = Date.now()
            this.metadata.set(session_id, meta)
          }
          await this.persist()
        } finally {
          this.lock.release()
        }
      }
      return response
    }, fallback)
  }

  /**
   * 在指定会话中流式对话（V5）。
   *
   * 委托给会话的 ConversationEngine.stream_chat，逐块 yield LlmStreamChunk。
   * 流结束后更新会话元数据并持久化。
   */
  async *stream_chat(session_id: string, user_message: string): AsyncGenerator<LlmStreamChunk> {
    log_info(`session_stream: id=${session_id} msg_len=${user_message.length}`)
    const state: SessionState | undefined = this.states.get(session_id)
    if (!state) {
      log_warn(`session_not_found: ${session_id}`)
      throw new Error("session_not_found")
    }
    // 委托给引擎的流式方法
    yield* state.engine.stream_chat(user_message)
    // 流结束后更新元数据并持久化
    const acquired: boolean = await this.lock.acquire(5000)
    if (acquired) {
      try {
        const meta: Session | undefined = this.metadata.get(session_id)
        if (meta) {
          meta.updated_at = Date.now()
          this.metadata.set(session_id, meta)
        }
        await this.persist()
      } finally {
        this.lock.release()
      }
    }
  }

  /**
   * 获取会话消息历史。
   */
  async get_history(session_id: string): Promise<Message[]> {
    const state: SessionState | undefined = this.states.get(session_id)
    if (!state) {
      return []
    }
    return state.messages.get_all()
  }

  /**
   * 清空会话消息历史。
   */
  async clear_history(session_id: string): Promise<boolean> {
    const state: SessionState | undefined = this.states.get(session_id)
    if (!state) {
      return false
    }
    await state.messages.clear()
    const acquired: boolean = await this.lock.acquire(5000)
    if (acquired) {
      try {
        const meta: Session | undefined = this.metadata.get(session_id)
        if (meta) {
          meta.updated_at = Date.now()
          this.metadata.set(session_id, meta)
        }
        await this.persist()
      } finally {
        this.lock.release()
      }
    }
    return true
  }

  /**
   * 持久化所有会话到存储。
   */
  async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    const data: SessionPersistData[] = []
    for (const [id, meta] of this.metadata) {
      const state: SessionState | undefined = this.states.get(id)
      const messages: Message[] = state ? await state.messages.get_all() : []
      data.push({
        id,
        title: meta.title,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        system_prompt: meta.system_prompt,
        max_history: this.default_max_history,
        messages,
      })
    }
    await this.storage.save(this.storage_key, data).catch((e: unknown) => {
      log_warn(`session_persist_failed: ${e}`)
    })
  }

  /**
   * 从存储恢复所有会话。
   */
  async load_from_storage(): Promise<void> {
    if (!this.storage) {
      return
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("session_load_lock_failed")
      return
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (!Array.isArray(data)) {
        return
      }
      const sessions = data as SessionPersistData[]
      let max_id: number = 0
      for (const s of sessions) {
        const id_num: number = Number(s.id)
        if (Number.isFinite(id_num) && id_num > max_id) {
          max_id = id_num
        }
        const messages: IAsyncMessageService = new AsyncMessageService()
        // 恢复消息历史
        for (const m of s.messages) {
          await messages.add(m.content, m.role)
        }
        const engine: ConversationEngine = new ConversationEngine(messages, this.llm, {
          system_prompt: s.system_prompt ?? undefined,
          max_history: s.max_history ?? this.default_max_history,
        })
        this.states.set(s.id, { messages, engine })
        this.metadata.set(s.id, {
          id: s.id,
          title: s.title,
          created_at: s.created_at,
          updated_at: s.updated_at,
          system_prompt: s.system_prompt,
          message_count: s.messages.length,
        })
      }
      this.id_counter = max_id
      log_info(`session_loaded: ${sessions.length} sessions`)
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取会话数量。
   */
  async count(): Promise<number> {
    return this.metadata.size
  }
}
