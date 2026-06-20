import type { ShellCommand, ShellResult } from "../../services_entry/services/shell_types.ts"

/**
 * Shell service interface.
 *
 * Defines the contract for command execution and history tracking.
 */
export interface IShellService {
  /**
   * Validate the internal state.
   *
   * @returns True if valid.
   */
  validate(): boolean

  /**
   * Execute a shell command.
   *
   * @param cmd - The command to execute.
   * @returns The execution result.
   * @throws ShellException if execution fails.
   */
  run(cmd: ShellCommand): ShellResult

  /**
   * Get command execution history.
   *
   * @returns The array of executed commands.
   */
  get_history(): ShellCommand[]

  /**
   * Convert the service state to a plain object.
   *
   * @returns The plain object representation.
   */
  to_object(): Record<string, unknown>
}
