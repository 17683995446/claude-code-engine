import { log_info, log_warn } from "./global_logger.js"
import type { IConfigCenter } from "../core/i_config_center.js"

export class ConfigCenter implements IConfigCenter {
  private configs: Map<string, unknown> = new Map()
  private subscribers: Map<string, ((value: unknown) => void)[]> = new Map()

  get<T>(key: string): T | undefined {
    log_info(`config_center_get: ${key}`)
    return this.configs.get(key) as T | undefined
  }

  set<T>(key: string, value: T): void {
    log_info(`config_center_set: ${key}`)
    this.configs.set(key, value)
    this.notify(key, value)
  }

  on_change<T>(key: string, handler: (value: T) => void): void {
    log_info(`config_center_subscribe: ${key}`)
    const list = this.subscribers.get(key) || []
    list.push(handler as (value: unknown) => void)
    this.subscribers.set(key, list)
  }

  keys(): string[] {
    log_info(`config_center_keys: ${this.configs.size}`)
    return Array.from(this.configs.keys())
  }

  private notify<T>(key: string, value: T): void {
    const list = this.subscribers.get(key)
    if (!list) {
      return
    }
    const snapshot: ((value: unknown) => void)[] = [...list]
    for (const h of snapshot) {
      try {
        h(value)
      } catch (e) {
        log_warn(`config_center_notify_error: ${key} ${e}`)
      }
    }
  }
}
