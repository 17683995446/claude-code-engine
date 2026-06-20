import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"
import type {
  Plan,
  PlanPhase,
  PlanStatus,
  PlanSummary,
  PlanPersistData,
  PhaseExecutor,
  PhaseValidator,
} from "../../core_infra/core/i_plan.ts"
import type { TaskStatus } from "../../core_infra/core/i_task.ts"

/**
 * Planner - 长任务规划器（V9）。
 *
 * 将高层目标分解为多阶段计划，按阶段自驱动执行，
 * 支持断点续传、进度追踪、失败重试。
 *
 * 功能：
 *   - create_plan：创建计划（含阶段列表）
 *   - run_plan：自驱动执行计划（按阶段顺序执行，支持重试）
 *   - pause_plan / resume_plan：暂停和恢复
 *   - cancel_plan：取消计划
 *   - get_plan / list_plans：查询计划
 *   - persist / load：持久化计划到 IStorage（断点续传）
 *
 * 自驱动机制：
 *   - run_plan 从 current_phase_index 开始执行
 *   - 每个阶段调用 PhaseExecutor 执行
 *   - 执行后调用 PhaseValidator 验证
 *   - 验证失败则重试（最多 max_retries 次）
 *   - 所有重试失败则标记计划为 failed
 *   - 所有阶段完成则标记计划为 completed
 *
 * 断点续传：
 *   - 计划状态持久化到 IStorage
 *   - 中断后调用 load_from_storage 恢复
 *   - resume_plan 从 current_phase_index 继续
 */
export class Planner {
  private plans: Map<string, Plan> = new Map()
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly storage: IStorage | null
  private readonly storage_key: string = "planner"
  private id_counter: number = 0
  private readonly executor: PhaseExecutor | null
  private readonly validator: PhaseValidator | null

  constructor(
    options: {
      storage?: IStorage
      executor?: PhaseExecutor
      validator?: PhaseValidator
    } = {},
  ) {
    this.storage = options.storage ?? null
    this.executor = options.executor ?? null
    this.validator = options.validator ?? null
    log_info(`planner_created: storage=${this.storage !== null} executor=${this.executor !== null}`)
  }

