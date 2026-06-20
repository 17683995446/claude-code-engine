import { log_info, log_warn } from "./global_logger.ts"
import type { ISnapshot } from "../core/i_snapshot.ts"
import type { IStorage } from "../core/i_storage.ts"

export class SnapshotManager implements ISnapshot {
  private readonly storage: IStorage
  private readonly prefix: string

  constructor(storage: IStorage, prefix: string = "snapshot") {
    log_info(`snapshot_manager_created: ${prefix}`)
    this.storage = storage
    this.prefix = prefix
  }

  private key(name: string): string {
    return `${this.prefix}:${name}`
  }

  async capture(name: string): Promise<void> {
    log_info(`snapshot_capture: ${name}`)
    const data: Record<string, unknown> = {}
    data.created_at = Date.now()
    await this.storage.save(this.key(name), data)
  }

  async restore(name: string): Promise<void> {
    log_info(`snapshot_restore: ${name}`)
    const data: unknown = await this.storage.load(this.key(name))
    if (!data) {
      log_warn(`snapshot_not_found: ${name}`)
      return
    }
  }

  async list(): Promise<string[]> {
    log_info("snapshot_list")
    const keys: string[] = await this.storage.list_keys(`${this.prefix}:`)
    return keys.map((k) => k.substring(`${this.prefix}:`.length))
  }

  async delete(name: string): Promise<void> {
    log_info(`snapshot_delete: ${name}`)
    await this.storage.delete(this.key(name))
  }
}
