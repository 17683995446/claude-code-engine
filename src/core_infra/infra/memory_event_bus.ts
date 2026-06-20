import { log_info, log_warn } from "./global_logger.ts"
import type { IEventBus } from "../core/i_event_bus.ts"

export class MemoryEventBus implements IEventBus {
  private subs: Map<string, Set<(payload: string) => void>> = new Map()

  subscribe(event: string, handler: (payload: string) => void): void {
    log_info(`bus_subscribe: ${event}`)
    const set: Set<(payload: string) => void> = this.subs.get(event) ?? new Set()
    set.add(handler)
    this.subs.set(event, set)
  }

  unsubscribe(event: string, handler: (payload: string) => void): void {
    log_info(`bus_unsubscribe: ${event}`)
    const set: Set<(payload: string) => void> | undefined = this.subs.get(event)
    if (set) {
      set.delete(handler)
    }
  }

  publish(event: string, payload: string): void {
    log_info(`bus_publish: ${event}`)
    const set: Set<(payload: string) => void> | undefined = this.subs.get(event)
    if (!set || set.size === 0) {
      log_warn(`bus_no_subscribers: ${event}`)
      return
    }
    for (const handler of set) {
      try {
        handler(payload)
      } catch (e) {
        log_warn(`bus_handler_error: ${event} ${e}`)
      }
    }
  }
}