  /**
   * 创建计划。
   *
   * @param goal 高层目标
   * @param name 计划名称
   * @param phases 阶段列表
   * @param metadata 元数据
   * @returns 计划 ID
   */
  async create_plan(
    goal: string,
    name: string,
    phases: Omit<PlanPhase, "status" | "retry_count" | "started_at" | "completed_at" | "output" | "error">[],
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    if (phases.length === 0) {
      throw new Error("plan_requires_at_least_one_phase")
    }
    // 验证阶段 ID 唯一
    const ids: Set<string> = new Set()
    for (const phase of phases) {
      if (ids.has(phase.id)) {
        throw new Error(`duplicate_phase_id: ${phase.id}`)
      }
      ids.add(phase.id)
    }

    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("planner_create_lock_failed")
    }
    try {
      this.id_counter += 1
      const id: string = String(this.id_counter)
      const full_phases: PlanPhase[] = phases.map((p) => ({
        ...p,
        status: "pending" as TaskStatus,
        retry_count: 0,
        started_at: null,
        completed_at: null,
        output: null,
        error: null,
      }))
      const plan: Plan = {
        id,
        goal,
        name,
        phases: full_phases,
        status: "pending",
        created_at: Date.now(),
        started_at: null,
        completed_at: null,
        current_phase_index: 0,
        metadata,
      }
      this.plans.set(id, plan)
      log_info(`plan_created: id=${id} name=${name} phases=${phases.length} goal=${goal}`)
      await this.persist()
      return id
    } finally {
      this.lock.release()
    }
  }

  /**
   * 自驱动执行计划。
   *
   * 从 current_phase_index 开始执行，每个阶段：
   *   1. 调用 executor 执行
   *   2. 调用 validator 验证
   *   3. 验证失败则重试（最多 max_retries 次）
   *   4. 所有重试失败则标记计划为 failed
   *
   * @param id 计划 ID
   * @returns 计划最终状态
   */
  async run_plan(id: string): Promise<PlanStatus> {
    const plan: Plan | undefined = this.plans.get(id)
    if (!plan) {
      log_warn(`plan_not_found: ${id}`)
      throw new Error(`plan_not_found: ${id}`)
    }
    if (plan.status === "running") {
      log_warn(`plan_already_running: ${id}`)
      return plan.status
    }
    if (plan.status === "completed" || plan.status === "cancelled") {
      log_warn(`plan_already_finished: ${id} status=${plan.status}`)
      return plan.status
    }

    if (!this.executor) {
      throw new Error("no_phase_executor_configured")
    }

    plan.status = "running"
    plan.started_at = plan.started_at ?? Date.now()
    log_info(`plan_start: id=${id} from_phase=${plan.current_phase_index}`)

    let failed: boolean = false
    for (let i = plan.current_phase_index; i < plan.phases.length; i++) {
      const phase: PlanPhase = plan.phases[i]
      plan.current_phase_index = i

      // 检查是否已暂停
      if (plan.status === "paused") {
        log_info(`plan_paused_at_phase: id=${id} phase=${phase.id}`)
        await this.persist()
        return plan.status
      }

      log_info(`plan_phase_start: plan=${id} phase=${phase.id} name=${phase.name}`)
      phase.status = "running"
      phase.started_at = Date.now()
      phase.error = null

      let phase_success: boolean = false
      let phase_output: unknown = null
      let last_error: string | null = null

      // 重试循环
      for (let attempt = 0; attempt <= phase.max_retries; attempt++) {
        phase.retry_count = attempt
        try {
          phase_output = await this.executor(phase)
          // 验证
          if (this.validator) {
            const validation_error: string | null = await this.validator(phase, phase_output)
            if (validation_error) {
              throw new Error(`validation_failed: ${validation_error}`)
            }
          }
          phase_success = true
          break
        } catch (e) {
          last_error = String((e as Error).message)
          log_warn(`plan_phase_retry: plan=${id} phase=${phase.id} attempt=${attempt} error=${last_error}`)
          if (attempt < phase.max_retries) {
            await new Promise((r) => setTimeout(r, 100 * (attempt + 1)))
          }
        }
      }

      phase.completed_at = Date.now()
      if (phase_success) {
        phase.status = "completed"
        phase.output = phase_output
        log_info(`plan_phase_done: plan=${id} phase=${phase.id}`)
      } else {
        phase.status = "failed"
        phase.error = last_error
        log_error(`plan_phase_failed: plan=${id} phase=${phase.id} error=${last_error}`)
        failed = true
        break
      }
    }

    if (!failed && plan.current_phase_index >= plan.phases.length - 1) {
      // 检查最后一个阶段是否完成
      const last_phase: PlanPhase = plan.phases[plan.phases.length - 1]
      if (last_phase.status === "completed") {
        plan.status = "completed"
        plan.current_phase_index = plan.phases.length
      }
    }
    if (failed) {
      plan.status = "failed"
    }
    plan.completed_at = plan.status === "completed" ? Date.now() : null
    log_info(`plan_done: id=${id} status=${plan.status}`)
    await this.persist()
    return plan.status
  }

  /**
   * 暂停计划。
   * 正在执行的阶段会完成后再暂停。
   */
  async pause_plan(id: string): Promise<boolean> {
    const plan: Plan | undefined = this.plans.get(id)
    if (!plan) {
      return false
    }
    if (plan.status !== "running") {
      return false
    }
    plan.status = "paused"
    log_info(`plan_pause: id=${id}`)
    await this.persist()
    return true
  }

  /**
   * 恢复计划。
   * 从 current_phase_index 继续执行。
   */
  async resume_plan(id: string): Promise<PlanStatus> {
    const plan: Plan | undefined = this.plans.get(id)
    if (!plan) {
      throw new Error(`plan_not_found: ${id}`)
    }
    if (plan.status !== "paused" && plan.status !== "failed") {
      return plan.status
    }
    // 如果是 failed，从失败阶段重试
    if (plan.status === "failed") {
      const failed_phase: PlanPhase | undefined = plan.phases.find((p) => p.status === "failed")
      if (failed_phase) {
        const idx: number = plan.phases.indexOf(failed_phase)
        plan.current_phase_index = idx
        failed_phase.status = "pending"
        failed_phase.error = null
        failed_phase.retry_count = 0
      }
    }
    plan.status = "pending"
    log_info(`plan_resume: id=${id} from_phase=${plan.current_phase_index}`)
    return this.run_plan(id)
  }

  /**
   * 取消计划。
   */
  async cancel_plan(id: string): Promise<boolean> {
    const plan: Plan | undefined = this.plans.get(id)
    if (!plan) {
      return false
    }
    if (plan.status === "completed" || plan.status === "cancelled") {
      return false
    }
    plan.status = "cancelled"
    plan.completed_at = Date.now()
    log_info(`plan_cancelled: id=${id}`)
    await this.persist()
    return true
  }

  /**
   * 删除计划。
   */
  async delete_plan(id: string): Promise<boolean> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return false
    }
    try {
      const deleted: boolean = this.plans.delete(id)
      if (deleted) {
        log_info(`plan_deleted: id=${id}`)
        await this.persist()
      }
      return deleted
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取计划。
   */
  async get_plan(id: string): Promise<Plan | null> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return null
    }
    try {
      return this.plans.get(id) ?? null
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取计划摘要。
   */
  async get_plan_summary(id: string): Promise<PlanSummary | null> {
    const plan: Plan | null = await this.get_plan(id)
    if (!plan) {
      return null
    }
    return this.to_summary(plan)
  }

  /**
   * 列出所有计划摘要。
   */
  async list_plans(): Promise<PlanSummary[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      const summaries: PlanSummary[] = []
      for (const plan of this.plans.values()) {
        summaries.push(this.to_summary(plan))
      }
      summaries.sort((a, b) => b.created_at - a.created_at)
      return summaries
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取计划数量。
   */
  async count(): Promise<number> {
    return this.plans.size
  }

  /**
   * 生成下一个计划 ID。
   */
  next_id(): string {
    this.id_counter += 1
    return String(this.id_counter)
  }

  // ===== 内部方法 =====

  private to_summary(plan: Plan): PlanSummary {
    let completed_phases: number = 0
    for (const phase of plan.phases) {
      if (phase.status === "completed") {
        completed_phases += 1
      }
    }
    const current_phase: PlanPhase | null =
      plan.current_phase_index < plan.phases.length ? plan.phases[plan.current_phase_index] : null
    return {
      id: plan.id,
      name: plan.name,
      goal: plan.goal,
      status: plan.status,
      phase_count: plan.phases.length,
      completed_phases,
      current_phase: current_phase ? current_phase.name : null,
      created_at: plan.created_at,
      started_at: plan.started_at,
      completed_at: plan.completed_at,
    }
  }

  /**
   * 持久化计划到存储。
   */
  async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    const data: PlanPersistData[] = []
    for (const plan of this.plans.values()) {
      data.push({
        id: plan.id,
        goal: plan.goal,
        name: plan.name,
        phases: plan.phases,
        status: plan.status,
        created_at: plan.created_at,
        started_at: plan.started_at,
        completed_at: plan.completed_at,
        current_phase_index: plan.current_phase_index,
        metadata: plan.metadata,
      })
    }
    await this.storage.save(this.storage_key, data).catch((e: unknown) => {
      log_warn(`planner_persist_failed: ${e}`)
    })
  }

  /**
   * 从存储加载计划（断点续传）。
   */
  async load_from_storage(): Promise<number> {
    if (!this.storage) {
      return 0
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("planner_load_lock_failed")
      return 0
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (!Array.isArray(data)) {
        return 0
      }
      const items = data as PlanPersistData[]
      let loaded: number = 0
      let max_id: number = 0
      for (const item of items) {
        const id_num: number = Number(item.id)
        if (Number.isFinite(id_num) && id_num > max_id) {
          max_id = id_num
        }
        const plan: Plan = {
          id: item.id,
          goal: item.goal,
          name: item.name,
          phases: item.phases,
          status: item.status === "running" ? "paused" : item.status,
          created_at: item.created_at,
          started_at: item.started_at,
          completed_at: item.completed_at,
          current_phase_index: item.current_phase_index,
          metadata: item.metadata,
        }
        this.plans.set(item.id, plan)
        loaded += 1
      }
      this.id_counter = max_id
      log_info(`planner_loaded: ${loaded} plans`)
      return loaded
    } finally {
      this.lock.release()
    }
  }
}
