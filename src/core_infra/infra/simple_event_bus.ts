import { log_info } from "./global_logger.js"
import type { IEventBus, EventHandler } from "../core/i_event_bus.js"

export class SimpleEventBus implements IEventBus {
  private handlers: Map<string, EventHandler[]> = new Map()

  subscribe<T>(event: string, handler: EventHandler<T>): void {
    log_info(`event_bus_subscribe: ${event}`)
    const list = this.handlers.get(event) || []
    list.push(handler as EventHandler)
    this.handlers.set(event, list)
  }

  unsubscribe<T>(event: string, handler: EventHandler<T>): void {
    log_info(`event_bus_unsubscribe: ${event}`)
    const list = this.handlers.get(event)
    if (!list) {
      return
    }
    const idx = list.indexOf(handler as EventHandler)
    if (idx >= 0) {
      list.splice(idx, 1)
    }
  }

  publish<T>(event: string, payload: T): void {
    log_info(`event_bus_publish: ${event}`)
    const list = this.handlers.get(event)
    if (!list) {
      return
    }
    const snapshot: EventHandler[] = [...list]
    for (const h of snapshot) {
      try {
        h(payload)
      } catch (e) {
        log_info(`event_bus_handler_error: ${event} ${e}`)
      }
    }
  }

  subscriber_count(event: string): number {
    log_info(`event_bus_count: ${event}`)
    return this.handlers.get(event)?.length || 0
  }
}
