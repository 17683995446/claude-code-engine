import { describe, it, expect, beforeAll } from "bun:test"
import {
  execute_command_async,
  validate_command,
  set_allowed_cwd,
} from "../../../src/services_entry/services/shell_executor.ts"
import { AsyncShellService } from "../../../src/services_entry/services/async_services.ts"
import type { ShellCommand } from "../../../src/services_entry/services/shell_types.ts"

// ============================================================
// V1: 真实 Shell 执行引擎 + 安全控制测试
// ============================================================

beforeAll(() => {
  set_allowed_cwd("/tmp")
})

describe("V1 validate_command security", () => {
  it("should reject empty command", () => {
    expect(validate_command({ command: "", timeout_ms: 5000 })).toBe(false)
  })

  it("should reject zero or negative timeout", () => {
    expect(validate_command({ command: "echo hi", timeout_ms: 0 })).toBe(false)
    expect(validate_command({ command: "echo hi", timeout_ms: -1 })).toBe(false)
  })

  it("should reject timeout exceeding 60s", () => {
    expect(validate_command({ command: "echo hi", timeout_ms: 60001 })).toBe(false)
    expect(validate_command({ command: "echo hi", timeout_ms: 60000 })).toBe(true)
  })

  it("should reject rm -rf /", () => {
    expect(validate_command({ command: "rm -rf /", timeout_ms: 5000 })).toBe(false)
  })

  it("should reject fork bomb", () => {
    expect(validate_command({ command: ":(){ :|:& };:", timeout_ms: 5000 })).toBe(false)
  })

  it("should reject shutdown/reboot/mkfs", () => {
    expect(validate_command({ command: "shutdown now", timeout_ms: 5000 })).toBe(false)
    expect(validate_command({ command: "reboot", timeout_ms: 5000 })).toBe(false)
    expect(validate_command({ command: "mkfs.ext4 /dev/sda1", timeout_ms: 5000 })).toBe(false)
  })

  it("should reject dd to device", () => {
    expect(validate_command({ command: "dd if=/dev/zero of=/dev/sda", timeout_ms: 5000 })).toBe(false)
  })

  it("should reject chmod -R 777 /", () => {
    expect(validate_command({ command: "chmod -R 777 /", timeout_ms: 5000 })).toBe(false)
  })

  it("should accept safe commands", () => {
    expect(validate_command({ command: "echo hello", timeout_ms: 5000 })).toBe(true)
    expect(validate_command({ command: "ls -la", timeout_ms: 5000 })).toBe(true)
    expect(validate_command({ command: "pwd", timeout_ms: 5000 })).toBe(true)
    expect(validate_command({ command: "cat file.txt", timeout_ms: 5000 })).toBe(true)
  })

  it("should reject null/undefined cmd", () => {
    expect(validate_command(null as unknown as ShellCommand)).toBe(false)
    expect(validate_command(undefined as unknown as ShellCommand)).toBe(false)
  })
})

