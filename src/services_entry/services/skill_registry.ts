import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"
import type {
  ISkill,
  SkillDefinition,
  SkillMetadata,
  SkillResult,
  SkillPersistData,
  CompositeStep,
} from "../../core_infra/core/i_skill.ts"
import { CompositeSkill } from "./skills.ts"

/**
 * SkillRegistry - 技能注册中心（V8）。
 *
 * 管理所有已注册的技能（内置和学习型），提供：
 *   - register：注册技能
 *   - unregister：注销技能
 *   - get：获取技能
 *   - list：列出所有技能元数据
 *   - invoke：通过 ID 调用技能
 *   - learn_skill：学习新技能（自我增强，注册组合技能）
 *   - persist / load：持久化学习型技能到 IStorage
 *
 * 自我增强机制：
 *   - learn_skill 接受 SkillDefinition（handler_type === "composite"）
 *   - 注册后即可像内置技能一样被调用
 *   - 组合技能的步骤可调用任何已注册技能（包括其他组合技能）
 *   - 学习型技能持久化到存储，重启后自动恢复
 *
 * 使用 AsyncLock 保护注册表，避免并发操作竞态。
 */
export class SkillRegistry {
  private skills: Map<string, ISkill> = new Map()
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly storage: IStorage | null
  private readonly storage_key: string = "skill_registry"

  constructor(options: { storage?: IStorage } = {}) {
    this.storage = options.storage ?? null
    log_info(`skill_registry_created: storage=${this.storage !== null}`)
  }

