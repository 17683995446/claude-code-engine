/**
 * Tool call type.
 */
export type ToolCall = {
  tool_name: string
  arguments: Record<string, unknown>
}

/**
 * Tool scheduler interface.
 */
export interface IToolScheduler {
  /**
   * Schedule a tool call.
   *
   * @param tool_name - The tool name.
   * @param args - The arguments.
   * @returns The scheduled call.
   */
  schedule(tool_name: string, args: Record<string, unknown>): ToolCall

  /**
   * Execute a scheduled tool call.
   *
   * @param call - The call to execute.
   * @returns The execution result.
   */
  execute(call: ToolCall): string
}

/**
 * Tool interface.
 */
export interface ITool {
  /**
   * Get the tool name.
   *
   * @returns The tool name.
   */
  get_name(): string

  /**
   * Execute the tool with input.
   *
   * @param input - The tool input.
   * @returns The execution result.
   */
  execute(input: Record<string, unknown>): string
}
