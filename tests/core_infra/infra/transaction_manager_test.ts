import { describe, it, expect } from "bun:test"
import { TransactionManager } from "../../../src/core_infra/infra/transaction_manager.ts"

describe("transaction_manager normal", () => {
  it("should execute operation", () => {
    const tx = new TransactionManager<number>()
    const result = tx.execute(() => 42)
    expect(result.success).toBe(true)
    expect(result.data).toBe(42)
  })
})

describe("transaction_manager rollback", () => {
  it("should rollback on failure", () => {
    const tx = new TransactionManager<number>()
    tx.execute(() => 1)
    const result = tx.execute(() => { throw new Error("fail") })
    expect(result.success).toBe(false)
    expect(tx.get_history().length).toBe(1)
  })
})

describe("transaction_manager active", () => {
  it("should reflect active state", () => {
    const tx = new TransactionManager<string>()
    expect(tx.is_active()).toBe(false)
    tx.execute(() => "x")
    expect(tx.is_active()).toBe(false)
  })
})
