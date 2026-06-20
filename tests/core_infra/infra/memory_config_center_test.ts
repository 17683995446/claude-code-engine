import { describe, it, expect } from "bun:test"
import { MemoryConfigCenter } from "../../../src/core_infra/infra/memory_config_center.ts"

describe("memory_config_center", () => {
  it("should get and set", async () => {
    const cfg = new MemoryConfigCenter()
    await cfg.load()
    cfg.set("key1", "val1")
    expect(cfg.get("key1")).toBe("val1")
    expect(cfg.get("missing")).toBeUndefined()
  })

  it("should watch changes", () => {
    const cfg = new MemoryConfigCenter()
    let received = ""
    cfg.watch((k, v) => {
      received = `${k}=${v}`
    })
    cfg.set("key2", "val2")
    expect(received).toBe("key2=val2")
  })
})
