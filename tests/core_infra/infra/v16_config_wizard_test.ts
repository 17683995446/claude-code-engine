import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { existsSync, rmSync, readFileSync, mkdirSync } from "fs"
import {
  DEFAULT_CONFIG,
  get_default_config,
  apply_config_defaults,
  config_to_yaml,
} from "../../../src/core_infra/infra/config_defaults.ts"
import type { DefaultConfig } from "../../../src/core_infra/infra/config_defaults.ts"
import {
  run_config_wizard,
  detect_environment,
  validate_config_file,
  generate_example_config,
  get_config_field_descriptions,
} from "../../../src/core_infra/infra/config_wizard.ts"
import type { WizardOptions } from "../../../src/core_infra/infra/config_wizard.ts"

const TEST_DIR = "/tmp/v16_config_test"
const TEST_CONFIG_PATH = `${TEST_DIR}/config.yaml`
const TEST_EXAMPLE_PATH = `${TEST_DIR}/config.example.yaml`

describe("V16 config_defaults", () => {
  test("DEFAULT_CONFIG should have all required fields", () => {
    expect(DEFAULT_CONFIG.port).toBe(3000)
    expect(DEFAULT_CONFIG.max_turns).toBe(50)
    expect(DEFAULT_CONFIG.log_level).toBe("info")
    expect(DEFAULT_CONFIG.verbose).toBe(false)
    expect(DEFAULT_CONFIG.auth.public_paths).toContain("/health")
    expect(DEFAULT_CONFIG.daemon.health_check_interval_ms).toBe(5000)
    expect(DEFAULT_CONFIG.session.default_max_history).toBe(50)
    expect(DEFAULT_CONFIG.shell.timeout_ms).toBe(30000)
  })

  test("get_default_config should return deep copy", () => {
    const config1 = get_default_config()
    const config2 = get_default_config()
    config1.port = 9999
    config1.auth.public_paths.push("/custom")
    // 修改 config1 不应影响 config2
    expect(config2.port).toBe(3000)
    expect(config2.auth.public_paths).not.toContain("/custom")
  })

  test("apply_config_defaults should merge user config over defaults", () => {
    const merged = apply_config_defaults({
      port: 8080,
      log_level: "debug",
      auth: { rate_limit_max: 200 },
    })
    expect(merged.port).toBe(8080)
    expect(merged.log_level).toBe("debug")
    expect(merged.auth.rate_limit_max).toBe(200)
    // 未覆盖的字段保持默认
    expect(merged.max_turns).toBe(50)
    expect(merged.auth.public_paths).toContain("/health")
  })

  test("apply_config_defaults should handle empty user config", () => {
    const merged = apply_config_defaults({})
    expect(merged.port).toBe(DEFAULT_CONFIG.port)
    expect(merged.cwd).toBe(DEFAULT_CONFIG.cwd)
  })

  test("apply_config_defaults should handle nested partial overrides", () => {
    const merged = apply_config_defaults({
      daemon: { max_recovery_failures: 10 },
    })
    expect(merged.daemon.max_recovery_failures).toBe(10)
    expect(merged.daemon.health_check_interval_ms).toBe(5000)
  })

  test("config_to_yaml should produce valid YAML string", () => {
    const config = get_default_config()
    const yaml = config_to_yaml(config)
    expect(yaml).toContain("port: 3000")
    expect(yaml).toContain("log_level: info")
    expect(yaml).toContain("auth:")
    expect(yaml).toContain("daemon:")
    expect(yaml).toContain("session:")
    expect(yaml).toContain("shell:")
  })
})

