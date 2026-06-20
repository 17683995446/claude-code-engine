/**
 * 任务编排接口与类型定义（V7）。
 *
 * 任务编排是多 Agent 协作的核心：将复杂任务分解为子任务，
 * 分派给不同 Agent 执行，收集结果并组合为最终输出。
 *
 * 设计原则：
 *   - 任务有向无环图（DAG）：子任务可有依赖关系，编排器按拓扑序执行
 *   - 单一职责：每个子任务由一个 Agent 执行
 *   - 容错隔离：单个子任务失败不阻塞独立子任务
 *   - 状态可追踪：任务状态实时可查
 */

/**
 * 任务状态。
 */
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

/**
 * 子任务步骤。
 *
 * 一个步骤对应一个 Agent 动作，可依赖前序步骤的输出。
 */
export type TaskStep = {
  /** 步骤 ID（在任务内唯一） */
  id: string
  /** 执行此步骤的 Agent ID */
  agent_id: string
  /** 动作类型 */
  action_type: string
  /** 动作输入（可引用依赖步骤的输出：${step_id.output}） */
  input: Record<string, unknown>
  /** 依赖的步骤 ID 列表（必须全部完成才能执行此步骤） */
  depends_on: string[]
}

/**
 * 步骤执行结果。
 */
export type StepResult = {
  step_id: string
  status: TaskStatus
  output: unknown
  error: string | null
  started_at: number
  completed_at: number
}

/**
 * 任务定义。
 */
export type Task = {
  id: string
  /** 任务名称 */
  name: string
  /** 任务描述 */
  description: string
  /** 步骤列表 */
  steps: TaskStep[]
  /** 任务状态 */
  status: TaskStatus
  /** 创建时间 */
  created_at: number
  /** 开始时间 */
  started_at: number | null
  /** 完成时间 */
  completed_at: number | null
  /** 步骤结果 */
  results: Map<string, StepResult>
}

/**
 * 任务摘要（可序列化，用于列表展示）。
 */
export type TaskSummary = {
  id: string
  name: string
  description: string
  status: TaskStatus
  step_count: number
  completed_steps: number
  created_at: number
  started_at: number | null
  completed_at: number | null
}

/**
 * 任务持久化数据。
 */
export type TaskPersistData = {
  id: string
  name: string
  description: string
  steps: TaskStep[]
  status: TaskStatus
  created_at: number
  started_at: number | null
  completed_at: number | null
  results: StepResult[]
}
