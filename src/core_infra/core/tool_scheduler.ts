import { log_info } from "../infra/global_logger.js"
import type { IToolScheduler, ToolCall } from "./i_tool.js"

export type { ToolCall }

export class ToolScheduler implements IToolScheduler {
  schedule(tool_name: string, args: Record<string, unknown>): ToolCall {
    log_info(`tool_scheduler_schedule: ${tool_name}`)
    return { tool_name, arguments: args }
  }

  execute(call: ToolCall): string {
    log_info(`tool_scheduler_execute: ${call.tool_name}`)
    return `Executed ${call.tool_name}`
  }
}

export function schedule_tool_call(
  tool_name: string,
  args: Record<string, unknown>,
): ToolCall {
  log_info(`schedule_tool_call_compat: ${tool_name}`)
  const scheduler = new ToolScheduler()
  return scheduler.schedule(tool_name, args)
}

export function execute_tool_call(call: ToolCall): string {
  log_info(`execute_tool_call_compat: ${call.tool_name}`)
  const scheduler = new ToolScheduler()
  return scheduler.execute(call)
}
