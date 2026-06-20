import { describe, it, expect, beforeEach } from "bun:test"
import { SkillRegistry } from "../../../src/services_entry/services/skill_registry.ts"
import { ShellExecuteSkill, ChatCompleteSkill, EchoSkill, CompositeSkill } from "../../../src/services_entry/services/skills.ts"
import { AsyncShellService, AsyncMessageService } from "../../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../../src/services_entry/services/llm_adapters.ts"
import type { IStorage } from "../../../src/core_infra/core/i_storage.ts"
import type { SkillDefinition, CompositeStep } from "../../../src/core_infra/core/i_skill.ts"

// ============================================================
// V8: 技能系统 + 自我增强测试
// ============================================================

class MockStorage implements IStorage {
  private data: Map<string, unknown> = new Map()
  async save(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
  async load(key: string): Promise<unknown> {
    return this.data.get(key) ?? null
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }
  async list_keys(prefix: string): Promise<string[]> {
    const keys: string[] = []
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }
  close(): void {}
}

function make_registry_with_builtins(): SkillRegistry {
  const shell = new AsyncShellService("/tmp")
  const llm = new MockLlmAdapter("mock-v8")
  const registry = new SkillRegistry()
  // 同步注册内置技能
  void registry.register(new ShellExecuteSkill(shell))
  void registry.register(new ChatCompleteSkill(llm))
  void registry.register(new EchoSkill())
  return registry
}

describe("V8 内置技能 - ShellExecuteSkill", () => {
  let skill: ShellExecuteSkill

  beforeEach(() => {
    const shell = new AsyncShellService("/tmp")
    skill = new ShellExecuteSkill(shell)
  })

  it("should have correct metadata", () => {
    const meta = skill.get_metadata()
    expect(meta.id).toBe("shell.execute")
    expect(meta.name).toBe("ShellExecute")
    expect(meta.category).toBe("shell")
    expect(meta.builtin).toBe(true)
    expect(meta.version).toBe("1.0.0")
  })

  it("should declare input/output schema", () => {
    const def = skill.get_definition()
    expect(def.input_schema.length).toBe(2)
    expect(def.input_schema[0].name).toBe("command")
    expect(def.input_schema[0].required).toBe(true)
    expect(def.output_schema.length).toBe(3)
  })

  it("should execute shell command successfully", async () => {
    const result = await skill.execute({ command: "echo skill-test", timeout_ms: 5000 })
    expect(result.success).toBe(true)
    expect(result.error).toBeNull()
    const output = result.output as { exit_code: number; stdout: string }
    expect(output.exit_code).toBe(0)
    expect(output.stdout.trim()).toBe("skill-test")
  })

  it("should reject missing required parameter", async () => {
    const result = await skill.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toContain("missing_required_parameter")
    expect(result.error).toContain("command")
  })

  it("should reject type mismatch", async () => {
    const result = await skill.execute({ command: 123 })
    expect(result.success).toBe(false)
    expect(result.error).toContain("type_mismatch")
  })
})

describe("V8 内置技能 - ChatCompleteSkill", () => {
  let skill: ChatCompleteSkill

  beforeEach(() => {
    const llm = new MockLlmAdapter("mock-chat-skill")
    skill = new ChatCompleteSkill(llm)
  })

  it("should have correct metadata", () => {
    const meta = skill.get_metadata()
    expect(meta.id).toBe("chat.complete")
    expect(meta.category).toBe("chat")
  })

  it("should execute chat completion", async () => {
    const result = await skill.execute({ message: "hello skill" })
    expect(result.success).toBe(true)
    const output = result.output as { content: string }
    expect(output.content).toBe("[Mock] hello skill")
  })

  it("should accept optional system_prompt", async () => {
    const result = await skill.execute({ message: "test", system_prompt: "you are helpful" })
    expect(result.success).toBe(true)
  })

  it("should reject missing message", async () => {
    const result = await skill.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toContain("missing_required_parameter")
  })
})

describe("V8 内置技能 - EchoSkill", () => {
  let skill: EchoSkill

  beforeEach(() => {
    skill = new EchoSkill()
  })

  it("should echo the input message", async () => {
    const result = await skill.execute({ message: "echo me" })
    expect(result.success).toBe(true)
    const output = result.output as { echoed: string }
    expect(output.echoed).toBe("echo me")
  })

  it("should reject missing message", async () => {
    const result = await skill.execute({})
    expect(result.success).toBe(false)
  })
})

describe("V8 SkillRegistry - 基础 CRUD", () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = make_registry_with_builtins()
  })

  it("should list registered skills", async () => {
    // 等待异步注册完成
    await new Promise((r) => setTimeout(r, 50))
    const list = await registry.list()
    expect(list.length).toBe(3)
    const ids = list.map((m) => m.id).sort()
    expect(ids).toEqual(["chat.complete", "echo", "shell.execute"])
  })

  it("should get skill by ID", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const skill = await registry.get("echo")
    expect(skill).not.toBeNull()
    expect(skill!.get_id()).toBe("echo")
  })

  it("should return null for non-existent skill", async () => {
    const skill = await registry.get("nonexistent")
    expect(skill).toBeNull()
  })

  it("should get skill definition", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const def = await registry.get_definition("shell.execute")
    expect(def).not.toBeNull()
    expect(def!.metadata.id).toBe("shell.execute")
  })

  it("should count skills", async () => {
    await new Promise((r) => setTimeout(r, 50))
    expect(await registry.count()).toBe(3)
  })

  it("should reject duplicate registration", async () => {
    const shell = new AsyncShellService("/tmp")
    try {
      await registry.register(new ShellExecuteSkill(shell))
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("skill_already_exists")
    }
  })

  it("should not unregister builtin skills", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const deleted: boolean = await registry.unregister("echo")
    expect(deleted).toBe(false)
    const skill = await registry.get("echo")
    expect(skill).not.toBeNull()
  })

  it("should invoke skill by ID", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const result = await registry.invoke("echo", { message: "via registry" })
    expect(result.success).toBe(true)
    const output = result.output as { echoed: string }
    expect(output.echoed).toBe("via registry")
  })

  it("should return error for invoking non-existent skill", async () => {
    const result = await registry.invoke("nonexistent", {})
    expect(result.success).toBe(false)
    expect(result.error).toContain("skill_not_found")
  })
})

