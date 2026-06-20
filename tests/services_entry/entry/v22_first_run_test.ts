import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import {
  FIRST_RUN_FILE,
  get_default_first_run_state,
  load_first_run_state,
  save_first_run_state,
  is_first_run,
  mark_first_run,
  mark_step_complete,
  reset_first_run_state,
  get_next_guide_step,
  get_guide_progress,
  GUIDE_STEPS,
  generate_welcome_banner,
  generate_first_run_prompt,
  generate_quick_tips,
  should_show_guide,
  check_and_get_prompt,
} from "../../../src/services_entry/entry/cli_sdk/first_run.ts"
import type { FirstRunState } from "../../../src/services_entry/entry/cli_sdk/first_run.ts"
import { CLI_VERSION } from "../../../src/services_entry/entry/cli_sdk/cli_args.ts"

const TEST_DIR = "/tmp/v22_first_run_test"
const TEST_FIRST_RUN_FILE = `${TEST_DIR}/first_run.json`

describe("V22 first_run state management", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("get_default_first_run_state should return incomplete state", () => {
    const state = get_default_first_run_state()
    expect(state.completed).toBe(false)
    expect(state.first_run_at).toBe(null)
    expect(state.completed_at).toBe(null)
    expect(state.version).toBe(CLI_VERSION)
    expect(state.steps.welcome).toBe(false)
    expect(state.steps.config_check).toBe(false)
    expect(state.steps.api_key_check).toBe(false)
    expect(state.steps.quick_start).toBe(false)
  })

  test("save and load first run state", () => {
    // 通过修改 FIRST_RUN_FILE 路径来测试
    // 由于 FIRST_RUN_FILE 是常量，我们直接测试 save/load 循环
    const state: FirstRunState = {
      completed: false,
      first_run_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
      version: CLI_VERSION,
      steps: {
        welcome: true,
        config_check: false,
        api_key_check: false,
        quick_start: false,
      },
    }
    save_first_run_state(state)
    const loaded = load_first_run_state()
    expect(loaded.first_run_at).toBe("2026-01-01T00:00:00.000Z")
    expect(loaded.steps.welcome).toBe(true)
    expect(loaded.steps.config_check).toBe(false)
  })

  test("load should return default when file does not exist", () => {
    // 先删除可能存在的文件
    reset_first_run_state()
    const state = load_first_run_state()
    expect(state.completed).toBe(false)
    expect(state.first_run_at).toBe(null)
  })

  test("reset_first_run_state should reset to defaults", () => {
    // 先修改状态
    const state = load_first_run_state()
    state.first_run_at = "2026-01-01"
    state.steps.welcome = true
    save_first_run_state(state)

    // 重置
    reset_first_run_state()
    const reset_state = load_first_run_state()
    expect(reset_state.completed).toBe(false)
    expect(reset_state.first_run_at).toBe(null)
    expect(reset_state.steps.welcome).toBe(false)
  })
})

describe("V22 is_first_run and mark_first_run", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("is_first_run should return true initially", () => {
    reset_first_run_state()
    expect(is_first_run()).toBe(true)
  })

  test("mark_first_run should set first_run_at", () => {
    reset_first_run_state()
    mark_first_run()
    const state = load_first_run_state()
    expect(state.first_run_at).not.toBe(null)
    expect(state.first_run_at!.length).toBeGreaterThan(0)
  })

  test("mark_first_run should not overwrite existing timestamp", () => {
    reset_first_run_state()
    mark_first_run()
    const first_timestamp = load_first_run_state().first_run_at
    // 再次调用不应覆盖
    mark_first_run()
    const second_timestamp = load_first_run_state().first_run_at
    expect(second_timestamp).toBe(first_timestamp)
  })
})

describe("V22 mark_step_complete", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("should mark individual step as complete", () => {
    mark_step_complete("welcome")
    const state = load_first_run_state()
    expect(state.steps.welcome).toBe(true)
    expect(state.steps.config_check).toBe(false)
  })

  test("should mark all steps and set completed", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    mark_step_complete("api_key_check")
    mark_step_complete("quick_start")
    const state = load_first_run_state()
    expect(state.completed).toBe(true)
    expect(state.completed_at).not.toBe(null)
  })

  test("should not set completed when not all steps done", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    const state = load_first_run_state()
    expect(state.completed).toBe(false)
    expect(state.completed_at).toBe(null)
  })
})

