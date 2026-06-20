import { describe, it, expect } from "bun:test"
import { MemoryFeatureFlag } from "../../../src/core_infra/infra/memory_feature_flag.ts"

describe("memory_feature_flag", () => {
  it("should be disabled by default", () => {
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    expect(ff.is_enabled("new_ui", "user1")).toBe(false)
  })

  it("should enable globally", () => {
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    ff.enable("new_ui")
    expect(ff.is_enabled("new_ui", "user1")).toBe(true)
  })

  it("should disable globally", () => {
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    ff.enable("new_ui")
    ff.disable("new_ui")
    expect(ff.is_enabled("new_ui", "user1")).toBe(false)
  })

  it("should rollout by percent", () => {
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    ff.set_rollout("new_ui", 50)
    let enabled_count: number = 0
    for (let i: number = 0; i < 100; i++) {
      if (ff.is_enabled("new_ui", `user_${i}`)) {
        enabled_count += 1
      }
    }
    expect(enabled_count).toBeGreaterThan(0)
    expect(enabled_count).toBeLessThan(100)
  })

  it("should be deterministic for same subject", () => {
    const ff: MemoryFeatureFlag = new MemoryFeatureFlag()
    ff.set_rollout("new_ui", 50)
    const a: boolean = ff.is_enabled("new_ui", "user_a")
    const b: boolean = ff.is_enabled("new_ui", "user_a")
    expect(a).toBe(b)
  })
})
