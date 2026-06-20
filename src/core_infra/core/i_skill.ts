/**
 * 技能系统接口与类型定义（V8）。
 *
 * 技能（Skill）是命名的、可版本化的、可复用的能力单元，
 * 接受结构化输入，产生结构化输出。
 *
 * 技能是 Agent 和 Task 的构建块：
 *   - Agent 通过技能执行具体动作
 *   - Task 步骤可调用技能
 *   - 系统可通过"学习"注册新技能（自我增强）
 *
 * 设计原则：
 *   - 原子性：每个技能完成一个明确的功能
 *   - 可组合：学习型技能由多个原子技能调用组成
 *   - 可发现：技能注册中心提供列举和查询
 *   - 可演化：技能支持版本号，新版本可替换旧版本
 *   - 自我增强：运行时可注册新技能，无需重启
 */

/**
 * 技能元数据。
 */
export type SkillMetadata = {
  /** 技能 ID（全局唯一） */
  id: string
  /** 技能名称 */
  name: string
  /** 版本号 */
  version: string
  /** 描述 */
  description: string
  /** 分类（如 "shell", "chat", "file", "composite"） */
  category: string
  /** 是否为内置技能 */
  builtin: boolean
  /** 创建时间 */
  created_at: number
}

/**
 * 技能参数定义。
 */
export type SkillParameter = {
  /** 参数名 */
  name: string
  /** 参数类型 */
  type: "string" | "number" | "boolean" | "object" | "array"
  /** 是否必填 */
  required: boolean
  /** 参数描述 */
  description: string
}

/**
 * 技能定义（包含元数据、输入输出 schema、处理器类型）。
 */
export type SkillDefinition = {
  metadata: SkillMetadata
  /** 输入参数 schema */
  input_schema: SkillParameter[]
  /** 输出参数 schema */
  output_schema: SkillParameter[]
  /**
   * 处理器类型：
   *   - "builtin": 内置实现（由代码提供 execute 逻辑）
   *   - "composite": 组合技能（由 steps 组成，调用其他技能）
   */
  handler_type: "builtin" | "composite"
  /** 组合技能的步骤（仅 handler_type === "composite" 时有效） */
  steps?: CompositeStep[]
  /** 输出映射（仅 composite 时有效）：将步骤输出映射为技能输出 */
  output_mapping?: Record<string, string>
}

/**
 * 组合技能的步骤。
 *
 * 每个步骤调用一个已注册的技能，可引用前序步骤的输出。
 */
export type CompositeStep = {
  /** 步骤 ID（在技能内唯一） */
  id: string
  /** 调用的技能 ID */
  skill_id: string
  /** 输入（可引用依赖步骤输出：${step_id.output}） */
  input: Record<string, unknown>
  /** 依赖的步骤 ID */
  depends_on: string[]
}

/**
 * 技能执行结果。
 */
export type SkillResult = {
  success: boolean
  output: unknown
  error: string | null
  duration_ms: number
}

/**
 * 技能接口。
 *
 * 所有技能（内置和学习型）实现此接口。
 */
export interface ISkill {
  /** 获取技能定义 */
  get_definition(): SkillDefinition
  /** 获取技能元数据 */
  get_metadata(): SkillMetadata
  /** 获取技能 ID */
  get_id(): string
  /** 验证输入参数 */
  validate_input(input: Record<string, unknown>): string | null
  /** 执行技能 */
  execute(input: Record<string, unknown>): Promise<SkillResult>
}

/**
 * 技能持久化数据。
 */
export type SkillPersistData = {
  definition: SkillDefinition
}
