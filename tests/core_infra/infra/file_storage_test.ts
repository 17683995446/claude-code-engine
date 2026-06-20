import { describe, it, expect } from "bun:test"
import { FileStorage } from "../../../src/core_infra/infra/file_storage.ts"

describe("file_storage normal", () => {
  it("should save and load", async () => {
    const storage: FileStorage = new FileStorage()
    await storage.save("k1", { a: 1 })
    const data = await storage.load("k1")
    expect(data).toEqual({ a: 1 })
  })
})

describe("file_storage boundary", () => {
  it("should return null for missing key", async () => {
    const storage: FileStorage = new FileStorage()
    const data = await storage.load("missing")
    expect(data).toBeNull()
  })
})

describe("file_storage invalid", () => {
  it("should delete key", async () => {
    const storage: FileStorage = new FileStorage()
    await storage.save("k2", "val")
    await storage.delete("k2")
    const data = await storage.load("k2")
    expect(data).toBeNull()
  })
})