describe("V16 config_wizard detect_environment", () => {
  const original_env = { ...process.env }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in original_env)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, original_env)
  })

  test("should detect OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const env = detect_environment()
    expect(env.has_openai_api_key).toBe(true)
  })

  test("should detect API_KEY", () => {
    process.env.API_KEY = "test-key"
    const env = detect_environment()
    expect(env.has_api_key).toBe(true)
  })

  test("should detect PORT env", () => {
    process.env.PORT = "9090"
    const env = detect_environment()
    expect(env.has_port_env).toBe(true)
    expect(env.detected_port).toBe(9090)
  })

  test("should detect invalid PORT as null", () => {
    process.env.PORT = "not-a-port"
    const env = detect_environment()
    expect(env.has_port_env).toBe(true)
    expect(env.detected_port).toBe(null)
  })

  test("should detect CONFIG_FILE", () => {
    process.env.CONFIG_FILE = "/etc/config.yaml"
    const env = detect_environment()
    expect(env.has_config_file).toBe(true)
    expect(env.detected_config_file).toBe("/etc/config.yaml")
  })

  test("should detect AUTO_START_DAEMON", () => {
    process.env.AUTO_START_DAEMON = "true"
    const env = detect_environment()
    expect(env.has_auto_start_daemon).toBe(true)
  })

  test("should return all false when no env vars set", () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.API_KEY
    delete process.env.PORT
    delete process.env.CONFIG_FILE
    delete process.env.AUTO_START_DAEMON
    const env = detect_environment()
    expect(env.has_openai_api_key).toBe(false)
    expect(env.has_api_key).toBe(false)
    expect(env.has_port_env).toBe(false)
    expect(env.has_config_file).toBe(false)
    expect(env.has_auto_start_daemon).toBe(false)
    expect(env.detected_port).toBe(null)
    expect(env.detected_config_file).toBe(null)
  })
})

describe("V16 config_wizard run_config_wizard", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should generate config with defaults when no options", () => {
    const result = run_config_wizard()
    expect(result.config.port).toBe(3000)
    expect(result.config.max_turns).toBe(50)
    expect(result.file_path).toBe(null)
  })

  test("should apply user options", () => {
    const options: WizardOptions = {
      port: 8080,
      cwd: "/custom/path",
      max_turns: 100,
      log_level: "debug",
    }
    const result = run_config_wizard(options)
    expect(result.config.port).toBe(8080)
    expect(result.config.cwd).toBe("/custom/path")
    expect(result.config.max_turns).toBe(100)
    expect(result.config.log_level).toBe("debug")
  })

  test("should write config file when output_path provided", () => {
    const result = run_config_wizard({
      output_path: TEST_CONFIG_PATH,
      port: 4000,
      overwrite: true,
    })
    expect(result.file_path).toBe(TEST_CONFIG_PATH)
    expect(existsSync(TEST_CONFIG_PATH)).toBe(true)
    const content = readFileSync(TEST_CONFIG_PATH, "utf-8")
    expect(content).toContain("port: 4000")
  })

  test("should not overwrite existing file when overwrite is false", () => {
    // 先创建文件
    run_config_wizard({ output_path: TEST_CONFIG_PATH, port: 1111, overwrite: true })
    // 再次运行不覆盖
    const result = run_config_wizard({ output_path: TEST_CONFIG_PATH, port: 2222 })
    expect(result.file_path).toBe(null)
    // 文件内容应保持不变
    const content = readFileSync(TEST_CONFIG_PATH, "utf-8")
    expect(content).toContain("port: 1111")
  })

  test("should overwrite when overwrite is true", () => {
    run_config_wizard({ output_path: TEST_CONFIG_PATH, port: 1111, overwrite: true })
    const result = run_config_wizard({ output_path: TEST_CONFIG_PATH, port: 2222, overwrite: true })
    expect(result.file_path).toBe(TEST_CONFIG_PATH)
    const content = readFileSync(TEST_CONFIG_PATH, "utf-8")
    expect(content).toContain("port: 2222")
  })

  test("should auto-detect port from environment", () => {
    process.env.PORT = "7777"
    const result = run_config_wizard({ auto_detect: true })
    expect(result.config.port).toBe(7777)
    expect(result.used_auto_detect).toBe(true)
    delete process.env.PORT
  })

  test("should prefer explicit port over env port", () => {
    process.env.PORT = "7777"
    const result = run_config_wizard({ port: 8888, auto_detect: true })
    expect(result.config.port).toBe(8888)
    delete process.env.PORT
  })

  test("should disable auto_detect when set to false", () => {
    process.env.PORT = "7777"
    const result = run_config_wizard({ auto_detect: false })
    expect(result.config.port).toBe(3000) // 默认值
    expect(result.used_auto_detect).toBe(false)
    delete process.env.PORT
  })
})

