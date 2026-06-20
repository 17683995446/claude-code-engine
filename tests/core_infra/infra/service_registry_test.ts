import { describe, it, expect } from "bun:test"
import { ServiceRegistry } from "../../../src/core_infra/infra/service_registry.ts"

describe("service_registry normal", () => {
  it("should register and discover service", () => {
    const registry = new ServiceRegistry()
    registry.register_service("auth", { key: "abc" })
    const svc = registry.discover("auth")
    expect(svc).toEqual({ key: "abc" })
  })
})

describe("service_registry missing", () => {
  it("should return null for unknown service", () => {
    const registry = new ServiceRegistry()
    expect(registry.discover("unknown")).toBeNull()
  })
})

describe("service_registry list", () => {
  it("should list all services", () => {
    const registry = new ServiceRegistry()
    registry.register_service("a", 1)
    registry.register_service("b", 2)
    expect(registry.list_services()).toEqual(["a", "b"])
  })
})
