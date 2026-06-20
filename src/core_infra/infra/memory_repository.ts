import { log_info, log_warn } from "./global_logger.ts"
import type { IRepository } from "../core/i_repository.ts"
import type { IStorage } from "../core/i_storage.ts"

export class MemoryRepository<T> implements IRepository<T> {
  private items: Map<string, T> = new Map()
  private readonly storage: IStorage
  private readonly key: string

  constructor(storage: IStorage, key: string) {
    log_info(`memory_repository_created: ${key}`)
    this.storage = storage
    this.key = key
  }

  add(id: string, item: T): void {
    log_info(`memory_repository_add: ${id}`)
    this.items.set(id, item)
  }

  get(id: string): T | null {
    log_info(`memory_repository_get: ${id}`)
    const item: T | undefined = this.items.get(id)
    return item !== undefined ? this.clone(item) : null
  }

  list(): T[] {
    log_info(`memory_repository_list: ${this.items.size}`)
    return Array.from(this.items.values()).map((v) => this.clone(v))
  }

  private clone(item: T): T {
    if (item === null || typeof item !== "object") {
      return item
    }
    return JSON.parse(JSON.stringify(item)) as T
  }

  async persist(): Promise<void> {
    log_info(`memory_repository_persist: ${this.items.size}`)
    const snapshot: Record<string, T> = {}
    for (const [k, v] of this.items) {
      snapshot[k] = v
    }
    await this.storage.save(this.key, snapshot)
  }

  async restore(): Promise<void> {
    log_info(`memory_repository_restore: ${this.key}`)
    const data: unknown = await this.storage.load(this.key)
    if (!data) {
      log_warn(`memory_repository_empty: ${this.key}`)
      return
    }
    const snapshot: Record<string, T> = data as Record<string, T>
    this.items = new Map(Object.entries(snapshot))
  }

  clear(): void {
    log_info(`memory_repository_clear: ${this.items.size}`)
    this.items.clear()
  }
}
