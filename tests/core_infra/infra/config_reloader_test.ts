import { describe, it, expect } from "bun:test"
import { ConfigReloader } from "../../../src/core_infra/infra/config_reloader.ts"
import type { IConfigLoader } from "../../../src/core_infra/core/i_config.ts"

class FakeLoader implements IConfigLoader {
  load(_file_path: string): Record<string, unknown> {
    return { key: "value" }
  }
}

class FailingLoader implements IConfigLoader {
  load(_file_path: string): Record<string, unknown> {
    throw new Error("fail")
  }
}

describe("config_reloader normal", () => {
  it("should reload config", () => {
    const reloader = new ConfigReloader(new FakeLoader(), "/tmp/config.yaml")
    expect(reloader.reload()).toBe(true)
    expect(reloader.last_reloaded_at()).toBeGreaterThan(0)
    expect(reloader.get_config()).toEqual({ key: "value" })
  })
})

describe("config_reloader failure", () => {
  it("should return false on load failure", () => {
    const reloader = new ConfigReloader(new FailingLoader(), "/tmp/bad.yaml")
    expect(reloader.reload()).toBe(false)
    expect(reloader.last_reloaded_at()).toBe(0)
  })
})
