import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"
import type {
  Task,
  TaskStep,
  TaskStatus,
  StepResult,
  TaskSummary,
  TaskPersistData,
} from "../../core_infra/core/i_task.ts"
import type { AgentRegistry } from "./agent_registry.ts"
import type { AgentAction, AgentResult } from "../../core_infra/core/i_agent.ts"

/**
 * TaskOrchestrator - 任务编排器（V7）。
 *
 * 将复杂任务分解为步骤，按依赖关系（DAG）拓扑排序执行，
 * 每个步骤分派给指定 Agent，收集结果并组合为最终输出。
 *
 * 功能：
 *   - create_task：创建任务（含步骤和依赖关系）
 *   - run_task：执行任务（按拓扑序执行步骤）
 *   - get_task：获取任务状态
 *   - list_tasks：列出所有任务
 *   - cancel_task：取消任务
 *   - persist / load：持久化任务到 IStorage
 *
 * 依赖解析：
 *   - 步骤的 depends_on 声明前序依赖
 *   - 步骤 input 中可引用依赖步骤的输出：${step_id.output}
 *   - 编排器按拓扑序执行，无依赖的步骤可并行（当前版本串行执行）
 *
 * 容错：
 *   - 单个步骤失败标记为 failed，依赖该步骤的后续步骤跳过
 *   - 独立步骤（不依赖失败步骤）继续执行
 */
export class TaskOrchestrator {
  private tasks: Map<string, Task> = new Map()
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly registry: AgentRegistry
  private readonly storage: IStorage | null
  private readonly storage_key: string = "task_orchestrator"
  private id_counter: number = 0

  constructor(registry: AgentRegistry, options: { storage?: IStorage } = {}) {
    this.registry = registry
    this.storage = options.storage ?? null
    log_info(`task_orchestrator_created: storage=${this.storage !== null}`)
  }

