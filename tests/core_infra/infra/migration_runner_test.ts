import { describe, it, expect } from "bun:test"
import { MigrationRunner } from "../../../src/core_infra/infra/migration_runner.ts"
import type { IMigration } from "../../../src/core_infra/core/i_migration.ts"

describe("migration_runner", () => {
  it("should run migrations up and down", async () => {
    const runner = new MigrationRunner()
    let state = 0
    const m1: IMigration = {
      version: "1.0",
      async up(): Promise<void> {
        state = 1
      },
      async down(): Promise<void> {
        state = 0
      },
    }
    runner.register(m1)
    await runner.up()
    expect(state).toBe(1)
    await runner.down()
    expect(state).toBe(0)
  })
})
