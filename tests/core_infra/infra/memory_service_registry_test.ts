import { describe, it, expect } from "bun:test"
import { MemoryServiceRegistry } from "../../../src/core_infra/infra/memory_service_registry.ts"

describe("memory_service_registry", () => {
  it("should register and discover", () => {
    const reg = new MemoryServiceRegistry()
    reg.register("svc", "http://a:8080")
    reg.register("svc", "http://b:8080")
    expect(reg.discover("svc").length).toBe(2)
  })

  it("should filter unhealthy", () => {
    const reg = new MemoryServiceRegistry()
    reg.register("svc", "http://a:8080")
    reg.register("svc", "http://b:8080")
    reg.health("svc", "http://a:8080", false)
    expect(reg.discover("svc").length).toBe(1)
  })

  it("should deregister", () => {
    const reg = new MemoryServiceRegistry()
    reg.register("svc", "http://a:8080")
    reg.deregister("svc", "http://a:8080")
    expect(reg.discover("svc").length).toBe(0)
  })
})
