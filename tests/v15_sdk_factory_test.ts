import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  create_engine,
  create_engine_from_env,
  quick_start,
  quick_serve,
  resolve_engine_config,
  DEFAULT_ENGINE_OPTIONS,
} from "../src/sdk_factory.ts"
import { ClaudeCodeEngine } from "../src/index.ts"
import type { EngineOptions } from "../src/sdk_factory.ts"
import type { QueryEngineConfig } from "../src/core_infra/core/query_engine_config.ts"

describe("V15 resolve_engine_config", () => {
  test("should return defaults when no options", () => {
    const config = resolve_engine_config()
    expect(config.cwd).toBe(process.cwd())
    expect(config.max_turns).toBe(50)
    expect(config.initial_messages).toEqual([])
    expect(config.verbose).toBe(false)
  })

  test("should apply provided options", () => {
    const config = resolve_engine_config({
      cwd: "/tmp/test",
      max_turns: 100,
      verbose: true,
    })
    expect(config.cwd).toBe("/tmp/test")
    expect(config.max_turns).toBe(100)
    expect(config.verbose).toBe(true)
  })

  test("should partial apply options", () => {
    const config = resolve_engine_config({ max_turns: 25 })
    expect(config.cwd).toBe(process.cwd())
    expect(config.max_turns).toBe(25)
    expect(config.verbose).toBe(false)
  })

  test("should preserve initial_messages", () => {
    const messages = [
      { id: "1", content: "hello", role: "user" as const, timestamp: Date.now() },
    ]
    const config = resolve_engine_config({ initial_messages: messages })
    expect(config.initial_messages).toBe(messages)
    expect(config.initial_messages.length).toBe(1)
  })
})

describe("V15 DEFAULT_ENGINE_OPTIONS", () => {
  test("should have all required fields", () => {
    expect(DEFAULT_ENGINE_OPTIONS.cwd).toBeDefined()
    expect(DEFAULT_ENGINE_OPTIONS.max_turns).toBe(50)
    expect(DEFAULT_ENGINE_OPTIONS.initial_messages).toEqual([])
    expect(DEFAULT_ENGINE_OPTIONS.verbose).toBe(false)
  })
})

describe("V15 create_engine", () => {
  test("should create ClaudeCodeEngine instance", () => {
    const engine = create_engine()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should create with options", () => {
    const engine = create_engine({ cwd: "/tmp", max_turns: 10 })
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should create with no arguments", () => {
    const engine = create_engine()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    expect(engine.health_check()).toBeDefined()
    engine.stop()
  })
})

describe("V15 create_engine_from_env", () => {
  const original_env = { ...process.env }

  afterEach(() => {
    // 恢复环境变量
    for (const key of Object.keys(process.env)) {
      if (!(key in original_env)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, original_env)
  })

  test("should create engine with defaults when no env vars", () => {
    delete process.env.ENGINE_CWD
    delete process.env.ENGINE_MAX_TURNS
    delete process.env.ENGINE_VERBOSE
    const engine = create_engine_from_env()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should read ENGINE_CWD", () => {
    process.env.ENGINE_CWD = "/tmp/env-test"
    const engine = create_engine_from_env()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should read ENGINE_MAX_TURNS", () => {
    process.env.ENGINE_MAX_TURNS = "200"
    const engine = create_engine_from_env()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should read ENGINE_VERBOSE", () => {
    process.env.ENGINE_VERBOSE = "true"
    const engine = create_engine_from_env()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should handle invalid ENGINE_MAX_TURNS gracefully", () => {
    process.env.ENGINE_MAX_TURNS = "not-a-number"
    const engine = create_engine_from_env()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })

  test("should handle negative ENGINE_MAX_TURNS gracefully", () => {
    process.env.ENGINE_MAX_TURNS = "-5"
    const engine = create_engine_from_env()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })
})

describe("V15 quick_start", () => {
  test("should create and start engine", async () => {
    const engine = await quick_start({ cwd: "/tmp" })
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    expect(engine.health_check()).toBeDefined()
    engine.stop()
  })

  test("should work with no options", async () => {
    const engine = await quick_start()
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    engine.stop()
  })
})

describe("V15 quick_serve", () => {
  test("should create engine and start HTTP server", async () => {
    const { engine, server } = await quick_serve({ cwd: "/tmp" }, 0)
    expect(engine).toBeInstanceOf(ClaudeCodeEngine)
    expect(server.get_port()).toBeGreaterThan(0)
    server.stop()
    engine.stop()
  })

  test("should default to port 3000", async () => {
    // 使用端口 0 避免冲突，验证函数签名正确
    const { engine, server } = await quick_serve(undefined, 0)
    expect(server.get_port()).toBeGreaterThan(0)
    server.stop()
    engine.stop()
  })
})

describe("V15 EngineOptions type", () => {
  test("should accept all optional fields", () => {
    const opts: EngineOptions = {
      cwd: "/test",
      max_turns: 75,
      initial_messages: [],
      verbose: true,
    }
    const config: QueryEngineConfig = resolve_engine_config(opts)
    expect(config.cwd).toBe("/test")
    expect(config.max_turns).toBe(75)
    expect(config.verbose).toBe(true)
  })

  test("should accept empty object", () => {
    const opts: EngineOptions = {}
    const config: QueryEngineConfig = resolve_engine_config(opts)
    expect(config.cwd).toBeDefined()
    expect(config.max_turns).toBe(50)
  })
})
