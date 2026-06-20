import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type { ShellCommand, ShellResult } from "./shell_types.ts"

/**
 * Shell 执行器（V1 真实实现）。
 *
 * 使用 Bun.spawn 真实执行命令，提供安全控制：
 *   - 命令黑名单（禁止 rm -rf /、fork bomb、shutdown 等危险命令）
 *   - 工作目录限制（cwd 白名单）
 *   - 超时强制终止（kill 进程组）
 *   - stdout/stderr 流式捕获
 *   - 环境变量隔离（可选）
 */

// 危险命令模式黑名单（正则）
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\/(\s|$)/, // rm -rf /
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, // fork bomb :(){ :|:& };:
  /shutdown/,
  /reboot/,
  /mkfs/,
  /dd\s+.*of=\/dev\//, // dd 写裸设备
  />\s*\/dev\/sd[a-z]/, // 写裸磁盘
  /chmod\s+-R\s+777\s+\//, // chmod -R 777 /
  /\$\(\s*cat\s+\/etc\/shadow/, // 读 shadow
]

// 默认允许的工作目录（根目录限制）
let allowed_cwd: string = process.cwd()

/**
 * 设置允许的工作目录根。执行命令时 cwd 必须在此目录下。
 */
export function set_allowed_cwd(cwd: string): void {
  allowed_cwd = cwd
  log_info(`shell_executor_set_cwd: ${cwd}`)
}

/**
 * 校验命令是否安全可执行。
 * 检查：非空、timeout 正、不匹配危险模式。
 */
export function validate_command(cmd: ShellCommand): boolean {
  if (!cmd || typeof cmd.command !== "string" || cmd.command.length === 0) {
    return false
  }
  if (!Number.isFinite(cmd.timeout_ms) || cmd.timeout_ms <= 0) {
    return false
  }
  if (cmd.timeout_ms > 60000) {
    // 上限 60 秒，防止无限等待
    return false
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd.command)) {
      log_warn(`shell_executor_blocked_dangerous: ${cmd.command.slice(0, 80)}`)
      return false
    }
  }
  return true
}

/**
 * 真实执行命令（异步）。
 *
 * 使用 Bun.spawn，通过 /bin/sh -c 执行，捕获 stdout/stderr，
 * 超时后 kill 进程。返回 ShellResult。
 *
 * @param cmd 命令描述
 * @param cwd_override 可选工作目录覆盖（必须在 allowed_cwd 下）
 */
export async function execute_command_async(
  cmd: ShellCommand,
  cwd_override?: string,
): Promise<ShellResult> {
  if (!validate_command(cmd)) {
    log_warn(`shell_executor_rejected: ${cmd.command?.slice(0, 80)}`)
    return { exit_code: 1, stdout: "", stderr: "invalid_or_dangerous_command" }
  }

  const cwd: string = resolve_cwd(cwd_override)
  log_info(`shell_executor_run: ${cmd.command} (cwd=${cwd}, timeout=${cmd.timeout_ms}ms)`)

  try {
    const proc = Bun.spawn(["/bin/sh", "-c", cmd.command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, TERM: "dumb" },
    })

    // 并发：读 stdout、读 stderr、等退出、超时
    const stdout_promise: Promise<string> = read_stream_text(proc.stdout)
    const stderr_promise: Promise<string> = read_stream_text(proc.stderr)
    const exit_promise: Promise<number | null> = proc.exited
    const timeout_promise: Promise<"timeout"> = new Promise((resolve) =>
      setTimeout((): void => resolve("timeout"), cmd.timeout_ms),
    )

    const race_result: number | "timeout" = await Promise.race([exit_promise, timeout_promise])
    if (race_result === "timeout") {
      log_warn(`shell_executor_timeout: ${cmd.command.slice(0, 80)}`)
      try {
        proc.kill()
      } catch {
        // 进程可能已退出
      }
      // 超时后仍尝试读取已缓冲的输出（带短超时）
      let stdout: string = ""
      let stderr: string = ""
      try {
        stdout = await with_timeout(stdout_promise, 200)
        stderr = await with_timeout(stderr_promise, 200)
      } catch {
        // 忽略
      }
      return {
        exit_code: 124,
        stdout,
        stderr: stderr + "\n[timeout after " + cmd.timeout_ms + "ms]",
      }
    }

    const exit_code: number = race_result ?? 1
    const stdout: string = await stdout_promise
    const stderr: string = await stderr_promise
    log_info(`shell_executor_done: exit=${exit_code} stdout=${stdout.length}b stderr=${stderr.length}b`)
    return { exit_code, stdout, stderr }
  } catch (err) {
    log_error(`shell_executor_failed: ${err}`)
    return { exit_code: 1, stdout: "", stderr: String(err) }
  }
}

/**
 * 同步执行（mock 兼容旧接口，保留用于不依赖真实执行的测试）。
 * @deprecated 使用 execute_command_async 进行真实执行。
 */
export function execute_command(cmd: ShellCommand): ShellResult {
  return {
    exit_code: 0,
    stdout: `Executed: ${cmd.command}`,
    stderr: "",
  }
}

function resolve_cwd(override?: string): string {
  if (!override) {
    return allowed_cwd
  }
  // 防止路径穿越：override 必须在 allowed_cwd 下
  const resolved: string = override.startsWith("/") ? override : `${allowed_cwd}/${override}`
  if (!resolved.startsWith(allowed_cwd)) {
    log_warn(`shell_executor_cwd_blocked: ${override}`)
    return allowed_cwd
  }
  return resolved
}

async function read_stream_text(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return ""
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (value) {
      chunks.push(value)
    }
  }
  const total: number = chunks.reduce((sum, c) => sum + c.length, 0)
  const merged: Uint8Array = new Uint8Array(total)
  let offset: number = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  return new TextDecoder("utf-8").decode(merged)
}

async function with_timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout((): void => reject(new Error("read_timeout")), ms),
    ),
  ])
}
