import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { DiskStorage } from "../../src/core_infra/infra/disk_storage.ts"
import { SqliteStorage } from "../../src/core_infra/infra/sqlite_storage.ts"
import { StorageFactory } from "../../src/core_infra/infra/storage_factory.ts"
import { FileStorage } from "../../src/core_infra/infra/file_storage.ts"
import { SnapshotManager } from "../../src/core_infra/infra/snapshot_manager.ts"
import type { IStorage } from "../../src/core_infra/core/i_storage.ts"
import { existsSync, rmSync } from "fs"

// ============================================================
// U1: 持久化层测试
// 验证真实文件系统持久化和 SQLite 持久化
// ============================================================

const TEST_DIR = "/tmp/test_disk_storage"
const TEST_DB = "/tmp/test_sqlite_storage.db"

function cleanup(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true })
  }
  if (existsSync(TEST_DB)) {
    rmSync(TEST_DB, { force: true })
  }
  if (existsSync(TEST_DB + "-wal")) {
    rmSync(TEST_DB + "-wal", { force: true })
  }
  if (existsSync(TEST_DB + "-shm")) {
    rmSync(TEST_DB + "-shm", { force: true })
  }
}

beforeEach(() => {
  cleanup()
})

afterEach(() => {
  cleanup()
})

// ---- DiskStorage 基础功能 ----
describe("U1 DiskStorage basic operations", () => {
  it("should save and load data", async () => {
    const storage = new DiskStorage(TEST_DIR)
    await storage.save("key1", { name: "alice", age: 30 })
    const data = await storage.load("key1")
    expect(data).toEqual({ name: "alice", age: 30 })
  })

  it("should return null for missing key", async () => {
    const storage = new DiskStorage(TEST_DIR)
    const data = await storage.load("nonexistent")
    expect(data).toBe(null)
  })

  it("should delete data", async () => {
    const storage = new DiskStorage(TEST_DIR)
    await storage.save("key1", "value1")
    await storage.delete("key1")
    const data = await storage.load("key1")
    expect(data).toBe(null)
  })

  it("should list keys by prefix", async () => {
    const storage = new DiskStorage(TEST_DIR)
    await storage.save("user:1", "alice")
    await storage.save("user:2", "bob")
    await storage.save("post:1", "hello")
    const keys = await storage.list_keys("user:")
    expect(keys.length).toBe(2)
    expect(keys).toContain("user:1")
    expect(keys).toContain("user:2")
  })

  it("should handle special characters in keys", async () => {
    const storage = new DiskStorage(TEST_DIR)
    await storage.save("key/with:special@chars", "value")
    const data = await storage.load("key/with:special@chars")
    expect(data).toBe("value")
  })

  it("should handle unicode keys", async () => {
    const storage = new DiskStorage(TEST_DIR)
    await storage.save("你好世界", "value")
    const data = await storage.load("你好世界")
    expect(data).toBe("value")
  })

  it("should overwrite existing key", async () => {
    const storage = new DiskStorage(TEST_DIR)
    await storage.save("key1", "old")
    await storage.save("key1", "new")
    const data = await storage.load("key1")
    expect(data).toBe("new")
  })

  it("should handle complex nested objects", async () => {
    const storage = new DiskStorage(TEST_DIR)
    const complex = {
      users: [
        { id: 1, name: "alice", tags: ["admin", "user"] },
        { id: 2, name: "bob", meta: { created: 1234567890 } },
      ],
      count: 2,
      active: true,
    }
    await storage.save("complex", complex)
    const data = await storage.load("complex")
    expect(data).toEqual(complex)
  })
})

// ---- DiskStorage 跨进程持久化（核心验证）----
describe("U1 DiskStorage cross-process persistence", () => {
  it("should persist data across instances (simulating restart)", async () => {
    // 第一个实例写入数据
    const storage1 = new DiskStorage(TEST_DIR)
    await storage1.save("persistent_key", { value: "survives_restart" })
    await storage1.save("another_key", 42)

    // 创建新实例（模拟进程重启），数据应该仍然存在
    const storage2 = new DiskStorage(TEST_DIR)
    const data1 = await storage2.load("persistent_key")
    const data2 = await storage2.load("another_key")

    expect(data1).toEqual({ value: "survives_restart" })
    expect(data2).toBe(42)
  })

  it("should list keys across instances", async () => {
    const storage1 = new DiskStorage(TEST_DIR)
    await storage1.save("snap:v1", "data1")
    await storage1.save("snap:v2", "data2")
    await storage1.save("other", "data3")

    const storage2 = new DiskStorage(TEST_DIR)
    const keys = await storage2.list_keys("snap:")
    expect(keys.length).toBe(2)
    expect(keys).toContain("snap:v1")
    expect(keys).toContain("snap:v2")
  })

  it("should reflect deletions across instances", async () => {
    const storage1 = new DiskStorage(TEST_DIR)
    await storage1.save("key1", "value1")
    await storage1.save("key2", "value2")

    const storage2 = new DiskStorage(TEST_DIR)
    await storage2.delete("key1")

    const storage3 = new DiskStorage(TEST_DIR)
    const data1 = await storage3.load("key1")
    const data2 = await storage3.load("key2")
    expect(data1).toBe(null)
    expect(data2).toBe("value2")
  })
})

