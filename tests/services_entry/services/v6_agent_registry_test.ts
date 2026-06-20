import { describe, it, expect, beforeEach } from "bun:test"
import { ShellAgent, ChatAgent } from "../../../src/services_entry/services/agents.ts"
import { AgentRegistry } from "../../../src/services_entry/services/agent_registry.ts"
import { AsyncShellService, AsyncMessageService } from "../../../src/services_entry/services/async_services.ts"
import { MockLlmAdapter } from "../../../src/services_entry/services/llm_adapters.ts"
import type { AgentAction, AgentResult } from "../../../src/core_infra/core/i_agent.ts"

// ============================================================
// V6: Agent 抽象 + 注册中心测试
// ============================================================

describe("V6 ShellAgent", () => {
  let agent: ShellAgent
  let shell: AsyncShellService

  beforeEach(() => {
    shell = new AsyncShellService("/tmp")
    agent = new ShellAgent("test-shell-1", shell)
  })

  it("should have correct metadata", () => {
    expect(agent.get_id()).toBe("test-shell-1")
    expect(agent.get_name()).toBe("ShellAgent")
    expect(agent.get_type()).toBe("shell")
    expect(agent.get_status()).toBe("idle")
  })

  it("should declare shell capabilities", () => {
    const caps = agent.get_capabilities()
    expect(caps.length).toBe(2)
    expect(caps[0].name).toBe("shell.run")
    expect(caps[1].name).toBe("shell.history")
  })

  it("should init and start", async () => {
    await agent.init()
    await agent.start()
    expect(agent.get_status()).toBe("running")
  })

  it("should execute shell.run action", async () => {
    await agent.init()
    await agent.start()
    const action: AgentAction = {
      type: "shell.run",
      input: { command: "echo hello", timeout_ms: 5000 },
    }
    const result: AgentResult = await agent.act(action)
    expect(result.success).toBe(true)
    expect(result.error).toBeNull()
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    const output = result.output as { exit_code: number; stdout: string }
    expect(output.exit_code).toBe(0)
    expect(output.stdout.trim()).toBe("hello")
  })

  it("should execute shell.history action", async () => {
    await agent.init()
    await agent.start()
    await agent.act({ type: "shell.run", input: { command: "echo test", timeout_ms: 5000 } })
    const result: AgentResult = await agent.act({ type: "shell.history", input: {} })
    expect(result.success).toBe(true)
    const history = result.output as Array<{ command: string }>
    expect(history.length).toBeGreaterThan(0)
  })

  it("should reject unknown action", async () => {
    await agent.init()
    await agent.start()
    const result: AgentResult = await agent.act({ type: "unknown", input: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain("unknown_action")
  })

  it("should fail when not running", async () => {
    const result: AgentResult = await agent.act({
      type: "shell.run",
      input: { command: "echo test", timeout_ms: 5000 },
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain("agent_not_running")
  })

  it("should stop cleanly", async () => {
    await agent.init()
    await agent.start()
    await agent.stop()
    expect(agent.get_status()).toBe("stopped")
  })

  it("should return info with capabilities", () => {
    const info = agent.get_info()
    expect(info.id).toBe("test-shell-1")
    expect(info.type).toBe("shell")
    expect(info.capabilities.length).toBe(2)
    expect(info.status).toBe("idle")
  })

  it("should serialize to object", () => {
    const obj = agent.to_object()
    expect(obj["id"]).toBe("test-shell-1")
    expect(obj["type"]).toBe("shell")
    expect(obj["status"]).toBe("idle")
  })
})

describe("V6 ChatAgent", () => {
  let agent: ChatAgent
  let llm: MockLlmAdapter
  let messages: AsyncMessageService

  beforeEach(() => {
    llm = new MockLlmAdapter("mock-agent-test")
    messages = new AsyncMessageService()
    agent = new ChatAgent("test-chat-1", llm, messages, {
      system_prompt: "test assistant",
    })
  })

  it("should declare chat capabilities", () => {
    const caps = agent.get_capabilities()
    expect(caps.length).toBe(3)
    expect(caps[0].name).toBe("chat.send")
    expect(caps[1].name).toBe("chat.history")
    expect(caps[2].name).toBe("chat.clear")
  })

  it("should execute chat.send action", async () => {
    await agent.init()
    await agent.start()
    const result: AgentResult = await agent.act({
      type: "chat.send",
      input: { message: "hello agent" },
    })
    expect(result.success).toBe(true)
    const output = result.output as { content: string }
    expect(output.content).toBe("[Mock] hello agent")
  })

  it("should reject empty message", async () => {
    await agent.init()
    await agent.start()
    const result: AgentResult = await agent.act({
      type: "chat.send",
      input: { message: "" },
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe("message_required")
  })

  it("should maintain conversation history", async () => {
    await agent.init()
    await agent.start()
    await agent.act({ type: "chat.send", input: { message: "first" } })
    await agent.act({ type: "chat.send", input: { message: "second" } })
    const result: AgentResult = await agent.act({ type: "chat.history", input: {} })
    expect(result.success).toBe(true)
    const history = result.output as Array<{ role: string; content: string }>
    expect(history.length).toBe(4)
  })

  it("should clear history", async () => {
    await agent.init()
    await agent.start()
    await agent.act({ type: "chat.send", input: { message: "test" } })
    const clear_result: AgentResult = await agent.act({ type: "chat.clear", input: {} })
    expect(clear_result.success).toBe(true)
    const history_result: AgentResult = await agent.act({ type: "chat.history", input: {} })
    const history = history_result.output as Array<unknown>
    expect(history.length).toBe(0)
  })

  it("should reject unknown action", async () => {
    await agent.init()
    await agent.start()
    const result: AgentResult = await agent.act({ type: "unknown", input: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain("unknown_action")
  })
})

describe("V6 AgentRegistry", () => {
  let registry: AgentRegistry
  let shell: AsyncShellService
  let llm: MockLlmAdapter
  let messages: AsyncMessageService

  beforeEach(() => {
    registry = new AgentRegistry()
    shell = new AsyncShellService("/tmp")
    llm = new MockLlmAdapter("mock-registry-test")
    messages = new AsyncMessageService()
  })

  it("should start empty", async () => {
    const list = await registry.list()
    expect(list.length).toBe(0)
    expect(await registry.count()).toBe(0)
  })

  it("should register and retrieve agent", async () => {
    const agent = new ShellAgent("reg-1", shell)
    const id = await registry.register(agent)
    expect(id).toBe("reg-1")
    const retrieved = await registry.get("reg-1")
    expect(retrieved).not.toBeNull()
    expect(retrieved!.get_name()).toBe("ShellAgent")
  })

  it("should list registered agents", async () => {
    await registry.register(new ShellAgent("reg-1", shell))
    await registry.register(new ChatAgent("reg-2", llm, messages))
    const list = await registry.list()
    expect(list.length).toBe(2)
    expect(list[0].id).toBe("reg-1")
    expect(list[1].id).toBe("reg-2")
  })

  it("should reject duplicate registration", async () => {
    await registry.register(new ShellAgent("dup-1", shell))
    try {
      await registry.register(new ShellAgent("dup-1", shell))
      expect(false).toBe(true)
    } catch (e) {
      expect(String(e)).toContain("agent_already_exists")
    }
  })

  it("should unregister agent", async () => {
    await registry.register(new ShellAgent("del-1", shell))
    expect(await registry.count()).toBe(1)
    const deleted: boolean = await registry.unregister("del-1")
    expect(deleted).toBe(true)
    expect(await registry.count()).toBe(0)
  })

  it("should return false for unregistering non-existent", async () => {
    const deleted: boolean = await registry.unregister("nonexistent")
    expect(deleted).toBe(false)
  })

  it("should return null for non-existent agent", async () => {
    const agent = await registry.get("nonexistent")
    expect(agent).toBeNull()
  })

  it("should invoke agent action by ID", async () => {
    await registry.register(new ShellAgent("inv-1", shell))
    await registry.start_agent("inv-1")
    const result: AgentResult = await registry.invoke("inv-1", {
      type: "shell.run",
      input: { command: "echo invoke", timeout_ms: 5000 },
    })
    expect(result.success).toBe(true)
    const output = result.output as { stdout: string }
    expect(output.stdout.trim()).toBe("invoke")
  })

  it("should return error for invoking non-existent agent", async () => {
    const result: AgentResult = await registry.invoke("nonexistent", {
      type: "shell.run",
      input: { command: "echo test" },
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain("agent_not_found")
  })

  it("should auto-start agent on invoke if not running", async () => {
    const agent = new ShellAgent("auto-1", shell)
    await registry.register(agent)
    expect(agent.get_status()).toBe("idle")
    const result: AgentResult = await registry.invoke("auto-1", {
      type: "shell.run",
      input: { command: "echo auto", timeout_ms: 5000 },
    })
    expect(result.success).toBe(true)
    expect(agent.get_status()).toBe("running")
  })

  it("should start and stop agents", async () => {
    await registry.register(new ShellAgent("ss-1", shell))
    await registry.start_agent("ss-1")
    const started = await registry.get("ss-1")
    expect(started!.get_status()).toBe("running")
    await registry.stop_agent("ss-1")
    const stopped = await registry.get("ss-1")
    expect(stopped!.get_status()).toBe("stopped")
  })

  it("should return false for starting non-existent", async () => {
    const result: boolean = await registry.start_agent("nonexistent")
    expect(result).toBe(false)
  })

  it("should generate sequential IDs", async () => {
    const id1: string = registry.next_id()
    const id2: string = registry.next_id()
    expect(id1).toBe("1")
    expect(id2).toBe("2")
  })

  it("should count agents correctly", async () => {
    expect(await registry.count()).toBe(0)
    await registry.register(new ShellAgent("c-1", shell))
    expect(await registry.count()).toBe(1)
    await registry.register(new ChatAgent("c-2", llm, messages))
    expect(await registry.count()).toBe(2)
    await registry.unregister("c-1")
    expect(await registry.count()).toBe(1)
  })
})
