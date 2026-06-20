import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IStorage } from "../core/i_storage.ts"

export class FileStorage implements IStorage {
  private store: Map<string, unknown> = new Map()

  async save(key: string, data: unknown): Promise<void> {
    log_info(`file_storage_save: ${key}`)
    this.store.set(key, data)
  }

  async load(key: string): Promise<unknown | null> {
    log_info(`file_storage_load: ${key}`)
    if (!this.store.has(key)) {
      log_warn(`file_storage_missing: ${key}`)
      return null
    }
    return this.store.get(key) ?? null
  }

  async delete(key: string): Promise<void> {
    log_info(`file_storage_delete: ${key}`)
    this.store.delete(key)
  }

  async list_keys(prefix: string): Promise<string[]> {
    log_info(`file_storage_list: ${prefix}`)
    const keys: string[] = []
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }

  close(): void {
    log_info("file_storage_close")
    this.store.clear()
  }
}
