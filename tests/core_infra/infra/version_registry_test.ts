import { describe, it, expect } from "bun:test"
import { VersionRegistry } from "../../../src/core_infra/infra/version_registry.ts"
import { VersionedWrapper } from "../../../src/core_infra/infra/versioned_wrapper.ts"

describe("version_registry normal", () => {
  it("should register and resolve", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const wrapper: VersionedWrapper<string> = new VersionedWrapper("1.0.0", "svc_v1")
    registry.register("svc", wrapper)
    const resolved = registry.resolve("svc", "1.0.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.0.0")
  })
})

describe("version_registry boundary", () => {
  it("should resolve compatible major version", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const wrapper: VersionedWrapper<string> = new VersionedWrapper("1.2.3", "svc_v1")
    registry.register("svc", wrapper)
    const resolved = registry.resolve("svc", "1.5.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.2.3")
  })
})

describe("version_registry invalid", () => {
  it("should reject incompatible major version", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const wrapper: VersionedWrapper<string> = new VersionedWrapper("2.0.0", "svc_v2")
    registry.register("svc", wrapper)
    const resolved = registry.resolve("svc", "1.0.0")
    expect(resolved).toBeNull()
  })
})

describe("version_registry null edge", () => {
  it("should return null for unknown service", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const resolved = registry.resolve("unknown", "1.0.0")
    expect(resolved).toBeNull()
  })
})

describe("version_registry list", () => {
  it("should list versions", () => {
    const registry: VersionRegistry = new VersionRegistry()
    registry.register("svc", new VersionedWrapper("1.0.0", "a"))
    registry.register("svc", new VersionedWrapper("2.0.0", "b"))
    const versions: string[] = registry.list_versions("svc")
    expect(versions).toContain("1.0.0")
    expect(versions).toContain("2.0.0")
  })
})

describe("version_registry best_match", () => {
  it("should pick highest compatible version", () => {
    const registry: VersionRegistry = new VersionRegistry()
    registry.register("svc", new VersionedWrapper("1.0.0", "a"))
    registry.register("svc", new VersionedWrapper("1.5.0", "b"))
    const resolved = registry.resolve("svc", "1.9.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.5.0")
  })
})