  /**
   * 创建任务。
   *
   * @param name 任务名称
   * @param description 任务描述
   * @param steps 步骤列表
   * @returns 任务 ID
   */
  async create_task(
    name: string,
    description: string,
    steps: TaskStep[],
  ): Promise<string> {
    // 验证步骤
    this.validate_steps(steps)

    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("task_create_lock_failed")
    }
    try {
      this.id_counter += 1
      const id: string = String(this.id_counter)
      const task: Task = {
        id,
        name,
        description,
        steps,
        status: "pending",
        created_at: Date.now(),
        started_at: null,
        completed_at: null,
        results: new Map(),
      }
      this.tasks.set(id, task)
      log_info(`task_created: id=${id} name=${name} steps=${steps.length}`)
      await this.persist()
      return id
    } finally {
      this.lock.release()
    }
  }

  /**
   * 执行任务。
   *
   * 按拓扑序执行步骤，每个步骤分派给指定 Agent。
   * 步骤失败时，依赖该步骤的后续步骤跳过。
   *
   * @param id 任务 ID
   * @returns 任务最终状态
   */
  async run_task(id: string): Promise<TaskStatus> {
    const task: Task | undefined = this.tasks.get(id)
    if (!task) {
      log_warn(`task_not_found: ${id}`)
      throw new Error(`task_not_found: ${id}`)
    }
    if (task.status === "running") {
      log_warn(`task_already_running: ${id}`)
      return task.status
    }

    task.status = "running"
    task.started_at = Date.now()
    log_info(`task_start: id=${id} steps=${task.steps.length}`)

    // 拓扑排序
    const ordered: TaskStep[] = this.topological_sort(task.steps)

    let all_success: boolean = true
    for (const step of ordered) {
      // 检查依赖是否全部成功
      const deps_ok: boolean = step.depends_on.every((dep_id: string) => {
        const dep_result: StepResult | undefined = task.results.get(dep_id)
        return dep_result && dep_result.status === "completed"
      })

      if (!deps_ok) {
        // 依赖未满足（某个依赖失败），跳过此步骤
        const failed_dep: string | undefined = step.depends_on.find((dep_id: string) => {
          const dep_result: StepResult | undefined = task.results.get(dep_id)
          return !dep_result || dep_result.status !== "completed"
        })
        task.results.set(step.id, {
          step_id: step.id,
          status: "cancelled",
          output: null,
          error: `dependency_failed: ${failed_dep}`,
          started_at: Date.now(),
          completed_at: Date.now(),
        })
        log_warn(`task_step_cancelled: task=${id} step=${step.id} dep=${failed_dep}`)
        all_success = false
        continue
      }

      // 解析输入中的变量引用
      const resolved_input: Record<string, unknown> = this.resolve_input(step.input, task.results)

      // 执行步骤
      const action: AgentAction = {
        type: step.action_type,
        input: resolved_input,
      }
      const started_at: number = Date.now()
      log_info(`task_step_start: task=${id} step=${step.id} agent=${step.agent_id} action=${step.action_type}`)

      const result: AgentResult = await this.registry.invoke(step.agent_id, action)
      const completed_at: number = Date.now()

      const step_result: StepResult = {
        step_id: step.id,
        status: result.success ? "completed" : "failed",
        output: result.output,
        error: result.error,
        started_at,
        completed_at,
      }
      task.results.set(step.id, step_result)

      if (!result.success) {
        log_warn(`task_step_failed: task=${id} step=${step.id} error=${result.error}`)
        all_success = false
      } else {
        log_info(`task_step_done: task=${id} step=${step.id} duration=${completed_at - started_at}ms`)
      }
    }

    task.status = all_success ? "completed" : "failed"
    task.completed_at = Date.now()
    log_info(`task_done: id=${id} status=${task.status}`)
    await this.persist()
    return task.status
  }

  /**
   * 获取任务。
   */
  async get_task(id: string): Promise<Task | null> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return null
    }
    try {
      return this.tasks.get(id) ?? null
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取任务摘要。
   */
  async get_task_summary(id: string): Promise<TaskSummary | null> {
    const task: Task | null = await this.get_task(id)
    if (!task) {
      return null
    }
    return this.to_summary(task)
  }

  /**
   * 列出所有任务摘要。
   */
  async list_tasks(): Promise<TaskSummary[]> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return []
    }
    try {
      const summaries: TaskSummary[] = []
      for (const task of this.tasks.values()) {
        summaries.push(this.to_summary(task))
      }
      summaries.sort((a, b) => b.created_at - a.created_at)
      return summaries
    } finally {
      this.lock.release()
    }
  }

  /**
   * 取消任务。
   */
  async cancel_task(id: string): Promise<boolean> {
    const task: Task | undefined = this.tasks.get(id)
    if (!task) {
      return false
    }
    if (task.status === "completed" || task.status === "failed") {
      return false
    }
    task.status = "cancelled"
    task.completed_at = Date.now()
    log_info(`task_cancelled: id=${id}`)
    await this.persist()
    return true
  }

  /**
   * 删除任务（从内存移除）。
   */
  async delete_task(id: string): Promise<boolean> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      return false
    }
    try {
      const deleted: boolean = this.tasks.delete(id)
      if (deleted) {
        log_info(`task_deleted: id=${id}`)
        await this.persist()
      }
      return deleted
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取任务数量。
   */
  async count(): Promise<number> {
    return this.tasks.size
  }

  /**
   * 生成下一个任务 ID。
   */
  next_id(): string {
    this.id_counter += 1
    return String(this.id_counter)
  }

  // ===== 内部方法 =====

  /**
   * 验证步骤列表：ID 唯一、依赖存在、无循环依赖。
   */
  private validate_steps(steps: TaskStep[]): void {
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
    // 检查循环依赖
    this.topological_sort(steps)
  }

  /**
   * 拓扑排序（Kahn 算法）。
   */
  private topological_sort(steps: TaskStep[]): TaskStep[] {
    const step_map: Map<string, TaskStep> = new Map()
    const in_degree: Map<string, number> = new Map()
    const dependents: Map<string, string[]> = new Map()

    for (const step of steps) {
      step_map.set(step.id, step)
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

    const ordered: TaskStep[] = []
    while (queue.length > 0) {
      const id: string = queue.shift()!
      const step: TaskStep | undefined = step_map.get(id)
      if (step) {
        ordered.push(step)
      }
      for (const dep_id of dependents.get(id) ?? []) {
        const deg: number = (in_degree.get(dep_id) ?? 0) - 1
        in_degree.set(dep_id, deg)
        if (deg === 0) {
          queue.push(dep_id)
        }
      }
    }

    if (ordered.length !== steps.length) {
      throw new Error("circular_dependency_detected")
    }

    return ordered
  }

  /**
   * 解析输入中的变量引用。
   *
   * 支持 ${step_id.output} 语法，引用前序步骤的输出。
   * 支持 ${step_id.output.field} 嵌套字段访问。
   */
  private resolve_input(
    input: Record<string, unknown>,
    results: Map<string, StepResult>,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      resolved[key] = this.resolve_value(value, results)
    }
    return resolved
  }

  /**
   * 递归解析值中的变量引用。
   */
  private resolve_value(value: unknown, results: Map<string, StepResult>): unknown {
    if (typeof value === "string") {
      return this.resolve_string(value, results)
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.resolve_value(v, results))
    }
    if (value !== null && typeof value === "object") {
      const resolved: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        resolved[k] = this.resolve_value(v, results)
      }
      return resolved
    }
    return value
  }

  /**
   * 解析字符串中的 ${...} 变量引用。
   */
  private resolve_string(value: string, results: Map<string, StepResult>): unknown {
    // 完全匹配 ${step_id.output} 或 ${step_id.output.field}
    const full_match: RegExpMatchArray | null = value.match(/^\$\{([^}]+)\}$/)
    if (full_match) {
      return this.resolve_reference(full_match[1], results)
    }
    // 部分匹配：替换所有 ${...} 引用
    return value.replace(/\$\{([^}]+)\}/g, (_, ref: string) => {
      const resolved: unknown = this.resolve_reference(ref, results)
      return String(resolved)
    })
  }

  /**
   * 解析引用路径（如 "step1.output" 或 "step1.output.stdout"）。
   */
  private resolve_reference(ref: string, results: Map<string, StepResult>): unknown {
    const parts: string[] = ref.split(".")
    const step_id: string = parts[0]
    const result: StepResult | undefined = results.get(step_id)
    if (!result) {
      return ""
    }
    let current: unknown = result
    for (let i = 1; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return ""
      }
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[parts[i]]
      } else {
        return ""
      }
    }
    return current ?? ""
  }

  /**
   * 将 Task 转换为 TaskSummary。
   */
  private to_summary(task: Task): TaskSummary {
    let completed_steps: number = 0
    for (const result of task.results.values()) {
      if (result.status === "completed") {
        completed_steps += 1
      }
    }
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      status: task.status,
      step_count: task.steps.length,
      completed_steps,
      created_at: task.created_at,
      started_at: task.started_at,
      completed_at: task.completed_at,
    }
  }

  /**
   * 持久化任务到存储。
   */
  async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    const data: TaskPersistData[] = []
    for (const task of this.tasks.values()) {
      data.push({
        id: task.id,
        name: task.name,
        description: task.description,
        steps: task.steps,
        status: task.status,
        created_at: task.created_at,
        started_at: task.started_at,
        completed_at: task.completed_at,
        results: Array.from(task.results.values()),
      })
    }
    await this.storage.save(this.storage_key, data).catch((e: unknown) => {
      log_warn(`task_persist_failed: ${e}`)
    })
  }

  /**
   * 从存储加载任务。
   */
  async load_from_storage(): Promise<void> {
    if (!this.storage) {
      return
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("task_load_lock_failed")
      return
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (!Array.isArray(data)) {
        return
      }
      const tasks = data as TaskPersistData[]
      let max_id: number = 0
      for (const t of tasks) {
        const id_num: number = Number(t.id)
        if (Number.isFinite(id_num) && id_num > max_id) {
          max_id = id_num
        }
        const results: Map<string, StepResult> = new Map()
        for (const r of t.results) {
          results.set(r.step_id, r)
        }
        this.tasks.set(t.id, {
          id: t.id,
          name: t.name,
          description: t.description,
          steps: t.steps,
          status: t.status,
          created_at: t.created_at,
          started_at: t.started_at,
          completed_at: t.completed_at,
          results,
        })
      }
      this.id_counter = max_id
      log_info(`task_loaded: ${tasks.length} tasks`)
    } finally {
      this.lock.release()
    }
  }
}
