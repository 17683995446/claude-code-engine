import { log_info } from "./global_logger.ts"
import type { INotifier } from "../core/i_notifier.ts"

export class MemoryNotifier implements INotifier {
  private channels: Map<string, string[]> = new Map()

  send(channel: string, message: string): void {
    log_info(`memory_notifier_send: ${channel}`)
    const list: string[] = this.channels.get(channel) || []
    list.push(message)
    this.channels.set(channel, list)
  }

  get_messages(channel: string): string[] {
    log_info(`memory_notifier_get: ${channel}`)
    return [...(this.channels.get(channel) || [])]
  }
}
