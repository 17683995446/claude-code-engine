import { AbcBase } from "../../../src/core_infra/core/abc_base.ts"
import { describe, it, expect } from "bun:test"

class TestAbc extends AbcBase {
  private value: boolean

  constructor(value: boolean) {
    super()
    this.value = value
  }

  validate(): boolean {
    return this.value
  }

  to_object(): Record<string, unknown> {
    return { value: this.value }
  }
}

describe("abc_base normal", () => {
  it("should validate true", () => {
    const obj = new TestAbc(true)
    expect(obj.validate()).toBe(true)
  })

  it("should convert to object", () => {
    const obj = new TestAbc(true)
    expect(obj.to_object().value).toBe(true)
  })
})

describe("abc_base boundary", () => {
  it("should validate false", () => {
    const obj = new TestAbc(false)
    expect(obj.validate()).toBe(false)
  })
})

describe("abc_base invalid", () => {
  it("should handle complex object", () => {
    const obj = new TestAbc(true)
    expect(Object.keys(obj.to_object()).length).toBe(1)
  })
})

describe("abc_base null edge", () => {
  it("should create with false", () => {
    const obj = new TestAbc(false)
    expect(obj.to_object().value).toBe(false)
  })
})
