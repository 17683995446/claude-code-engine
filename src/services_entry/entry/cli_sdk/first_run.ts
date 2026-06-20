import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { log_info, log_warn } from "../../../core_infra/infra/global_logger.ts"
import { CLI_VERSION } from "./cli_args.ts"

/**
 * V22: 首次运行状态文件路径。
 */
export const FIRST_RUN_FILE: string = join(homedir(), ".claude_code", "first_run.json")

/**
 * V22: 首次运行状态。
 */
export interface FirstRunState {
  /** 是否已完成首次运行引导 */
  completed: boolean
  /** 首次运行时间戳 */
  first_run_at: string | null
  /** 引导完成时间戳 */
  completed_at: string | null
  /** CLI 版本 */
  version: string
  /** 引导步骤完成情况 */
  steps: {
    welcome: boolean
    config_check: boolean
    api_key_check: boolean
    quick_start: boolean
  }
}

/**
 * V22: 获取默认首次运行状态。
 */
export function get_default_first_run_state(): FirstRunState {
  return {
    completed: false,
    first_run_at: null,
    completed_at: null,
    version: CLI_VERSION,
    steps: {
      welcome: false,
      config_check: false,
      api_key_check: false,
      quick_start: false,
    },
  }
}

/**
 * V22: 加载首次运行状态。
 *
 * 如果状态文件不存在，返回默认状态（未完成引导）。
 */
export function load_first_run_state(): FirstRunState {
  try {
    if (!existsSync(FIRST_RUN_FILE)) {
      return get_default_first_run_state()
    }
    const content = readFileSync(FIRST_RUN_FILE, "utf-8")
    const state = JSON.parse(content) as FirstRunState
    // 合并默认值，确保新字段有默认值
    const defaults = get_default_first_run_state()
    return {
      ...defaults,
      ...state,
      steps: { ...defaults.steps, ...state.steps },
    }
  } catch (e) {
    log_warn(`first_run_load_failed: ${e}`)
    return get_default_first_run_state()
  }
}

/**
 * V22: 保存首次运行状态。
 */
export function save_first_run_state(state: FirstRunState): void {
  try {
    const dir = dirname(FIRST_RUN_FILE)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(FIRST_RUN_FILE, JSON.stringify(state, null, 2), "utf-8")
  } catch (e) {
    log_warn(`first_run_save_failed: ${e}`)
  }
}

/**
 * V22: 检查是否为首次运行。
 */
export function is_first_run(): boolean {
  const state = load_first_run_state()
  return !state.completed
}

/**
 * V22: 标记首次运行时间。
 *
 * 如果尚未记录首次运行时间，则记录当前时间。
 */
export function mark_first_run(): void {
  const state = load_first_run_state()
  if (state.first_run_at === null) {
    state.first_run_at = new Date().toISOString()
    save_first_run_state(state)
    log_info(`first_run_marked: ${state.first_run_at}`)
  }
}

/**
 * V22: 标记引导步骤完成。
 */
export function mark_step_complete(step: keyof FirstRunState["steps"]): void {
  const state = load_first_run_state()
  state.steps[step] = true
  // 检查是否所有步骤都完成
  if (Object.values(state.steps).every((v) => v === true)) {
    state.completed = true
    state.completed_at = new Date().toISOString()
  }
  save_first_run_state(state)
  log_info(`first_run_step_complete: ${step}`)
}

/**
 * V22: 重置首次运行状态（用于测试或重新引导）。
 */
export function reset_first_run_state(): void {
  save_first_run_state(get_default_first_run_state())
  log_info("first_run_reset")
}

/**
 * V22: 引导步骤定义。
 */
export interface GuideStep {
  id: keyof FirstRunState["steps"]
  title: string
  description: string
  action_hint: string
}