describe("V1 execute_command_async real execution", () => {
  it("should execute echo and capture stdout", async () => {
    const result = await execute_command_async({ command: "echo hello_world", timeout_ms: 5000 })
    expect(result.exit_code).toBe(0)
    expect(result.stdout.trim()).toBe("hello_world")
    expect(result.stderr).toBe("")
  })

  it("should execute pwd in allowed cwd", async () => {
    const result = await execute_command_async({ command: "pwd", timeout_ms: 5000 })
    expect(result.exit_code).toBe(0)
    expect(result.stdout.trim()).toBe("/tmp")
  })

  it("should capture stderr", async () => {
    const result = await execute_command_async({ command: "echo err >&2", timeout_ms: 5000 })
    expect(result.exit_code).toBe(0)
    expect(result.stderr.trim()).toBe("err")
  })

  it("should return non-zero exit code for failing command", async () => {
    const result = await execute_command_async({ command: "exit 42", timeout_ms: 5000 })
    expect(result.exit_code).toBe(42)
  })

  it("should return exit code 1 for nonexistent command", async () => {
    const result = await execute_command_async({ command: "nonexistent_command_xyz", timeout_ms: 5000 })
    expect(result.exit_code).not.toBe(0)
    expect(result.stderr.length).toBeGreaterThan(0)
  })

  it("should capture multi-line output", async () => {
    const result = await execute_command_async({
      command: "printf 'line1\\nline2\\nline3\\n'",
      timeout_ms: 5000,
    })
    expect(result.exit_code).toBe(0)
    expect(result.stdout).toBe("line1\nline2\nline3\n")
  })

  it("should handle command with pipes", async () => {
    const result = await execute_command_async({
      command: "echo 'a b c' | wc -w",
      timeout_ms: 5000,
    })
    expect(result.exit_code).toBe(0)
    expect(result.stdout.trim()).toBe("3")
  })

  it("should handle command with environment variables", async () => {
    const result = await execute_command_async({
      command: "echo $HOME",
      timeout_ms: 5000,
    })
    expect(result.exit_code).toBe(0)
    expect(result.stdout.trim().length).toBeGreaterThan(0)
  })

  it("should timeout long-running command", async () => {
    const start: number = Date.now()
    const result = await execute_command_async({ command: "sleep 10", timeout_ms: 500 })
    const elapsed: number = Date.now() - start
    expect(result.exit_code).toBe(124)
    expect(elapsed).toBeLessThan(3000) // 应在 500ms 超时后很快返回
    expect(result.stderr).toContain("timeout")
  })

  it("should reject dangerous command without executing", async () => {
    const result = await execute_command_async({ command: "rm -rf /", timeout_ms: 5000 })
    expect(result.exit_code).toBe(1)
    expect(result.stderr).toBe("invalid_or_dangerous_command")
  })

  it("should reject empty command", async () => {
    const result = await execute_command_async({ command: "", timeout_ms: 5000 })
    expect(result.exit_code).toBe(1)
    expect(result.stderr).toBe("invalid_or_dangerous_command")
  })
})

describe("V1 AsyncShellService with real execution", () => {
  it("should execute real command via service", async () => {
    const svc: AsyncShellService = new AsyncShellService("/tmp")
    const result = await svc.run({ command: "echo service_test", timeout_ms: 5000 })
    expect(result.exit_code).toBe(0)
    expect(result.stdout.trim()).toBe("service_test")
  })

  it("should track real command history", async () => {
    const svc: AsyncShellService = new AsyncShellService("/tmp")
    await svc.run({ command: "echo cmd1", timeout_ms: 5000 })
    await svc.run({ command: "echo cmd2", timeout_ms: 5000 })
    const history: { command: string }[] = await svc.get_history()
    expect(history.length).toBe(2)
    expect(history[0].command).toBe("echo cmd1")
    expect(history[1].command).toBe("echo cmd2")
  })

  it("should reject dangerous command via service", async () => {
    const svc: AsyncShellService = new AsyncShellService("/tmp")
    const result = await svc.run({ command: "rm -rf /", timeout_ms: 5000 })
    // 熔断器捕获 invalid_command 异常，返回 fallback
    expect(result.exit_code).toBe(1)
    // stderr 可能是 circuit_open（熔断器 fallback）或 invalid_or_dangerous_command
    expect(["circuit_open", "invalid_or_dangerous_command"]).toContain(result.stderr)
  })

  it("should handle command timeout via service", async () => {
    const svc: AsyncShellService = new AsyncShellService("/tmp")
    const result = await svc.run({ command: "sleep 5", timeout_ms: 300 })
    expect(result.exit_code).toBe(124)
  })

  it("should execute ls and list files", async () => {
    const svc: AsyncShellService = new AsyncShellService("/tmp")
    const result = await svc.run({ command: "ls", timeout_ms: 5000 })
    expect(result.exit_code).toBe(0)
    expect(result.stdout.length).toBeGreaterThan(0)
  })
})
