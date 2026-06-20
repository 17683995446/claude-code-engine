import { describe, it, expect } from "bun:test"
import { SnapshotManager } from "../../../src/core_infra/infra/snapshot_manager.ts"
import { FileStorage } from "../../../src/core_infra/infra/file_storage.ts"

describe("snapshot_manager", () => {
  it("should capture and restore", async () => {
    const storage = new FileStorage()
    const snap = new SnapshotManager(storage)
    await snap.capture("v1")
    await snap.restore("v1")
    const list = await snap.list()
    expect(list.length).toBe(1)
    expect(list).toContain("v1")
    await snap.delete("v1")
    const list_after_delete = await snap.list()
    expect(list_after_delete.length).toBe(0)
  })
})
