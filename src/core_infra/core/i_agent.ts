/**
 * Agent 接口与类型定义（V6）。
 *
 * Agent 是自主实体的抽象：能够感知环境、思考决策、执行动作。
 * 多个 Agent 协作完成复杂任务，每个 Agent 拥有独立的能力和状态。
 *
 * 设计原则：
 *   - 接口与实现分离：IAgent 定义契约，具体 Agent 实现行为
 *   - 统一生命周期：init → start → act → stop
 *   - 能力声明：Agent 声明自己能做什么（capabilities），便于编排器分派任务
 *   - 状态可序列化：支持持久化和恢复
 */

/**
 * Agent 能力描述。
 */
export type AgentCapability = {
  /** 能力名称（如 "shell.execute"、"chat.converse"） */
  name: string
  /** 能力描述 */
  description: string
}

/**
 * Agent 状态。
 */
export type AgentStatus = "idle" | "running" | "stopped" | "error"

/**
 * Agent 执行输入。
 */
export type AgentAction = {
  /** 动作类型（对应能力名称） */
  type: string
  /** 动作参数 */
  input: Record<string, unknown>
}

/**
 * Agent 执行结果。
 */
export type AgentResult = {
  /** 是否成功 */
  success: boolean
  /** 输出数据 */
  output: unknown
  /** 错误信息（失败时） */
  error: string | null
  /** 执行耗时（ms） */
  duration_ms: number
}

/**
 * Agent 元数据（可序列化）。
 */
export type AgentInfo = {
  id: string
  name: string
  type: string
  capabilities: AgentCapability[]
  status: AgentStatus
  created_at: number
  last_active_at: number
}

/**
 * IAgent - Agent 接口（V6）。
 *
 * 所有 Agent 实现此接口。Agent 是自主实体的抽象，
 * 能够感知环境、思考决策、执行动作。
 *
 * 生命周期：
 *   1. init()：初始化资源
 *   2. start()：启动 Agent
 *   3. act(action)：执行动作（可多次调用）
 *   4. stop()：停止并释放资源
 */
export interface IAgent {
  /** 获取 Agent ID */
  get_id(): string
  /** 获取 Agent 名称 */
  get_name(): string
  /** 获取 Agent 类型 */
  get_type(): string
  /** 获取 Agent 能力列表 */
  get_capabilities(): AgentCapability[]
  /** 获取当前状态 */
  get_status(): AgentStatus
  /** 初始化 Agent */
  init(): Promise<void>
  /** 启动 Agent */
  start(): Promise<void>
  /** 执行动作 */
  act(action: AgentAction): Promise<AgentResult>
  /** 停止 Agent */
  stop(): Promise<void>
  /** 获取 Agent 元数据 */
  get_info(): AgentInfo
  /** 序列化为对象（用于持久化） */
  to_object(): Record<string, unknown>
}
