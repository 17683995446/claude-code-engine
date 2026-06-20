import { Database } from "bun:sqlite"
import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IStorage } from "../core/i_storage.ts"

/**
 * SqliteStorage - 基于 SQLite 的持久化存储。
 *
 * 使用 bun:sqlite 内置模块，无需外部依赖。
 * 单表 kv_store(key TEXT PRIMARY KEY, value TEXT)。
 * 数据以 JSON 序列化存储，支持跨进程持久化。
 * 适合需要事务性、高并发读写的场景。
 */
export class SqliteStorage implements IStorage {
  private db: Database
  private stmt_save: ReturnType<Database["prepare"]>
  private stmt_load: ReturnType<Database["prepare"]>
  private stmt_delete: ReturnType<Database["prepare"]>
  private stmt_list: ReturnType<Database["prepare"]>

  constructor(db_path: string = ":memory:") {
    log_info(`sqlite_storage_created: ${db_path}`)
    this.db = new Database(db_path, { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
    this.stmt_save = this.db.prepare("INSERT OR REPLACE INTO kv_store(key, value) VALUES(?, ?)")
    this.stmt_load = this.db.prepare("SELECT value FROM kv_store WHERE key = ?")
    this.stmt_delete = this.db.prepare("DELETE FROM kv_store WHERE key = ?")
    this.stmt_list = this.db.prepare("SELECT key FROM kv_store WHERE key LIKE ?")
  }

  async save(key: string, data: unknown): Promise<void> {
    log_info(`sqlite_storage_save: ${key}`)
    try {
      const serialized: string = JSON.stringify(data)
      this.stmt_save.run(key, serialized)
    } catch (e) {
      log_error(`sqlite_storage_save_failed: ${key} ${e}`)
      throw e
    }
  }

  async load(key: string): Promise<unknown | null> {
    log_info(`sqlite_storage_load: ${key}`)
    try {
      const row = this.stmt_load.get(key) as { value: string } | null
      if (!row) {
        log_warn(`sqlite_storage_missing: ${key}`)
        return null
      }
      return JSON.parse(row.value)
    } catch (e) {
      log_error(`sqlite_storage_load_failed: ${key} ${e}`)
      return null
    }
  }

  async delete(key: string): Promise<void> {
    log_info(`sqlite_storage_delete: ${key}`)
    try {
      this.stmt_delete.run(key)
    } catch (e) {
      log_warn(`sqlite_storage_delete_failed: ${key} ${e}`)
    }
  }

  async list_keys(prefix: string): Promise<string[]> {
    log_info(`sqlite_storage_list: ${prefix}`)
    try {
      const pattern: string = `${prefix}%`
      const rows = this.stmt_list.all(pattern) as { key: string }[]
      return rows.map((r) => r.key)
    } catch (e) {
      log_warn(`sqlite_storage_list_failed: ${e}`)
      return []
    }
  }

  close(): void {
    log_info("sqlite_storage_close")
    try {
      this.db.close()
    } catch (e) {
      log_warn(`sqlite_storage_close_failed: ${e}`)
    }
  }
}