describe("V16 config_wizard validate_config_file", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should return invalid for non-existent file", () => {
    const result = validate_config_file("/nonexistent/config.yaml")
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("not found")
    expect(result.config).toBe(null)
  })

  test("should validate correct config file", () => {
    run_config_wizard({ output_path: TEST_CONFIG_PATH, overwrite: true })
    const result = validate_config_file(TEST_CONFIG_PATH)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
    expect(result.config).not.toBe(null)
    expect(result.config!.port).toBe(3000)
  })

  test("should detect invalid port type", () => {
    const invalid_yaml = "port: \"not-a-number\"\n"
    require("fs").writeFileSync(TEST_CONFIG_PATH, invalid_yaml)
    const result = validate_config_file(TEST_CONFIG_PATH)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e: string) => e.includes("port") && e.includes("number"))).toBe(true)
  })

  test("should detect port out of range", () => {
    const invalid_yaml = "port: 99999\n"
    require("fs").writeFileSync(TEST_CONFIG_PATH, invalid_yaml)
    const result = validate_config_file(TEST_CONFIG_PATH)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e: string) => e.includes("port") && e.includes("65535"))).toBe(true)
  })

  test("should detect invalid max_turns", () => {
    const invalid_yaml = "max_turns: -5\n"
    require("fs").writeFileSync(TEST_CONFIG_PATH, invalid_yaml)
    const result = validate_config_file(TEST_CONFIG_PATH)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e: string) => e.includes("max_turns"))).toBe(true)
  })
})

describe("V16 config_wizard generate_example_config", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should generate example config file", () => {
    const path = generate_example_config(TEST_EXAMPLE_PATH)
    expect(path).toBe(TEST_EXAMPLE_PATH)
    expect(existsSync(TEST_EXAMPLE_PATH)).toBe(true)
    const content = readFileSync(TEST_EXAMPLE_PATH, "utf-8")
    expect(content).toContain("port: 3000")
    expect(content).toContain("# Claude Code Engine Configuration")
  })

  test("should not overwrite existing file by default", () => {
    generate_example_config(TEST_EXAMPLE_PATH)
    // 修改文件
    require("fs").writeFileSync(TEST_EXAMPLE_PATH, "modified: true\n")
    // 再次生成不覆盖
    generate_example_config(TEST_EXAMPLE_PATH)
    const content = readFileSync(TEST_EXAMPLE_PATH, "utf-8")
    expect(content).toContain("modified: true")
  })

  test("should overwrite when overwrite is true", () => {
    generate_example_config(TEST_EXAMPLE_PATH)
    require("fs").writeFileSync(TEST_EXAMPLE_PATH, "modified: true\n")
    generate_example_config(TEST_EXAMPLE_PATH, true)
    const content = readFileSync(TEST_EXAMPLE_PATH, "utf-8")
    expect(content).toContain("port: 3000")
    expect(content).not.toContain("modified: true")
  })
})

describe("V16 config_wizard get_config_field_descriptions", () => {
  test("should return descriptions for all fields", () => {
    const descriptions = get_config_field_descriptions()
    expect(descriptions.port).toBeDefined()
    expect(descriptions.cwd).toBeDefined()
    expect(descriptions.max_turns).toBeDefined()
    expect(descriptions.log_level).toBeDefined()
    expect(descriptions.verbose).toBeDefined()
    expect(descriptions["auth.public_paths"]).toBeDefined()
    expect(descriptions["auth.rate_limit_max"]).toBeDefined()
    expect(descriptions["daemon.health_check_interval_ms"]).toBeDefined()
    expect(descriptions["daemon.plan_recovery_interval_ms"]).toBeDefined()
    expect(descriptions["daemon.auto_recover_plans"]).toBeDefined()
    expect(descriptions["daemon.max_recovery_failures"]).toBeDefined()
    expect(descriptions["session.default_max_history"]).toBeDefined()
    expect(descriptions["shell.timeout_ms"]).toBeDefined()
  })

  test("descriptions should include default values", () => {
    const descriptions = get_config_field_descriptions()
    expect(descriptions.port).toContain("3000")
    expect(descriptions.max_turns).toContain("50")
    expect(descriptions.log_level).toContain("info")
  })
})
