import { describe, it, expect } from "bun:test"
import { ComplianceChecker } from "../../../src/core_infra/infra/compliance_checker.ts"
import { DocGenerator } from "../../../src/core_infra/infra/doc_generator.ts"

describe("compliance_checker normal", () => {
  it("should pass default checks", () => {
    const checker = new ComplianceChecker()
    const results = checker.check_all()
    expect(results.length).toBe(7)
    expect(results.every((r) => r.passed)).toBe(true)
  })
})

describe("compliance_checker is_compliant", () => {
  it("should be compliant by default", () => {
    const checker = new ComplianceChecker()
    expect(checker.is_compliant()).toBe(true)
  })
})

describe("compliance_checker custom", () => {
  it("should run custom checks", () => {
    const checker = new ComplianceChecker()
    checker.register(() => ({ rule: "custom", passed: false, message: "fail" }))
    expect(checker.is_compliant()).toBe(false)
  })
})

describe("doc_generator normal", () => {
  it("should generate markdown", () => {
    const gen = new DocGenerator()
    gen.add({ name: "IQueryEngine", type: "interface", path: "core/i_query_engine.ts", description: "Core engine interface" })
    const md = gen.generate_markdown()
    expect(md).toContain("IQueryEngine")
    expect(md).toContain("interface")
  })
})

describe("doc_generator entries", () => {
  it("should list entries", () => {
    const gen = new DocGenerator()
    gen.add({ name: "A", type: "class", path: "a.ts", description: "desc" })
    expect(gen.get_entries().length).toBe(1)
  })
})
