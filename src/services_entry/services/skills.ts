import { log_info, log_warn } from "../../core_infra/infra/global_logger.ts"
import type {
  ISkill,
  SkillDefinition,
  SkillMetadata,
  SkillResult,
  SkillParameter,
  CompositeStep,
} from "../../core_infra/core/i_skill.ts"
import type { IAsyncShellService } from "../../core_infra/core/i_async_services.ts"
import type { IAsyncLlmAdapter } from "../../core_infra/core/i_llm_adapter.ts"
import type { LlmMessage } from "../../core_infra/core/i_llm_adapter.ts"

/**
 * 技能系统实现（V8）。
 *
 * 内置技能：
 *   - ShellExecuteSkill: 执行 shell 命令
 *   - ChatCompleteSkill: LLM 对话补全
 *   - EchoSkill: 回显（用于测试和调试）
 *
 * 学习型技能：
 *   - CompositeSkill: 由多个技能调用步骤组成，支持变量引用和 DAG 依赖
 */

/**
 * 技能基类，提供通用验证和元数据管理。
 */
export abstract class SkillBase implements ISkill {
  protected readonly definition: SkillDefinition

  constructor(definition: SkillDefinition) {
    this.definition = definition
  }

  get_definition(): SkillDefinition {
    return this.definition
  }

  get_metadata(): SkillMetadata {
    return this.definition.metadata
  }

  get_id(): string {
    return this.definition.metadata.id
  }

  /**
   * 验证输入参数：检查必填项和类型。
   * 返回 null 表示验证通过，否则返回错误消息。
   */
  validate_input(input: Record<string, unknown>): string | null {
    for (const param of this.definition.input_schema) {
      if (param.required && !(param.name in input)) {
        return `missing_required_parameter: ${param.name}`
      }
      if (param.name in input) {
        const value: unknown = input[param.name]
        const type_error: string | null = check_type(value, param.type, param.name)
        if (type_error) {
          return type_error
        }
      }
    }
    return null
  }

  abstract execute(input: Record<string, unknown>): Promise<SkillResult>
}

/**
 * 类型检查辅助函数。
 */
function check_type(value: unknown, expected: string, name: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  switch (expected) {
    case "string":
      if (typeof value !== "string") {
        return `type_mismatch: ${name} expected string`
      }
      break
    case "number":
      if (typeof value !== "number") {
        return `type_mismatch: ${name} expected number`
      }
      break
    case "boolean":
      if (typeof value !== "boolean") {
        return `type_mismatch: ${name} expected boolean`
      }
      break
    case "object":
      if (typeof value !== "object" || Array.isArray(value)) {
        return `type_mismatch: ${name} expected object`
      }
      break
    case "array":
      if (!Array.isArray(value)) {
        return `type_mismatch: ${name} expected array`
      }
      break
  }
  return null
}

// ============================================================
// 内置技能
// ============================================================

/**
 * Shell 执行技能。
 *
 * 输入：{ command: string, timeout_ms?: number }
 * 输出：{ exit_code: number, stdout: string, stderr: string }
 */
export class ShellExecuteSkill extends SkillBase {
  private readonly shell: IAsyncShellService

  constructor(shell: IAsyncShellService) {
    const definition: SkillDefinition = {
      metadata: {
        id: "shell.execute",
        name: "ShellExecute",
        version: "1.0.0",
        description: "Execute a shell command and return stdout, stderr, exit_code",
        category: "shell",
        builtin: true,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "command", type: "string", required: true, description: "The command to execute" },
        { name: "timeout_ms", type: "number", required: false, description: "Timeout in milliseconds" },
      ],
      output_schema: [
        { name: "exit_code", type: "number", required: true, description: "Process exit code" },
        { name: "stdout", type: "string", required: true, description: "Standard output" },
        { name: "stderr", type: "string", required: true, description: "Standard error" },
      ],
      handler_type: "builtin",
    }
    super(definition)
    this.shell = shell
  }

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    const error: string | null = this.validate_input(input)
    if (error) {
      return { success: false, output: null, error, duration_ms: 0 }
    }
    const started_at: number = Date.now()
    try {
      const command: string = String(input.command)
      const timeout_ms: number = Number(input.timeout_ms ?? 5000)
      const result = await this.shell.run({ command, timeout_ms })
      return {
        success: true,
        output: result,
        error: null,
        duration_ms: Date.now() - started_at,
      }
    } catch (e) {
      return {
        success: false,
        output: null,
        error: String((e as Error).message),
        duration_ms: Date.now() - started_at,
      }
    }
  }
}