  /**
   * 注册技能。
   *
   * @param skill 技能实例
   * @returns 技能 ID
   * @throws 如果 ID 已存在
   */
  async register(skill: ISkill): Promise<string> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("skill_registry_lock_failed")
    }
    try {
      const id: string = skill.get_id()
      if (this.skills.has(id)) {
        log_warn(`skill_already_exists: id=${id}`)
        throw new Error(`skill_already_exists: ${id}`)
      }
      this.skills.set(id, skill)
      log_info(`skill_registered: id=${id} name=${skill.get_metadata().name} builtin=${skill.get_metadata().builtin}`)
      // 只有学习型技能（非内置）才需要持久化；内置技能由代码注册，避免覆盖已保存的学习型技能
      if (!skill.get_metadata().builtin) {
        await this.persist()
      }
      return id
    } finally {
      this.lock.release()
    }
  }

  /**
   * 注销技能。
   * 内置技能不可注销。
   */
  async unregister(id: string): Promise<boolean> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return false
    }
    try {
      const skill: ISkill | undefined = this.skills.get(id)
      if (!skill) {
        return false
      }
      if (skill.get_metadata().builtin) {
        log_warn(`skill_cannot_unregister_builtin: id=${id}`)
        return false
      }
      this.skills.delete(id)
      log_info(`skill_unregistered: id=${id}`)
      await this.persist()
      return true
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取技能实例。
   */
  async get(id: string): Promise<ISkill | null> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return null
    }
    try {
      return this.skills.get(id) ?? null
    } finally {
      this.lock.release()
    }
  }

  /**
   * 列出所有技能元数据。
   */
  async list(): Promise<SkillMetadata[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      const metas: SkillMetadata[] = []
      for (const skill of this.skills.values()) {
        metas.push(skill.get_metadata())
      }
      metas.sort((a, b) => a.created_at - b.created_at)
      return metas
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取技能定义。
   */
  async get_definition(id: string): Promise<SkillDefinition | null> {
    const skill: ISkill | null = await this.get(id)
    if (!skill) {
      return null
    }
    return skill.get_definition()
  }

  /**
   * 通过 ID 调用技能。
   *
   * @param id 技能 ID
   * @param input 输入参数
   * @returns 执行结果
   */
  async invoke(id: string, input: Record<string, unknown>): Promise<SkillResult> {
    const skill: ISkill | null = await this.get(id)
    if (!skill) {
      return {
        success: false,
        output: null,
        error: `skill_not_found: ${id}`,
        duration_ms: 0,
      }
    }
    return skill.execute(input)
  }

  /**
   * 学习新技能（自我增强）。
   *
   * 注册一个组合技能，由多个已注册技能调用步骤组成。
   * 学习后即可像内置技能一样被调用。
   *
   * @param definition 技能定义（handler_type 必须为 "composite"）
   * @returns 技能 ID
   */
  async learn_skill(definition: SkillDefinition): Promise<string> {
    if (definition.handler_type !== "composite") {
      throw new Error("learn_skill_requires_composite_handler")
    }
    if (!definition.steps || definition.steps.length === 0) {
      throw new Error("composite_skill_requires_steps")
    }
    // 验证步骤
    this.validate_composite_steps(definition.steps)

    // 创建组合技能实例，注入 invoker（回调本 registry 的 invoke 方法）
    const invoker = async (skill_id: string, input: Record<string, unknown>): Promise<SkillResult> => {
      return this.invoke(skill_id, input)
    }
    const skill: CompositeSkill = new CompositeSkill(definition, invoker)
    return this.register(skill)
  }

  /**
   * 获取已注册技能数量。
   */
  async count(): Promise<number> {
    return this.skills.size
  }

  /**
   * 验证组合技能步骤：ID 唯一、依赖存在、无循环依赖。
   */
  private validate_composite_steps(steps: CompositeStep[]): void {
    const ids: Set<string> = new Set()
    for (const step of steps) {
      if (ids.has(step.id)) {
        throw new Error(`duplicate_step_id: ${step.id}`)
      }
      ids.add(step.id)
    }
    for (const step of steps) {
      for (const dep of step.depends_on) {
        if (!ids.has(dep)) {
          throw new Error(`missing_dependency: step=${step.id} dep=${dep}`)
        }
        if (dep === step.id) {
          throw new Error(`self_dependency: ${step.id}`)
        }
      }
    }
    // 检查循环依赖（尝试拓扑排序）
    this.try_topological_sort(steps)
  }

  private try_topological_sort(steps: CompositeStep[]): void {
    const in_degree: Map<string, number> = new Map()
    const dependents: Map<string, string[]> = new Map()
    for (const step of steps) {
      in_degree.set(step.id, step.depends_on.length)
      dependents.set(step.id, [])
    }
    for (const step of steps) {
      for (const dep of step.depends_on) {
        const deps: string[] = dependents.get(dep) ?? []
        deps.push(step.id)
        dependents.set(dep, deps)
      }
    }
    const queue: string[] = []
    for (const [id, deg] of in_degree) {
      if (deg === 0) {
        queue.push(id)
      }
    }
    let count: number = 0
    while (queue.length > 0) {
      const id: string = queue.shift()!
      count += 1
      for (const dep_id of dependents.get(id) ?? []) {
        const deg: number = (in_degree.get(dep_id) ?? 0) - 1
        in_degree.set(dep_id, deg)
        if (deg === 0) {
          queue.push(dep_id)
        }
      }
    }
    if (count !== steps.length) {
      throw new Error("circular_dependency_detected")
    }
  }

  /**
   * 持久化学习型技能到存储。
   * 内置技能不持久化（由代码注册）。
   */
  async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    const data: SkillPersistData[] = []
    for (const skill of this.skills.values()) {
      if (!skill.get_metadata().builtin) {
        data.push({ definition: skill.get_definition() })
      }
    }
    await this.storage.save(this.storage_key, data).catch((e: unknown) => {
      log_warn(`skill_registry_persist_failed: ${e}`)
    })
  }

  /**
   * 从存储加载学习型技能。
   *
   * @returns 加载的技能数量
   */
  async load_from_storage(): Promise<number> {
    if (!this.storage) {
      return 0
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("skill_registry_load_lock_failed")
      return 0
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (!Array.isArray(data)) {
        return 0
      }
      const items = data as SkillPersistData[]
      let loaded: number = 0
      for (const item of items) {
        const def: SkillDefinition = item.definition
        if (def.handler_type !== "composite") {
          continue
        }
        if (this.skills.has(def.metadata.id)) {
          continue
        }
        const invoker = async (skill_id: string, input: Record<string, unknown>): Promise<SkillResult> => {
          return this.invoke(skill_id, input)
        }
        const skill: CompositeSkill = new CompositeSkill(def, invoker)
        this.skills.set(def.metadata.id, skill)
        loaded += 1
      }
      log_info(`skill_registry_loaded: ${loaded} skills`)
      return loaded
    } finally {
      this.lock.release()
    }
  }
}
