import { AbcBase } from "../../core_infra/core/abc_base.js"
import {
  create_message,
  normalize_message,
} from "../../core_infra/core/message_pipeline.js"
import type { Message } from "../../core_infra/core/message_types.js"
import { log_info } from "../../core_infra/infra/global_logger.js"
import type { IMessageService } from "../../core_infra/core/i_message_service.js"

export class MessageService extends AbcBase implements IMessageService {
  private messages: Message[]
  private id_counter: number

  constructor() {
    super()
    this.messages = []
    this.id_counter = 0
  }

  validate(): boolean {
    log_info("message_service_validate: true")
    return true
  }

  to_object(): Record<string, unknown> {
    log_info(`message_service_to_object: count=${this.messages.length}`)
    return { count: this.messages.length }
  }

  add(content: string, role: "user" | "assistant" | "system"): Message {
    log_info(`message_service_add: role=${role}`)
    this.id_counter += 1
    const msg: Message = create_message(String(this.id_counter), content, role)
    this.messages.push(msg)
    log_info(`message_service_add_done: id=${msg.id}`)
    return msg
  }

  normalize_all(): Message[] {
    log_info("message_service_normalize_all")
    return this.messages.map(normalize_message)
  }

  get_all(): Message[] {
    log_info(`message_service_get_all: ${this.messages.length}`)
    return [...this.messages]
  }

  clear(): void {
    log_info(`message_service_clear: ${this.messages.length}`)
    this.messages = []
  }
}
