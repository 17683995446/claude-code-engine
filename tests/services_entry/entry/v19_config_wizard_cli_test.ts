import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import {
  InteractiveConfigWizard,
  generate_config_non_interactive,
  show_config,
  list_config_fields,
} from "../../../src/services_entry/entry/cli_sdk/config_wizard_cli.ts"

const TEST_DIR = "/tmp/v19_config_cli_test"
const TEST_CONFIG_PATH = `${TEST_DIR}/config.yaml`

describe("V19 generate_config_non_interactive", () => {
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

  test("should generate config file with defaults", () => {
    const result = generate_config_non_interactive({
      output_path: TEST_CONFIG_PATH,
    })
    expect(result.success).toBe(true)
    expect(result.config).not.toBe(null)
    expect(existsSync(TEST_CONFIG_PATH)).toBe(true)
    expect(result.config!.port).toBe(3000)
    expect(result.config!.max_turns).toBe(50)
  })

  test("should apply custom options", () => {
    const result = generate_config_non_interactive({
      output_path: TEST_CONFIG_PATH,
      port: 9090,
      max_turns: 100,
      log_level: "debug",
      verbose: true,
    })
    expect(result.success).toBe(true)
    expect(result.config!.port).toBe(9090)
    expect(result.config!.max_turns).toBe(100)
    expect(result.config!.log_level).toBe("debug")
    expect(result.config!.verbose).toBe(true)
  })

  test("should fail when file exists and overwrite is false", () => {
    // 先创建文件
    generate_config_non_interactive({ output_path: TEST_CONFIG_PATH })
    // 再次生成不覆盖
    const result = generate_config_non_interactive({
      output_path: TEST_CONFIG_PATH,
      overwrite: false,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain("exists")
  })

  test("should overwrite when overwrite is true", () => {
    generate_config_non_interactive({ output_path: TEST_CONFIG_PATH, port: 1111 })
    const result = generate_config_non_interactive({
      output_path: TEST_CONFIG_PATH,
      port: 2222,
      overwrite: true,
    })
    expect(result.success).toBe(true)
    const content = readFileSync(TEST_CONFIG_PATH, "utf-8")
    expect(content).toContain("port: 2222")
  })

  test("should write valid YAML content", () => {
    generate_config_non_interactive({ output_path: TEST_CONFIG_PATH, port: 8080 })
    const content = readFileSync(TEST_CONFIG_PATH, "utf-8")
    expect(content).toContain("port: 8080")
    expect(content).toContain("log_level: info")
    expect(content).toContain("auth:")
    expect(content).toContain("daemon:")
  })
})

describe("V19 show_config", () => {
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

  test("should return content for existing file", () => {
    generate_config_non_interactive({ output_path: TEST_CONFIG_PATH })
    const result = show_config(TEST_CONFIG_PATH)
    expect(result.success).toBe(true)
    expect(result.content).toBeDefined()
    expect(result.content!).toContain("port: 3000")
  })

  test("should fail for non-existent file", () => {
    const result = show_config("/nonexistent/config.yaml")
    expect(result.success).toBe(false)
    expect(result.error).toContain("not found")
  })
})

describe("V19 list_config_fields", () => {
  test("should list all config fields", () => {
    const output = list_config_fields()
    expect(output).toContain("Configuration fields:")
    expect(output).toContain("port:")
    expect(output).toContain("cwd:")
    expect(output).toContain("max_turns:")
    expect(output).toContain("log_level:")
    expect(output).toContain("verbose:")
    expect(output).toContain("auth.public_paths:")
    expect(output).toContain("auth.rate_limit_max:")
    expect(output).toContain("daemon.health_check_interval_ms:")
    expect(output).toContain("daemon.plan_recovery_interval_ms:")
    expect(output).toContain("daemon.auto_recover_plans:")
    expect(output).toContain("daemon.max_recovery_failures:")
    expect(output).toContain("session.default_max_history:")
    expect(output).toContain("shell.timeout_ms:")
  })

  test("should include default values", () => {
    const output = list_config_fields()
    expect(output).toContain("3000")
    expect(output).toContain("50")
    expect(output).toContain("info")
  })
})

describe("V19 InteractiveConfigWizard", () => {
  test("should be constructable", () => {
    const wizard = new InteractiveConfigWizard()
    expect(wizard).toBeDefined()
    expect(typeof wizard.run).toBe("function")
  })
})