/**
 * V22: 所有引导步骤。
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "welcome",
    title: "Welcome to Claude Code Engine",
    description: "A multi-agent collaboration, skill self-enhancement, and long-task planning system.",
    action_hint: "Press Enter to continue",
  },
  {
    id: "config_check",
    title: "Configuration Check",
    description: "Check your environment configuration and create a config file if needed.",
    action_hint: "Run 'config init' to create a configuration file, or press Enter to skip",
  },
  {
    id: "api_key_check",
    title: "API Key Setup",
    description: "Set your OpenAI API key for LLM functionality.",
    action_hint: "Set OPENAI_API_KEY environment variable, or press Enter to skip",
  },
  {
    id: "quick_start",
    title: "Quick Start",
    description: "Try a simple command to verify everything works.",
    action_hint: "Run 'status' to check engine health, or press Enter to finish",
  },
]

/**
 * V22: 获取下一个未完成的引导步骤。
 */
export function get_next_guide_step(): GuideStep | null {
  const state = load_first_run_state()
  if (state.completed) return null
  for (const step of GUIDE_STEPS) {
    if (!state.steps[step.id]) {
      return step
    }
  }
  return null
}

/**
 * V22: 获取引导进度。
 */
export function get_guide_progress(): {
  total: number
  completed: number
  percentage: number
  next_step: GuideStep | null
} {
  const state = load_first_run_state()
  const total = GUIDE_STEPS.length
  const completed = Object.values(state.steps).filter((v) => v === true).length
  const percentage = Math.round((completed / total) * 100)
  return {
    total,
    completed,
    percentage,
    next_step: get_next_guide_step(),
  }
}

/**
 * V22: 生成欢迎横幅。
 */
export function generate_welcome_banner(): string {
  const lines: string[] = [
    "========================================",
    "                                      ",
    "   Claude Code Engine v" + CLI_VERSION,
    "                                      ",
    "   Multi-Agent Collaboration          ",
    "   Skill Self-Enhancement             ",
    "   Long-Task Planning                 ",
    "   Perpetual Daemon                   ",
    "                                      ",
    "========================================",
  ]
  return lines.join("\n")
}

/**
 * V22: 生成首次运行引导提示。
 */
export function generate_first_run_prompt(): string {
  const progress = get_guide_progress()
  const lines: string[] = [
    "",
    "========================================",
    "  First Run Setup",
    "========================================",
    `  Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`,
    "",
  ]

  if (progress.next_step) {
    lines.push(`  Next: ${progress.next_step.title}`)
    lines.push(`  ${progress.next_step.description}`)
    lines.push(`  ${progress.next_step.action_hint}`)
  } else {
    lines.push("  Setup complete!")
    lines.push("  Run 'bun run src/cli.ts help' to see all commands.")
  }

  lines.push("========================================")
  return lines.join("\n")
}

/**
 * V22: 生成快速入门提示（用于非首次运行）。
 */
export function generate_quick_tips(): string {
  const tips: string[] = [
    "Quick tips:",
    "  - Run 'doctor' to check system health",
    "  - Run 'config list' to see configuration options",
    "  - Run 'init list' to see project templates",
    "  - Run 'chat' to start interactive conversation",
    "  - Run 'serve' to start HTTP API server",
    "  - Visit /api/docs for API documentation",
  ]
  return tips.join("\n")
}

/**
 * V22: 检查是否需要显示引导（首次运行或版本更新）。
 */
export function should_show_guide(): boolean {
  const state = load_first_run_state()
  // 首次运行
  if (!state.completed) return true
  // 版本更新（状态文件中的版本与当前版本不同）
  if (state.version !== CLI_VERSION) return true
  return false
}

/**
 * V22: 执行首次运行检查并返回适当的提示。
 */
export function check_and_get_prompt(): {
  is_first_run: boolean
  show_guide: boolean
  banner: string
  prompt: string
} {
  const first = is_first_run()
  const show_guide = should_show_guide()

  if (first) {
    mark_first_run()
  }

  const banner = generate_welcome_banner()
  const prompt = show_guide ? generate_first_run_prompt() : generate_quick_tips()

  return {
    is_first_run: first,
    show_guide,
    banner,
    prompt,
  }
}
