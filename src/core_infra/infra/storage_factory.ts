import { log_info } from "./global_logger.ts"
import type { IStorage } from "../core/i_storage.ts"
import { FileStorage } from "./file_storage.ts"
import { DiskStorage } from "./disk_storage.ts"
import { SqliteStorage } from "./sqlite_storage.ts"

/**
 * 存储类型枚举。
 */
export type StorageType = "memory" | "disk" | "sqlite"

/**
 * 存储配置。
 */
export interface StorageConfig {
  type: StorageType
  base_dir?: string
  db_path?: string
}

/**
 * StorageFactory - 存储工厂。
 *
 * 根据配置创建不同类型的存储适配器：
 * - memory: 纯内存存储（FileStorage），最快但无持久化
 * - disk: 真实文件系统存储（DiskStorage），跨进程持久化
 * - sqlite: SQLite 存储（SqliteStorage），事务性持久化
 */
export class StorageFactory {
  static create(config: StorageConfig): IStorage {
    log_info(`storage_factory_create: ${config.type}`)
    switch (config.type) {
      case "memory":
        return new FileStorage()
      case "disk":
        return new DiskStorage(config.base_dir ?? "/tmp/storage")
      case "sqlite":
        return new SqliteStorage(config.db_path ?? ":memory:")
      default:
        throw new Error(`unknown_storage_type: ${config.type}`)
    }
  }
}
