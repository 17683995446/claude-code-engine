import { describe, it, expect } from "bun:test"
import { ConfigCenter } from "../../../src/core_infra/infra/config_center.ts"

describe("config_center normal", () => {
  it("should set and get", () => {
    const center = new ConfigCenter()
    center.set("timeout", 1000)
    expect(center.get("timeout")).toBe(1000)
  })
})

describe("config_center subscribe", () => {
  it("should notify on change", () => {
    const center = new ConfigCenter()
    let received: number = 0
    center.on_change("limit", (v: number) => { received = v })
    center.set("limit", 50)
    expect(received).toBe(50)
  })
})

describe("config_center keys", () => {
  it("should list keys", () => {
    const center = new ConfigCenter()
    center.set("a", 1)
    center.set("b", 2)
    expect(center.keys()).toEqual(["a", "b"])
  })
})

describe("config_center missing", () => {
  it("should return undefined for missing key", () => {
    const center = new ConfigCenter()
    expect(center.get("missing")).toBeUndefined()
  })
})