// ---- SqliteStorage 基础功能 ----
describe("U1 SqliteStorage basic operations", () => {
  it("should save and load data", async () => {
    const storage = new SqliteStorage(":memory:")
    await storage.save("key1", { name: "alice", age: 30 })
    const data = await storage.load("key1")
    expect(data).toEqual({ name: "alice", age: 30 })
    storage.close()
  })

  it("should return null for missing key", async () => {
    const storage = new SqliteStorage(":memory:")
    const data = await storage.load("nonexistent")
    expect(data).toBe(null)
    storage.close()
  })

  it("should delete data", async () => {
    const storage = new SqliteStorage(":memory:")
    await storage.save("key1", "value1")
    await storage.delete("key1")
    const data = await storage.load("key1")
    expect(data).toBe(null)
    storage.close()
  })

  it("should list keys by prefix", async () => {
    const storage = new SqliteStorage(":memory:")
    await storage.save("user:1", "alice")
    await storage.save("user:2", "bob")
    await storage.save("post:1", "hello")
    const keys = await storage.list_keys("user:")
    expect(keys.length).toBe(2)
    expect(keys).toContain("user:1")
    expect(keys).toContain("user:2")
    storage.close()
  })

  it("should handle special characters in keys", async () => {
    const storage = new SqliteStorage(":memory:")
    await storage.save("key/with:special@chars", "value")
    const data = await storage.load("key/with:special@chars")
    expect(data).toBe("value")
    storage.close()
  })

  it("should overwrite existing key", async () => {
    const storage = new SqliteStorage(":memory:")
    await storage.save("key1", "old")
    await storage.save("key1", "new")
    const data = await storage.load("key1")
    expect(data).toBe("new")
    storage.close()
  })

  it("should handle complex nested objects", async () => {
    const storage = new SqliteStorage(":memory:")
    const complex = {
      users: [
        { id: 1, name: "alice", tags: ["admin", "user"] },
        { id: 2, name: "bob", meta: { created: 1234567890 } },
      ],
      count: 2,
      active: true,
    }
    await storage.save("complex", complex)
    const data = await storage.load("complex")
    expect(data).toEqual(complex)
    storage.close()
  })
})

// ---- SqliteStorage 跨进程持久化（核心验证）----
describe("U1 SqliteStorage cross-process persistence", () => {
  it("should persist data across instances (simulating restart)", async () => {
    // 第一个实例写入数据到文件数据库
    const storage1 = new SqliteStorage(TEST_DB)
    await storage1.save("persistent_key", { value: "survives_restart" })
    await storage1.save("another_key", 42)
    storage1.close()

    // 创建新实例（模拟进程重启），数据应该仍然存在
    const storage2 = new SqliteStorage(TEST_DB)
    const data1 = await storage2.load("persistent_key")
    const data2 = await storage2.load("another_key")

    expect(data1).toEqual({ value: "survives_restart" })
    expect(data2).toBe(42)
    storage2.close()
  })

  it("should list keys across instances", async () => {
    const storage1 = new SqliteStorage(TEST_DB)
    await storage1.save("snap:v1", "data1")
    await storage1.save("snap:v2", "data2")
    await storage1.save("other", "data3")
    storage1.close()

    const storage2 = new SqliteStorage(TEST_DB)
    const keys = await storage2.list_keys("snap:")
    expect(keys.length).toBe(2)
    expect(keys).toContain("snap:v1")
    expect(keys).toContain("snap:v2")
    storage2.close()
  })

  it("should reflect deletions across instances", async () => {
    const storage1 = new SqliteStorage(TEST_DB)
    await storage1.save("key1", "value1")
    await storage1.save("key2", "value2")
    storage1.close()

    const storage2 = new SqliteStorage(TEST_DB)
    await storage2.delete("key1")
    storage2.close()

    const storage3 = new SqliteStorage(TEST_DB)
    const data1 = await storage3.load("key1")
    const data2 = await storage3.load("key2")
    expect(data1).toBe(null)
    expect(data2).toBe("value2")
    storage3.close()
  })
})

