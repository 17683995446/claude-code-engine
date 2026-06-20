import { AbcBase } from "./abc_base.js"
import type { Message } from "./message_types.js"
import type { QueryEngineConfig } from "./query_engine_config.js"
import { log_info } from "../infra/global_logger.js"
import type { IQueryEngine } from "./i_query_engine.js"

export class QueryEngine extends AbcBase implements IQueryEngine {
  private config: QueryEngineConfig
  private messages: Message[]

  constructor(config: QueryEngineConfig) {
    super()
    this.config = { ...config }
    this.messages = [...config.initial_messages]
    log_info("query_engine_created")
  }

  validate(): boolean {
    const is_valid: boolean = this.config.cwd.length > 0 && this.config.max_turns > 0
    log_info(`query_engine_validate: ${is_valid}`)
    return is_valid
  }

  to_object(): Record<string, unknown> {
    return {
      cwd: this.config.cwd,
      message_count: this.messages.length,
    }
  }

  get_messages(): Message[] {
    log_info(`query_engine_get_messages: ${this.messages.length}`)
    return [...this.messages]
  }

  add_message(message: Message): void {
    log_info(`query_engine_add_message: ${message.id}`)
    this.messages.push(message)
  }
}
