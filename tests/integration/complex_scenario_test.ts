import { QueryEngine } from "../../src/core_infra/core/query_engine.ts"
import type { QueryEngineConfig } from "../../src/core_infra/core/query_engine_config.ts"
import { create_message } from "../../src/core_infra/core/message_pipeline.ts"
import { schedule_tool_call, execute_tool_call } from "../../src/core_infra/core/tool_scheduler.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"
import { describe, it, expect } from "bun:test"

function make_config(overrides: Partial<QueryEngineConfig> = {}): QueryEngineConfig {
  return {
    cwd: "/tmp",
    initial_messages: [],
    max_turns: 10,
    verbose: false,
    ...overrides,
  }
}

describe("complex_scenario chaos_test", () => {
  it("should handle rapid message churn", () => {
    const engine = new QueryEngine(make_config())
    const msg_service = new MessageService()

    for (let i = 0; i < 50; i++) {
      const msg = create_message(String(i), `content_${i}`, i % 2 === 0 ? "user" : "assistant")
      engine.add_message(msg)
      msg_service.add(`content_${i}`, i % 2 === 0 ? "user" : "assistant")
    }

    expect(engine.get_messages().length).toBe(50)
    expect(msg_service.get_all().length).toBe(50)
  })

  it("should handle auth token expiration mid flow", () => {
    const auth = new AuthService()
    auth.set_token({ source: "oauth", token: "secret", expires_at: Date.now() + 50 })

    expect(auth.is_token_expired()).toBe(false)

    const start = Date.now()
    while (Date.now() - start < 100) {
      // busy wait for expiration
    }

    expect(auth.is_token_expired()).toBe(true)
    expect(auth.get_status().is_authenticated).toBe(false)
  })

  it("should handle shell command burst and history overflow", () => {
    const shell = new ShellService()
    const results: number[] = []

    for (let i = 0; i < 20; i++) {
      const result = shell.run({ command: `cmd_${i}`, timeout_ms: 1000 })
      results.push(result.exit_code)
    }

    expect(shell.get_history().length).toBe(20)
    expect(results.every((r) => r === 0)).toBe(true)
  })

  it("should handle interleaved api requests with garbage", () => {
    const gateway = new ApiGateway()
    const valid_request = { action: "process", payload: { data: "valid" } }
    const response = gateway.handle_request(valid_request)
    expect(response.success).toBe(true)

    expect(() => gateway.handle_request({ action: "", payload: {} })).toThrow()
    expect(() => gateway.handle_request({ action: "a".repeat(65), payload: {} })).toThrow()
  })

  it("should handle tool scheduling storm", () => {
    const calls: ReturnType<typeof schedule_tool_call>[] = []

    for (let i = 0; i < 30; i++) {
      calls.push(schedule_tool_call(`tool_${i}`, { index: i }))
    }

    const results = calls.map(execute_tool_call)
    expect(results.length).toBe(30)
    expect(results[0]).toContain("tool_0")
    expect(results[29]).toContain("tool_29")
  })

  it("should handle full pipeline with failures", () => {
    const engine = new QueryEngine(make_config({ max_turns: 5 }))
    const auth = new AuthService()
    const shell = new ShellService()

    // Step 1: authenticate
    auth.set_token({ source: "test", token: "key", expires_at: Date.now() + 10000 })
    expect(auth.validate()).toBe(true)

    // Step 2: add messages
    engine.add_message(create_message("1", "hello", "user"))
    engine.add_message(create_message("2", "world", "assistant"))

    // Step 3: run shell command
    const shell_result = shell.run({ command: "echo test", timeout_ms: 5000 })
    expect(shell_result.exit_code).toBe(0)

    // Step 4: validate engine
    expect(engine.validate()).toBe(true)

    // Step 5: api request
    const api_gateway = new ApiGateway()
    const api_result = api_gateway.handle_request({ action: "query", payload: { messages: engine.get_messages() } })
    expect(api_result.success).toBe(true)
  })
})