// ---- StorageFactory 工厂测试 ----
describe("U1 StorageFactory", () => {
  it("should create memory storage", () => {
    const storage = StorageFactory.create({ type: "memory" })
    expect(storage instanceof FileStorage).toBe(true)
  })

  it("should create disk storage", () => {
    const storage = StorageFactory.create({ type: "disk", base_dir: TEST_DIR })
    expect(storage instanceof DiskStorage).toBe(true)
  })

  it("should create sqlite storage", () => {
    const storage = StorageFactory.create({ type: "sqlite", db_path: ":memory:" })
    expect(storage instanceof SqliteStorage).toBe(true)
  })

  it("should throw for unknown type", () => {
    expect(() => {
      StorageFactory.create({ type: "unknown" as any })
    }).toThrow()
  })

  it("should create working storage of each type", async () => {
    const storages: IStorage[] = [
      StorageFactory.create({ type: "memory" }),
      StorageFactory.create({ type: "disk", base_dir: TEST_DIR }),
      StorageFactory.create({ type: "sqlite", db_path: ":memory:" }),
    ]

    for (const storage of storages) {
      await storage.save("factory_key", "factory_value")
      const data = await storage.load("factory_key")
      expect(data).toBe("factory_value")
    }
  })
})

// ---- SnapshotManager 与持久化存储集成 ----
describe("U1 SnapshotManager with persistent storage", () => {
  it("should persist snapshots across instances with DiskStorage", async () => {
    const storage1 = new DiskStorage(TEST_DIR)
    const snap1 = new SnapshotManager(storage1, "snap")
    await snap1.capture("v1")
    await snap1.capture("v2")

    // 新实例应该能看到之前的快照
    const storage2 = new DiskStorage(TEST_DIR)
    const snap2 = new SnapshotManager(storage2, "snap")
    const list = await snap2.list()
    expect(list.length).toBe(2)
    expect(list).toContain("v1")
    expect(list).toContain("v2")
  })

  it("should persist snapshots across instances with SqliteStorage", async () => {
    const storage1 = new SqliteStorage(TEST_DB)
    const snap1 = new SnapshotManager(storage1, "snap")
    await snap1.capture("v1")
    await snap1.capture("v2")
    storage1.close()

    // 新实例应该能看到之前的快照
    const storage2 = new SqliteStorage(TEST_DB)
    const snap2 = new SnapshotManager(storage2, "snap")
    const list = await snap2.list()
    expect(list.length).toBe(2)
    expect(list).toContain("v1")
    expect(list).toContain("v2")
    storage2.close()
  })
})

// ---- 性能与压力测试 ----
describe("U1 persistence stress tests", () => {
  it("DiskStorage should handle 100 keys", async () => {
    const storage = new DiskStorage(TEST_DIR)
    for (let i = 0; i < 100; i++) {
      await storage.save(`key_${i}`, { index: i, data: `value_${i}` })
    }
    const keys = await storage.list_keys("key_")
    expect(keys.length).toBe(100)

    // 验证随机几个 key 的数据正确性
    const data50 = await storage.load("key_50")
    expect(data50).toEqual({ index: 50, data: "value_50" })
  })

  it("SqliteStorage should handle 100 keys", async () => {
    const storage = new SqliteStorage(":memory:")
    for (let i = 0; i < 100; i++) {
      await storage.save(`key_${i}`, { index: i, data: `value_${i}` })
    }
    const keys = await storage.list_keys("key_")
    expect(keys.length).toBe(100)

    const data50 = await storage.load("key_50")
    expect(data50).toEqual({ index: 50, data: "value_50" })
    storage.close()
  })

  it("DiskStorage should handle large objects", async () => {
    const storage = new DiskStorage(TEST_DIR)
    const large_data = {
      items: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `item_${i}` })),
      metadata: { count: 1000, created: Date.now() },
    }
    await storage.save("large", large_data)
    const data = await storage.load("large")
    expect(data).toEqual(large_data)
  })

  it("SqliteStorage should handle large objects", async () => {
    const storage = new SqliteStorage(":memory:")
    const large_data = {
      items: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `item_${i}` })),
      metadata: { count: 1000, created: Date.now() },
    }
    await storage.save("large", large_data)
    const data = await storage.load("large")
    expect(data).toEqual(large_data)
    storage.close()
  })
})

// ---- 接口契约一致性测试 ----
describe("U1 storage interface contract consistency", () => {
  const storage_types: Array<{ name: string; factory: () => IStorage; cleanup?: () => void }> = [
    { name: "memory", factory: () => new FileStorage() },
    { name: "disk", factory: () => new DiskStorage(TEST_DIR) },
    { name: "sqlite", factory: () => new SqliteStorage(":memory:") },
  ]

  for (const { name, factory } of storage_types) {
    it(`${name} storage should satisfy IStorage contract`, async () => {
      const storage = factory()

      // save + load
      await storage.save("contract_key", "contract_value")
      expect(await storage.load("contract_key")).toBe("contract_value")

      // missing key returns null
      expect(await storage.load("missing")).toBe(null)

      // delete
      await storage.delete("contract_key")
      expect(await storage.load("contract_key")).toBe(null)

      // list_keys
      await storage.save("prefix:a", "1")
      await storage.save("prefix:b", "2")
      await storage.save("other:c", "3")
      const keys = await storage.list_keys("prefix:")
      expect(keys.length).toBe(2)

      // empty prefix returns all
      const all_keys = await storage.list_keys("")
      expect(all_keys.length).toBeGreaterThanOrEqual(2)
    })
  }
})
