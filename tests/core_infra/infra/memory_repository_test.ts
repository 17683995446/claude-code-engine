import { describe, it, expect } from "bun:test"
import { MemoryRepository } from "../../../src/core_infra/infra/memory_repository.ts"
import { FileStorage } from "../../../src/core_infra/infra/file_storage.ts"

describe("memory_repository normal", () => {
  it("should add and get", () => {
    const storage: FileStorage = new FileStorage()
    const repo: MemoryRepository<string> = new MemoryRepository(storage, "test")
    repo.add("1", "a")
    expect(repo.get("1")).toBe("a")
  })
})

describe("memory_repository boundary", () => {
  it("should persist and restore", async () => {
    const storage: FileStorage = new FileStorage()
    const repo: MemoryRepository<string> = new MemoryRepository(storage, "test")
    repo.add("1", "a")
    await repo.persist()
    const repo2: MemoryRepository<string> = new MemoryRepository(storage, "test")
    await repo2.restore()
    expect(repo2.get("1")).toBe("a")
  })
})

describe("memory_repository invalid", () => {
  it("should return null for missing", () => {
    const storage: FileStorage = new FileStorage()
    const repo: MemoryRepository<string> = new MemoryRepository(storage, "test")
    expect(repo.get("x")).toBeNull()
  })
})

describe("memory_repository null edge", () => {
  it("should restore empty", async () => {
    const storage: FileStorage = new FileStorage()
    const repo: MemoryRepository<string> = new MemoryRepository(storage, "empty")
    await repo.restore()
    expect(repo.list().length).toBe(0)
  })
})

describe("memory_repository list", () => {
  it("should list all", () => {
    const storage: FileStorage = new FileStorage()
    const repo: MemoryRepository<number> = new MemoryRepository(storage, "nums")
    repo.add("a", 1)
    repo.add("b", 2)
    expect(repo.list()).toEqual([1, 2])
  })
})
