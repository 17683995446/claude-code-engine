import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { log_info, log_warn } from "../../core_infra/infra/global_logger.ts"
import type { IAgent, AgentInfo, AgentAction, AgentResult } from "../../core_infra/core/i_agent.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"

/**
 * AgentRegistry - Agent 注册中心（V6）。
 *
 * 管理所有已注册的 Agent，提供：
 *   - register：注册新 Agent
 *   - unregister：注销 Agent
 *   - get：获取 Agent
 *   - list：列出所有 Agent
 *   - invoke：通过 ID 调用 Agent 动作
 *   - persist / load：持久化 Agent 元数据到 IStorage
 *
 * 使用 AsyncLock 保护注册表，避免并发操作竞态。
 *
 * Agent 实例本身不持久化（可能持有运行时资源如连接、进程），
 * 仅持久化元数据（AgentInfo），恢复时由调用方重新注册 Agent 实例。
 */
export class AgentRegistry {
  private agents: Map<string, IAgent> = new Map()
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly storage: IStorage | null
  private readonly storage_key: string = "agent_registry"
  private id_counter: number = 0

  constructor(options: { storage?: IStorage } = {}) {
    this.storage = options.storage ?? null
    log_info(`agent_registry_created: storage=${this.storage !== null}`)
  }

  /**
   * 注册 Agent。
   *
   * @param agent 要注册的 Agent 实例
   * @returns Agent ID
   * @throws 如果 ID 已存在
   */
  async register(agent: IAgent): Promise<string> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("agent_registry_lock_failed")
    }
    try {
      const id: string = agent.get_id()
      if (this.agents.has(id)) {
        log_warn(`agent_already_exists: id=${id}`)
        throw new Error(`agent_already_exists: ${id}`)
      }
      await agent.init()
      this.agents.set(id, agent)
      const id_num: number = Number(id)
      if (Number.isFinite(id_num) && id_num > this.id_counter) {
        this.id_counter = id_num
      }
      log_info(`agent_registered: id=${id} name=${agent.get_name()}`)
      await this.persist()
      return id
    } finally {
      this.lock.release()
    }
  }

  /**
   * 注销 Agent。
   */
  async unregister(id: string): Promise<boolean> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return false
    }
    try {
      const agent: IAgent | undefined = this.agents.get(id)
      if (!agent) {
        return false
      }
      await agent.stop()
      this.agents.delete(id)
      log_info(`agent_unregistered: id=${id}`)
      await this.persist()
      return true
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取 Agent 实例。
   */
  async get(id: string): Promise<IAgent | null> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return null
    }
    try {
      return this.agents.get(id) ?? null
    } finally {
      this.lock.release()
    }
  }

  /**
   * 列出所有 Agent 元数据。
   */
  async list(): Promise<AgentInfo[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      const infos: AgentInfo[] = []
      for (const agent of this.agents.values()) {
        infos.push(agent.get_info())
      }
      infos.sort((a, b) => a.created_at - b.created_at)
      return infos
    } finally {
      this.lock.release()
    }
  }

  /**
   * 启动 Agent。
   */
  async start_agent(id: string): Promise<boolean> {
    const agent: IAgent | null = await this.get(id)
    if (!agent) {
      return false
    }
    await agent.start()
    return true
  }

  /**
   * 停止 Agent。
   */
  async stop_agent(id: string): Promise<boolean> {
    const agent: IAgent | null = await this.get(id)
    if (!agent) {
      return false
    }
    await agent.stop()
    return true
  }

  /**
   * 通过 ID 调用 Agent 动作。
   *
   * @param id Agent ID
   * @param action 动作
   * @returns 执行结果
   */
  async invoke(id: string, action: AgentAction): Promise<AgentResult> {
    const agent: IAgent | null = await this.get(id)
    if (!agent) {
      return {
        success: false,
        output: null,
        error: `agent_not_found: ${id}`,
        duration_ms: 0,
      }
    }
    if (agent.get_status() !== "running") {
      await agent.start()
    }
    return agent.act(action)
  }

  /**
   * 生成下一个 Agent ID。
   */
  next_id(): string {
    this.id_counter += 1
    return String(this.id_counter)
  }

  /**
   * 获取已注册 Agent 数量。
   */
  async count(): Promise<number> {
    return this.agents.size
  }

  /**
   * 持久化 Agent 元数据到存储。
   */
  async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    const data: AgentInfo[] = []
    for (const agent of this.agents.values()) {
      data.push(agent.get_info())
    }
    await this.storage.save(this.storage_key, data).catch((e: unknown) => {
      log_warn(`agent_registry_persist_failed: ${e}`)
    })
  }

  /**
   * 从存储加载 Agent 元数据（仅恢复元数据，不恢复 Agent 实例）。
   *
   * @returns 已保存的 AgentInfo 列表
   */
  async load_from_storage(): Promise<AgentInfo[]> {
    if (!this.storage) {
      return []
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("agent_registry_load_lock_failed")
      return []
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (!Array.isArray(data)) {
        return []
      }
      const infos = data as AgentInfo[]
      let max_id: number = 0
      for (const info of infos) {
        const id_num: number = Number(info.id)
        if (Number.isFinite(id_num) && id_num > max_id) {
          max_id = id_num
        }
      }
      this.id_counter = max_id
      log_info(`agent_registry_loaded: ${infos.length} agents`)
      return infos
    } finally {
      this.lock.release()
    }
  }
}
