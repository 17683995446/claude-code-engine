import { AbcBase } from "../../core_infra/core/abc_base.js"
import type { ShellCommand, ShellResult } from "./shell_types.js"
import { execute_command, validate_command } from "./shell_executor.js"
import { log_info, log_warn } from "../../core_infra/infra/global_logger.js"
import type { IShellService } from "../../core_infra/core/i_shell_service.js"

export class ShellService extends AbcBase implements IShellService {
  private history: ShellCommand[]
  private readonly default_timeout_ms: number

  constructor(default_timeout_ms: number = 30000) {
    super()
    this.history = []
    this.default_timeout_ms = default_timeout_ms
    log_info(`shell_service_created: timeout=${default_timeout_ms}`)
  }

  validate(): boolean {
    log_info("shell_service_validate")
    return true
  }

  to_object(): Record<string, unknown> {
    return { history_count: this.history.length }
  }

  run(cmd: ShellCommand): ShellResult {
    log_info(`shell_service_run: ${cmd.command}`)
    if (!validate_command(cmd)) {
      log_warn("shell_service_run: invalid command")
      return { exit_code: 1, stdout: "", stderr: "invalid command" }
    }
    const result: ShellResult = execute_command(cmd)
    this.history.push(cmd)
    return result
  }

  get_history(): ShellCommand[] {
    log_info(`shell_service_get_history: ${this.history.length}`)
    return [...this.history]
  }
}