describe("V8 SkillRegistry - 自我增强（学习组合技能）", () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = make_registry_with_builtins()
  })

  it("should learn a simple composite skill", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const def: SkillDefinition = {
      metadata: {
        id: "learned.echo-twice",
        name: "EchoTwice",
        version: "1.0.0",
        description: "Echo the message twice",
        category: "composite",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "message", type: "string", required: true, description: "Message to echo" },
      ],
      output_schema: [
        { name: "first", type: "string", required: true, description: "First echo" },
        { name: "second", type: "string", required: true, description: "Second echo" },
      ],
      handler_type: "composite",
      steps: [
        { id: "s1", skill_id: "echo", input: { message: "${input.message}" }, depends_on: [] },
        { id: "s2", skill_id: "echo", input: { message: "${input.message}" }, depends_on: [] },
      ],
      output_mapping: {
        first: "${s1.output.echoed}",
        second: "${s2.output.echoed}",
      },
    }
    const id: string = await registry.learn_skill(def)
    expect(id).toBe("learned.echo-twice")
    // 验证已注册
    const skill = await registry.get(id)
    expect(skill).not.toBeNull()
  })

  it("should execute a learned composite skill", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const def: SkillDefinition = {
      metadata: {
        id: "learned.shell-then-echo",
        name: "ShellThenEcho",
        version: "1.0.0",
        description: "Run shell and echo result",
        category: "composite",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "command", type: "string", required: true, description: "Shell command" },
      ],
      output_schema: [
        { name: "stdout", type: "string", required: true, description: "Command stdout" },
        { name: "echoed", type: "string", required: true, description: "Echoed stdout" },
      ],
      handler_type: "composite",
      steps: [
        { id: "run", skill_id: "shell.execute", input: { command: "${input.command}", timeout_ms: 5000 }, depends_on: [] },
        { id: "echo", skill_id: "echo", input: { message: "${run.output.stdout}" }, depends_on: ["run"] },
      ],
      output_mapping: {
        stdout: "${run.output.stdout}",
        echoed: "${echo.output.echoed}",
      },
    }
    await registry.learn_skill(def)
    const result = await registry.invoke("learned.shell-then-echo", { command: "echo pipeline" })
    expect(result.success).toBe(true)
    const output = result.output as { stdout: string; echoed: string }
    expect(output.stdout.trim()).toBe("pipeline")
    expect(output.echoed.trim()).toBe("pipeline")
  })

  it("should reject learning non-composite skill", async () => {
    const def: SkillDefinition = {
      metadata: {
        id: "bad",
        name: "Bad",
        version: "1.0.0",
        description: "",
        category: "x",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [],
      output_schema: [],
      handler_type: "builtin",
    }
    try {
      await registry.learn_skill(def)
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("learn_skill_requires_composite_handler")
    }
  })

  it("should reject learning composite without steps", async () => {
    const def: SkillDefinition = {
      metadata: {
        id: "empty",
        name: "Empty",
        version: "1.0.0",
        description: "",
        category: "x",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [],
      output_schema: [],
      handler_type: "composite",
      steps: [],
    }
    try {
      await registry.learn_skill(def)
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("composite_skill_requires_steps")
    }
  })

  it("should reject learning composite with circular dependency", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const def: SkillDefinition = {
      metadata: {
        id: "circular",
        name: "Circular",
        version: "1.0.0",
        description: "",
        category: "x",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "a", skill_id: "echo", input: { message: "x" }, depends_on: ["b"] },
        { id: "b", skill_id: "echo", input: { message: "y" }, depends_on: ["a"] },
      ],
    }
    try {
      await registry.learn_skill(def)
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("circular_dependency_detected")
    }
  })

  it("should unregister learned (non-builtin) skill", async () => {
    await new Promise((r) => setTimeout(r, 50))
    const def: SkillDefinition = {
      metadata: {
        id: "learned.removable",
        name: "Removable",
        version: "1.0.0",
        description: "",
        category: "x",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "s1", skill_id: "echo", input: { message: "x" }, depends_on: [] },
      ],
      output_mapping: { out: "${s1.output.echoed}" },
    }
    await registry.learn_skill(def)
    expect(await registry.count()).toBe(4)
    const deleted: boolean = await registry.unregister("learned.removable")
    expect(deleted).toBe(true)
    expect(await registry.count()).toBe(3)
  })

  it("should handle composite skill with failed dependency", async () => {
    await new Promise((r) => setTimeout(r, 50))
    // 创建一个会失败的组合技能：第一步调用不存在的技能
    const def: SkillDefinition = {
      metadata: {
        id: "learned.failing",
        name: "Failing",
        version: "1.0.0",
        description: "",
        category: "x",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "bad", skill_id: "nonexistent.skill", input: {}, depends_on: [] },
        { id: "dependent", skill_id: "echo", input: { message: "should-not-run" }, depends_on: ["bad"] },
      ],
      output_mapping: {},
    }
    await registry.learn_skill(def)
    const result = await registry.invoke("learned.failing", {})
    expect(result.success).toBe(false)
    expect(result.error).toContain("composite_skill_step_failed")
  })
})