describe("V22 GUIDE_STEPS", () => {
  test("should have 4 steps", () => {
    expect(GUIDE_STEPS.length).toBe(4)
  })

  test("each step should have required fields", () => {
    for (const step of GUIDE_STEPS) {
      expect(step.id.length).toBeGreaterThan(0)
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.description.length).toBeGreaterThan(0)
      expect(step.action_hint.length).toBeGreaterThan(0)
    }
  })

  test("should have correct step order", () => {
    expect(GUIDE_STEPS[0].id).toBe("welcome")
    expect(GUIDE_STEPS[1].id).toBe("config_check")
    expect(GUIDE_STEPS[2].id).toBe("api_key_check")
    expect(GUIDE_STEPS[3].id).toBe("quick_start")
  })
})

describe("V22 get_next_guide_step", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("should return first step when nothing completed", () => {
    const step = get_next_guide_step()
    expect(step).not.toBe(null)
    expect(step!.id).toBe("welcome")
  })

  test("should return next incomplete step", () => {
    mark_step_complete("welcome")
    const step = get_next_guide_step()
    expect(step!.id).toBe("config_check")
  })

  test("should return null when all steps complete", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    mark_step_complete("api_key_check")
    mark_step_complete("quick_start")
    const step = get_next_guide_step()
    expect(step).toBe(null)
  })
})

describe("V22 get_guide_progress", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("should return 0% when nothing completed", () => {
    const progress = get_guide_progress()
    expect(progress.total).toBe(4)
    expect(progress.completed).toBe(0)
    expect(progress.percentage).toBe(0)
    expect(progress.next_step).not.toBe(null)
  })

  test("should return 50% when 2 steps completed", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    const progress = get_guide_progress()
    expect(progress.completed).toBe(2)
    expect(progress.percentage).toBe(50)
  })

  test("should return 100% when all completed", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    mark_step_complete("api_key_check")
    mark_step_complete("quick_start")
    const progress = get_guide_progress()
    expect(progress.completed).toBe(4)
    expect(progress.percentage).toBe(100)
    expect(progress.next_step).toBe(null)
  })
})

describe("V22 should_show_guide", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("should return true when not completed", () => {
    expect(should_show_guide()).toBe(true)
  })

  test("should return false when completed", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    mark_step_complete("api_key_check")
    mark_step_complete("quick_start")
    expect(should_show_guide()).toBe(false)
  })
})

describe("V22 generate_welcome_banner", () => {
  test("should contain version", () => {
    const banner = generate_welcome_banner()
    expect(banner).toContain(CLI_VERSION)
  })

  test("should contain key features", () => {
    const banner = generate_welcome_banner()
    expect(banner).toContain("Multi-Agent Collaboration")
    expect(banner).toContain("Skill Self-Enhancement")
    expect(banner).toContain("Long-Task Planning")
    expect(banner).toContain("Perpetual Daemon")
  })
})

describe("V22 generate_first_run_prompt", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("should contain First Run Setup header", () => {
    const prompt = generate_first_run_prompt()
    expect(prompt).toContain("First Run Setup")
  })

  test("should contain progress info", () => {
    const prompt = generate_first_run_prompt()
    expect(prompt).toContain("Progress:")
    expect(prompt).toContain("0/4")
  })

  test("should show next step when not complete", () => {
    const prompt = generate_first_run_prompt()
    expect(prompt).toContain("Next:")
    expect(prompt).toContain("Welcome")
  })

  test("should show complete message when all done", () => {
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    mark_step_complete("api_key_check")
    mark_step_complete("quick_start")
    const prompt = generate_first_run_prompt()
    expect(prompt).toContain("Setup complete!")
  })
})

describe("V22 generate_quick_tips", () => {
  test("should contain useful tips", () => {
    const tips = generate_quick_tips()
    expect(tips).toContain("doctor")
    expect(tips).toContain("config list")
    expect(tips).toContain("init list")
    expect(tips).toContain("chat")
    expect(tips).toContain("serve")
    expect(tips).toContain("/api/docs")
  })
})

describe("V22 check_and_get_prompt", () => {
  beforeEach(() => {
    reset_first_run_state()
  })

  afterEach(() => {
    reset_first_run_state()
  })

  test("should return prompt info for first run", () => {
    const result = check_and_get_prompt()
    expect(result.is_first_run).toBe(true)
    expect(result.show_guide).toBe(true)
    expect(result.banner).toContain(CLI_VERSION)
    expect(result.prompt).toContain("First Run Setup")
  })

  test("should return quick tips for non-first run", () => {
    // 完成所有步骤
    mark_step_complete("welcome")
    mark_step_complete("config_check")
    mark_step_complete("api_key_check")
    mark_step_complete("quick_start")
    const result = check_and_get_prompt()
    expect(result.is_first_run).toBe(false)
    expect(result.show_guide).toBe(false)
    expect(result.prompt).toContain("Quick tips:")
  })

  test("should mark first_run_at on first call", () => {
    check_and_get_prompt()
    const state = load_first_run_state()
    expect(state.first_run_at).not.toBe(null)
  })
})
