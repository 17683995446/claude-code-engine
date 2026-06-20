import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IStorage } from "../core/i_storage.ts"

/**
 * DiskStorage - 真实文件系统持久化存储。
 *
 * 每个 key 对应磁盘上的一个文件，数据以 JSON 序列化存储。
 * key 通过 base64url 编码转换为安全的文件名。
 * 跨进程持久化：进程重启后数据仍然存在。
 */
export class DiskStorage implements IStorage {
  private readonly base_dir: string

  constructor(base_dir: string) {
    log_info(`disk_storage_created: ${base_dir}`)
    this.base_dir = base_dir
    this.ensure_dir()
  }

  private ensure_dir(): void {
    const fs = require("fs")
    if (!fs.existsSync(this.base_dir)) {
      fs.mkdirSync(this.base_dir, { recursive: true })
      log_info(`disk_storage_mkdir: ${this.base_dir}`)
    }
  }

  private key_to_path(key: string): string {
    const encoded: string = Buffer.from(key).toString("base64url")
    return `${this.base_dir}/${encoded}.json`
  }

  private path_to_key(filename: string): string {
    const encoded: string = filename.replace(/\.json$/, "")
    return Buffer.from(encoded, "base64url").toString("utf-8")
  }

  async save(key: string, data: unknown): Promise<void> {
    log_info(`disk_storage_save: ${key}`)
    const path: string = this.key_to_path(key)
    try {
      const serialized: string = JSON.stringify(data)
      await Bun.write(path, serialized)
    } catch (e) {
      log_error(`disk_storage_save_failed: ${key} ${e}`)
      throw e
    }
  }

  async load(key: string): Promise<unknown | null> {
    log_info(`disk_storage_load: ${key}`)
    const path: string = this.key_to_path(key)
    try {
      const file = Bun.file(path)
      const exists: boolean = await file.exists()
      if (!exists) {
        log_warn(`disk_storage_missing: ${key}`)
        return null
      }
      const text: string = await file.text()
      return JSON.parse(text)
    } catch (e) {
      log_error(`disk_storage_load_failed: ${key} ${e}`)
      return null
    }
  }

  async delete(key: string): Promise<void> {
    log_info(`disk_storage_delete: ${key}`)
    const path: string = this.key_to_path(key)
    const fs = require("fs")
    try {
      if (fs.existsSync(path)) {
        fs.unlinkSync(path)
      }
    } catch (e) {
      log_warn(`disk_storage_delete_failed: ${key} ${e}`)
    }
  }

  async list_keys(prefix: string): Promise<string[]> {
    log_info(`disk_storage_list: ${prefix}`)
    const fs = require("fs")
    const keys: string[] = []
    try {
      const files: string[] = fs.readdirSync(this.base_dir)
      for (const f of files) {
        if (!f.endsWith(".json")) {
          continue
        }
        const key: string = this.path_to_key(f)
        if (key.startsWith(prefix)) {
          keys.push(key)
        }
      }
    } catch (e) {
      log_warn(`disk_storage_list_failed: ${e}`)
    }
    return keys
  }

  close(): void {
    log_info("disk_storage_close")
  }
}
