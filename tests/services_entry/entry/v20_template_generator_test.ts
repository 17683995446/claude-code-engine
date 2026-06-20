import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync, readFileSync } from "fs"
import { join } from "path"
import {
  generate_template,
  list_templates,
  TEMPLATE_DESCRIPTIONS,
} from "../../../src/services_entry/entry/cli_sdk/template_generator.ts"
import type { TemplateType } from "../../../src/services_entry/entry/cli_sdk/template_generator.ts"

const TEST_DIR = "/tmp/v20_template_test"

describe("V20 TEMPLATE_DESCRIPTIONS", () => {
  test("should have all 5 template types", () => {
    const types = Object.keys(TEMPLATE_DESCRIPTIONS)
    expect(types.length).toBe(5)
    expect(types).toContain("basic")
    expect(types).toContain("api-server")
    expect(types).toContain("agent")
    expect(types).toContain("skill")
    expect(types).toContain("plugin")
  })

  test("each description should be non-empty", () => {
    for (const desc of Object.values(TEMPLATE_DESCRIPTIONS)) {
      expect(desc.length).toBeGreaterThan(0)
    }
  })
})

describe("V20 list_templates", () => {
  test("should return all 5 templates", () => {
    const templates = list_templates()
    expect(templates.length).toBe(5)
    const types = templates.map((t) => t.type)
    expect(types).toContain("basic")
    expect(types).toContain("api-server")
    expect(types).toContain("agent")
    expect(types).toContain("skill")
    expect(types).toContain("plugin")
  })

  test("each template should have type and description", () => {
    for (const t of list_templates()) {
      expect(t.type.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })
})

describe("V20 generate_template basic", () => {
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

  test("should generate basic template files", () => {
    const result = generate_template({
      type: "basic",
      output_dir: TEST_DIR,
      name: "test-basic",
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(result.errors.length).toBe(0)
    expect(result.files_created.length).toBeGreaterThan(0)
    // 验证关键文件存在
    expect(existsSync(join(TEST_DIR, "package.json"))).toBe(true)
    expect(existsSync(join(TEST_DIR, "tsconfig.json"))).toBe(true)
    expect(existsSync(join(TEST_DIR, "src", "index.ts"))).toBe(true)
    expect(existsSync(join(TEST_DIR, "README.md"))).toBe(true)
  })

  test("package.json should have correct name", () => {
    generate_template({
      type: "basic",
      output_dir: TEST_DIR,
      name: "my-app",
      overwrite: true,
    })
    const pkg = JSON.parse(readFileSync(join(TEST_DIR, "package.json"), "utf-8"))
    expect(pkg.name).toBe("my-app")
    expect(pkg.version).toBe("1.0.0")
    expect(pkg.scripts.start).toBeDefined()
  })

  test("src/index.ts should contain engine initialization", () => {
    generate_template({
      type: "basic",
      output_dir: TEST_DIR,
      name: "test-app",
      overwrite: true,
    })
    const content = readFileSync(join(TEST_DIR, "src", "index.ts"), "utf-8")
    expect(content).toContain("create_engine")
    expect(content).toContain("quick_start")
  })

  test("should fail when file exists and overwrite is false", () => {
    // 先生成一次
    generate_template({
      type: "basic",
      output_dir: TEST_DIR,
      name: "test",
      overwrite: true,
    })
    // 再次生成不覆盖
    const result = generate_template({
      type: "basic",
      output_dir: TEST_DIR,
      name: "test",
      overwrite: false,
    })
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("exists")
  })
})

describe("V20 generate_template api-server", () => {
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

  test("should generate api-server template files", () => {
    const result = generate_template({
      type: "api-server",
      output_dir: TEST_DIR,
      name: "test-api",
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(existsSync(join(TEST_DIR, "package.json"))).toBe(true)
    expect(existsSync(join(TEST_DIR, "src", "server.ts"))).toBe(true)
    expect(existsSync(join(TEST_DIR, ".env.example"))).toBe(true)
    expect(existsSync(join(TEST_DIR, "config.yaml"))).toBe(true)
  })

  test("server.ts should contain HTTP server setup", () => {
    generate_template({
      type: "api-server",
      output_dir: TEST_DIR,
      name: "test-api",
      overwrite: true,
    })
    const content = readFileSync(join(TEST_DIR, "src", "server.ts"), "utf-8")
    expect(content).toContain("create_engine")
    expect(content).toContain("start_http_server")
    expect(content).toContain("SIGINT")
    expect(content).toContain("SIGTERM")
  })

  test("config.yaml should contain valid YAML", () => {
    generate_template({
      type: "api-server",
      output_dir: TEST_DIR,
      name: "test-api",
      overwrite: true,
    })
    const content = readFileSync(join(TEST_DIR, "config.yaml"), "utf-8")
    expect(content).toContain("port: 3000")
    expect(content).toContain("log_level: info")
    expect(content).toContain("auth:")
    expect(content).toContain("daemon:")
  })
})

describe("V20 generate_template agent", () => {
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

  test("should generate agent template files", () => {
    const result = generate_template({
      type: "agent",
      output_dir: TEST_DIR,
      name: "test-agent",
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(existsSync(join(TEST_DIR, "src", "agent.ts"))).toBe(true)
    expect(existsSync(join(TEST_DIR, "src", "index.ts"))).toBe(true)
  })

  test("agent.ts should contain agent definition", () => {
    generate_template({
      type: "agent",
      output_dir: TEST_DIR,
      name: "my-agent",
      overwrite: true,
    })
    const content = readFileSync(join(TEST_DIR, "src", "agent.ts"), "utf-8")
    expect(content).toContain("agentDefinition")
    expect(content).toContain("my-agent")
    expect(content).toContain("handle_action")
    expect(content).toContain("initialize")
  })
})

describe("V20 generate_template skill", () => {
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

  test("should generate skill template files", () => {
    const result = generate_template({
      type: "skill",
      output_dir: TEST_DIR,
      name: "test-skill",
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(existsSync(join(TEST_DIR, "src", "skill.ts"))).toBe(true)
  })

  test("skill.ts should contain skill definition", () => {
    generate_template({
      type: "skill",
      output_dir: TEST_DIR,
      name: "my-skill",
      overwrite: true,
    })
    const content = readFileSync(join(TEST_DIR, "src", "skill.ts"), "utf-8")
    expect(content).toContain("skillDefinition")
    expect(content).toContain("my-skill")
    expect(content).toContain("execute")
    expect(content).toContain("validate_input")
  })
})

describe("V20 generate_template plugin", () => {
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

  test("should generate plugin template files", () => {
    const result = generate_template({
      type: "plugin",
      output_dir: TEST_DIR,
      name: "test-plugin",
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(existsSync(join(TEST_DIR, "src", "plugin.ts"))).toBe(true)
  })

  test("plugin.ts should contain plugin interface", () => {
    generate_template({
      type: "plugin",
      output_dir: TEST_DIR,
      name: "my-plugin",
      overwrite: true,
    })
    const content = readFileSync(join(TEST_DIR, "src", "plugin.ts"), "utf-8")
    expect(content).toContain("Plugin")
    expect(content).toContain("install")
    expect(content).toContain("my-plugin")
  })
})

describe("V20 generate_template error handling", () => {
  test("should return error for unknown template type", () => {
    const result = generate_template({
      type: "unknown" as TemplateType,
      output_dir: TEST_DIR,
      name: "test",
      overwrite: true,
    })
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("Unknown template type")
  })
})
