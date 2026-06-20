import { log_info, log_warn } from "./global_logger.ts"
import type { IConfigCenter } from "../core/i_config_center.ts"

export class MemoryConfigCenter implements IConfigCenter {
  private data: Map<string, string> = new Map()
  private watchers: ((key: string, value: string) => void)[] = []

  get(key: string): string | undefined {
    log_info(`config_get: ${key}`)
    return this.data.get(key)
  }

  set(key: string, value: string): void {
    log_info(`config_set: ${key}`)
    this.data.set(key, value)
    const snapshot: ((key: string, value: string) => void)[] = [...this.watchers]
    for (const w of snapshot) {
      try {
        w(key, value)
      } catch (e) {
        log_warn(`config_watcher_error: ${e}`)
      }
    }
  }

  async load(): Promise<void> {
    log_info("config_load")
  }

  watch(callback: (key: string, value: string) => void): void {
    log_info("config_watch")
    this.watchers.push(callback)
  }
}