/**
 * Chat 补全技能。
 *
 * 输入：{ message: string, system_prompt?: string }
 * 输出：{ content: string, usage: LlmUsage }
 */
export class ChatCompleteSkill extends SkillBase {
  private readonly llm: IAsyncLlmAdapter

  constructor(llm: IAsyncLlmAdapter) {
    const definition: SkillDefinition = {
      metadata: {
        id: "chat.complete",
        name: "ChatComplete",
        version: "1.0.0",
        description: "Get LLM completion for a message",
        category: "chat",
        builtin: true,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "message", type: "string", required: true, description: "The user message" },
        { name: "system_prompt", type: "string", required: false, description: "System prompt override" },
      ],
      output_schema: [
        { name: "content", type: "string", required: true, description: "LLM response content" },
      ],
      handler_type: "builtin",
    }
    super(definition)
    this.llm = llm
  }

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    const error: string | null = this.validate_input(input)
    if (error) {
      return { success: false, output: null, error, duration_ms: 0 }
    }
    const started_at: number = Date.now()
    try {
      const message: string = String(input.message)
      const system_prompt: string | undefined =
        typeof input.system_prompt === "string" ? input.system_prompt : undefined
      const messages: LlmMessage[] = []
      if (system_prompt) {
        messages.push({ role: "system", content: system_prompt })
      }
      messages.push({ role: "user", content: message })
      const response = await this.llm.chat({
        messages,
        model: "default",
        temperature: 0.7,
        max_tokens: 1000,
      })
      return {
        success: true,
        output: { content: response.content, usage: response.usage },
        error: null,
        duration_ms: Date.now() - started_at,
      }
    } catch (e) {
      return {
        success: false,
        output: null,
        error: String((e as Error).message),
        duration_ms: Date.now() - started_at,
      }
    }
  }
}

/**
 * Echo 技能（用于测试和调试）。
 *
 * 输入：{ message: string }
 * 输出：{ echoed: string }
 */
export class EchoSkill extends SkillBase {
  constructor() {
    const definition: SkillDefinition = {
      metadata: {
        id: "echo",
        name: "Echo",
        version: "1.0.0",
        description: "Echo back the input message (for testing)",
        category: "utility",
        builtin: true,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "message", type: "string", required: true, description: "Message to echo" },
      ],
      output_schema: [
        { name: "echoed", type: "string", required: true, description: "Echoed message" },
      ],
      handler_type: "builtin",
    }
    super(definition)
  }

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    const error: string | null = this.validate_input(input)
    if (error) {
      return { success: false, output: null, error, duration_ms: 0 }
    }
    const message: string = String(input.message)
    return {
      success: true,
      output: { echoed: message },
      error: null,
      duration_ms: 0,
    }
  }
}

// ============================================================
// 组合技能（学习型）
// ============================================================

/**
 * 组合技能执行器类型：接收技能 ID 和输入，返回结果。
 */
export type SkillInvoker = (skill_id: string, input: Record<string, unknown>) => Promise<SkillResult>

/**
 * 组合技能（学习型）。
 *
 * 由多个步骤组成，每个步骤调用一个已注册技能。
 * 支持变量引用 ${step_id.output} 和 DAG 依赖。
 */
export class CompositeSkill extends SkillBase {
  private readonly invoker: SkillInvoker

  constructor(definition: SkillDefinition, invoker: SkillInvoker) {
    super(definition)
    this.invoker = invoker
  }

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    const error: string | null = this.validate_input(input)
    if (error) {
      return { success: false, output: null, error, duration_ms: 0 }
    }
    const started_at: number = Date.now()
    const steps: CompositeStep[] = this.definition.steps ?? []
    if (steps.length === 0) {
      return {
        success: false,
        output: null,
        error: "composite_skill_has_no_steps",
        duration_ms: Date.now() - started_at,
      }
    }

    // 按拓扑序执行步骤
    const ordered: CompositeStep[] = topological_sort(steps)
    const results: Map<string, SkillResult> = new Map()

