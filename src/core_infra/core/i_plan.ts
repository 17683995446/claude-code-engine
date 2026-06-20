/**
 * 长任务规划接口与类型定义（V9）。
 *
 * 长任务规划将高层目标分解为多阶段计划，按阶段执行，
 * 支持断点续传、进度追踪、失败重试。
 *
 * 设计原则：
 *   - 目标驱动：从 goal 出发，分解为可执行的阶段
 *   - 阶段化：每个阶段是一个子任务，可独立执行和验证
 *   - 断点续传：计划状态持久化，中断后可从最后完成的阶段恢复
 *   - 自驱动：Planner 自动推进阶段，无需外部干预
 *   - 可验证：每个阶段完成后验证结果，失败则重试或标记失败
 */

import type { TaskStatus } from "./i_task.ts"

/**
 * 计划状态。
 */
export type PlanStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled"

/**
 * 阶段定义。
 *
 * 一个阶段对应一个子任务，包含目标、执行步骤引用、验证条件。
 */
export type PlanPhase = {
  /** 阶段 ID（在计划内唯一） */
  id: string
  /** 阶段名称 */
  name: string
  /** 阶段目标描述 */
  goal: string
  /** 阶段状态 */
  status: TaskStatus
  /** 重试次数 */
  retry_count: number
  /** 最大重试次数 */
  max_retries: number
  /** 开始时间 */
  started_at: number | null
  /** 完成时间 */
  completed_at: number | null
  /** 阶段输出 */
  output: unknown
  /** 错误信息 */
  error: string | null
}

/**
 * 计划定义。
 */
export type Plan = {
  /** 计划 ID */
  id: string
  /** 高层目标 */
  goal: string
  /** 计划名称 */
  name: string
  /** 阶段列表 */
  phases: PlanPhase[]
  /** 计划状态 */
  status: PlanStatus
  /** 创建时间 */
  created_at: number
  /** 开始时间 */
  started_at: number | null
  /** 完成时间 */
  completed_at: number | null
  /** 当前阶段索引 */
  current_phase_index: number
  /** 元数据 */
  metadata: Record<string, unknown>
}

/**
 * 计划摘要（可序列化，用于列表展示）。
 */
export type PlanSummary = {
  id: string
  name: string
  goal: string
  status: PlanStatus
  phase_count: number
  completed_phases: number
  current_phase: string | null
  created_at: number
  started_at: number | null
  completed_at: number | null
}

/**
 * 阶段执行器类型。
 *
 * Planner 在执行阶段时调用此函数，由调用方提供具体执行逻辑。
 * 执行器接收阶段定义，返回执行结果。
 *
 * @param phase 阶段定义
 * @returns 阶段输出，失败时抛出异常
 */
export type PhaseExecutor = (phase: PlanPhase) => Promise<unknown>

/**
 * 阶段验证器类型。
 *
 * 阶段执行完成后调用此函数验证结果。
 *
 * @param phase 阶段定义
 * @param output 阶段输出
 * @returns 验证通过返回 null，否则返回错误消息
 */
export type PhaseValidator = (phase: PlanPhase, output: unknown) => Promise<string | null>

/**
 * 计划持久化数据。
 */
export type PlanPersistData = {
  id: string
  goal: string
  name: string
  phases: PlanPhase[]
  status: PlanStatus
  created_at: number
  started_at: number | null
  completed_at: number | null
  current_phase_index: number
  metadata: Record<string, unknown>
}
