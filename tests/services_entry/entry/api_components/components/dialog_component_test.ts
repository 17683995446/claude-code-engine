import { render_dialog } from "../../../../../src/services_entry/entry/api_components/components/dialog_component.ts"
import { describe, it, expect } from "bun:test"

describe("dialog_component normal", () => {
  it("should render dialog", () => {
    const result: string = render_dialog("Title", "Body")
    expect(result).toContain("Title")
    expect(result).toContain("Body")
  })
})

describe("dialog_component boundary", () => {
  it("should render minimal dialog", () => {
    const result: string = render_dialog("T", "B")
    expect(result).toContain("=== T ===")
  })
})

describe("dialog_component invalid", () => {
  it("should handle empty body", () => {
    const result: string = render_dialog("Title", "")
    expect(result).toContain("Title")
  })
})

describe("dialog_component null edge", () => {
  it("should handle empty title", () => {
    const result: string = render_dialog("", "Body")
    expect(result).toContain("===  ===")
  })
})