    for (const step of ordered) {
      // 检查依赖
      const deps_ok: boolean = step.depends_on.every((dep_id: string) => {
        const dep: SkillResult | undefined = results.get(dep_id)
        return dep && dep.success
      })
      if (!deps_ok) {
        const failed_dep: string | undefined = step.depends_on.find((dep_id: string) => {
          const dep: SkillResult | undefined = results.get(dep_id)
          return !dep || !dep.success
        })
        results.set(step.id, {
          success: false,
          output: null,
          error: `dependency_failed: ${failed_dep}`,
          duration_ms: 0,
        })
        log_warn(`composite_step_cancelled: skill=${this.get_id()} step=${step.id} dep=${failed_dep}`)
        continue
      }

      // 解析输入（合并技能输入和步骤输入，解析变量引用）
      const resolved_input: Record<string, unknown> = resolve_input(step.input, results, input)
      log_info(`composite_step_start: skill=${this.get_id()} step=${step.id} invokes=${step.skill_id}`)
      const result: SkillResult = await this.invoker(step.skill_id, resolved_input)
      results.set(step.id, result)
      if (!result.success) {
        log_warn(`composite_step_failed: skill=${this.get_id()} step=${step.id} error=${result.error}`)
      }
    }

    // 检查所有步骤是否成功
    const all_success: boolean = Array.from(results.values()).every((r: SkillResult) => r.success)
    if (!all_success) {
      return {
        success: false,
        output: null,
        error: "composite_skill_step_failed",
        duration_ms: Date.now() - started_at,
      }
    }

    // 应用输出映射（值格式为 "${step_id.output.field}"，使用 resolve_string 解析）
    const output: Record<string, unknown> = {}
    const mapping: Record<string, string> = this.definition.output_mapping ?? {}
    for (const [key, ref] of Object.entries(mapping)) {
      output[key] = resolve_string(ref, results, input)
    }

    return {
      success: true,
      output,
      error: null,
      duration_ms: Date.now() - started_at,
    }
  }
}

// ============================================================
// 组合技能辅助函数（拓扑排序 + 变量解析）
// ============================================================

/**
 * 拓扑排序（Kahn 算法）。
 */
function topological_sort(steps: CompositeStep[]): CompositeStep[] {
  const step_map: Map<string, CompositeStep> = new Map()
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

  const ordered: CompositeStep[] = []
  while (queue.length > 0) {
    const id: string = queue.shift()!
    const step: CompositeStep | undefined = step_map.get(id)
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
 * 解析步骤输入中的变量引用。
 *
 * 支持：
 *   - ${step_id.output}：引用前序步骤输出
 *   - ${step_id.output.field}：引用前序步骤输出的字段
 *   - ${input.param}：引用技能输入参数
 */
function resolve_input(
  input: Record<string, unknown>,
  results: Map<string, SkillResult>,
  skill_input: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    resolved[key] = resolve_value(value, results, skill_input)
  }
  return resolved
}

function resolve_value(
  value: unknown,
  results: Map<string, SkillResult>,
  skill_input: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    return resolve_string(value, results, skill_input)
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolve_value(v, results, skill_input))
  }
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolve_value(v, results, skill_input)
    }
    return resolved
  }
  return value
}

function resolve_string(
  value: string,
  results: Map<string, SkillResult>,
  skill_input: Record<string, unknown>,
): unknown {
  const full_match: RegExpMatchArray | null = value.match(/^\$\{([^}]+)\}$/)
  if (full_match) {
    return resolve_reference(full_match[1], results, skill_input)
  }
  return value.replace(/\$\{([^}]+)\}/g, (_, ref: string) => {
    return String(resolve_reference(ref, results, skill_input))
  })
}

function resolve_reference(
  ref: string,
  results: Map<string, SkillResult>,
  skill_input: Record<string, unknown>,
): unknown {
  const parts: string[] = ref.split(".")
  const root: string = parts[0]

  let current: unknown
  if (root === "input") {
    // ${input.param} → 技能输入参数
    current = skill_input
  } else {
    // ${step_id.output...} → 前序步骤结果
    const result: SkillResult | undefined = results.get(root)
    if (!result) {
      return ""
    }
    current = result
  }

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
