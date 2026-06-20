import type { Message } from "../../../../core_infra/core/message_types.js"
import { log_info } from "../../../../core_infra/infra/global_logger.js"
import type { IMessageListRenderer } from "../../../../core_infra/core/i_component.js"

export class AppComponent implements IMessageListRenderer {
  private messages: Message[] = []

  set_messages(messages: Message[]): void {
    log_info(`app_component_set_messages: ${messages.length}`)
    this.messages = [...messages]
  }

  render(): string {
    log_info("app_component_render")
    const lines: string[] = this.messages.map(render_message)
    return lines.join("\n")
  }
}

function render_message(message: Message): string {
  log_info(`render_message: id=${message.id}`)
  return `[${message.role}] ${message.content}`
}

export function render_app(messages: Message[]): string {
  log_info(`render_app_compat: ${messages.length}`)
  const comp = new AppComponent()
  comp.set_messages(messages)
  return comp.render()
}