describe("V8 SkillRegistry - 持久化", () => {
  it("should persist and reload learned skills", async () => {
    const storage = new MockStorage()
    const shell = new AsyncShellService("/tmp")
    const llm = new MockLlmAdapter("mock-persist-v8")

    // 第一个 registry：注册内置技能 + 学习一个组合技能
    const registry1 = new SkillRegistry({ storage })
    await registry1.register(new ShellExecuteSkill(shell))
    await registry1.register(new ChatCompleteSkill(llm))
    await registry1.register(new EchoSkill())

    const def: SkillDefinition = {
      metadata: {
        id: "learned.persisted",
        name: "Persisted",
        version: "1.0.0",
        description: "A persisted learned skill",
        category: "composite",
        builtin: false,
        created_at: Date.now(),
      },
      input_schema: [
        { name: "message", type: "string", required: true, description: "" },
      ],
      output_schema: [],
      handler_type: "composite",
      steps: [
        { id: "s1", skill_id: "echo", input: { message: "${input.message}" }, depends_on: [] },
      ],
      output_mapping: { out: "${s1.output.echoed}" },
    }
    await registry1.learn_skill(def)

    // 第二个 registry：共享同一存储，重新注册内置技能 + 加载已学习技能
    const registry2 = new SkillRegistry({ storage })
    await registry2.register(new ShellExecuteSkill(shell))
    await registry2.register(new ChatCompleteSkill(llm))
    await registry2.register(new EchoSkill())
    const loaded: number = await registry2.load_from_storage()
    expect(loaded).toBe(1)

    // 验证已学习技能可用
    const skill = await registry2.get("learned.persisted")
    expect(skill).not.toBeNull()
    const result = await registry2.invoke("learned.persisted", { message: "reloaded" })
    expect(result.success).toBe(true)
    const output = result.output as { out: string }
    expect(output.out).toBe("reloaded")
  })

  it("should handle empty storage gracefully", async () => {
    const storage = new MockStorage()
    const registry = new SkillRegistry({ storage })
    const loaded: number = await registry.load_from_storage()
    expect(loaded).toBe(0)
  })

  it("should work without storage", async () => {
    const shell = new AsyncShellService("/tmp")
    const registry = new SkillRegistry()
    await registry.register(new EchoSkill())
    const result = await registry.invoke("echo", { message: "no-store" })
    expect(result.success).toBe(true)
  })
})
