import { describe, it, expect } from "bun:test"
import { HealthChecker } from "../../../src/core_infra/infra/health_checker.ts"

describe("health_checker normal", () => {
  it("should report healthy", () => {
    const checker = new HealthChecker()
    checker.register("db", () => true)
    const results = checker.check_all()
    expect(results[0].status).toBe("healthy")
  })
})

describe("health_checker unhealthy", () => {
  it("should report unhealthy", () => {
    const checker = new HealthChecker()
    checker.register("api", () => false)
    const results = checker.check_all()
    expect(results[0].status).toBe("unhealthy")
  })
})

describe("health_checker overall", () => {
  it("should compute overall status", () => {
    const checker = new HealthChecker()
    checker.register("a", () => true)
    checker.register("b", () => false)
    expect(checker.overall_status()).toBe("degraded")
  })
})

describe("health_checker all_healthy", () => {
  it("should be healthy when all pass", () => {
    const checker = new HealthChecker()
    checker.register("x", () => true)
    checker.register("y", () => true)
    expect(checker.overall_status()).toBe("healthy")
  })
})
