import { describe, it, expect } from "bun:test"
import { VersionRegistry } from "../../src/core_infra/infra/version_registry.ts"
import { VersionedWrapper } from "../../src/core_infra/infra/versioned_wrapper.ts"
import { QueryEngine } from "../../src/core_infra/core/query_engine.ts"
import { AuthService } from "../../src/services_entry/services/auth_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"

describe("version_compatibility services", () => {
  it("should wrap and resolve QueryEngine", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const engine: QueryEngine = new QueryEngine({ cwd: "/tmp", max_turns: 10, initial_messages: [] })
    const wrapper: VersionedWrapper<QueryEngine> = new VersionedWrapper("1.0.0", engine)
    registry.register("query_engine", wrapper)
    const resolved = registry.resolve("query_engine", "1.0.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.0.0")
    expect((resolved as VersionedWrapper<QueryEngine>).unwrap().validate()).toBe(true)
  })

  it("should wrap and resolve AuthService", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const auth: AuthService = new AuthService("test")
    const wrapper: VersionedWrapper<AuthService> = new VersionedWrapper("2.0.0", auth)
    registry.register("auth", wrapper)
    const resolved = registry.resolve("auth", "2.1.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("2.0.0")
  })

  it("should wrap and resolve ShellService", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const shell: ShellService = new ShellService(5000)
    const wrapper: VersionedWrapper<ShellService> = new VersionedWrapper("1.3.0", shell)
    registry.register("shell", wrapper)
    const resolved = registry.resolve("shell", "1.5.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.3.0")
  })

  it("should wrap and resolve MessageService", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const msg: MessageService = new MessageService()
    const wrapper: VersionedWrapper<MessageService> = new VersionedWrapper("3.0.0", msg)
    registry.register("message", wrapper)
    const resolved = registry.resolve("message", "3.2.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("3.0.0")
  })

  it("should wrap and resolve ApiGateway", () => {
    const registry: VersionRegistry = new VersionRegistry()
    const gateway: ApiGateway = new ApiGateway()
    const wrapper: VersionedWrapper<ApiGateway> = new VersionedWrapper("1.0.0", gateway)
    registry.register("gateway", wrapper)
    const resolved = registry.resolve("gateway", "1.0.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.0.0")
  })
})

describe("version_compatibility downgrade", () => {
  it("should downgrade to lower compatible version", () => {
    const registry: VersionRegistry = new VersionRegistry()
    registry.register("svc", new VersionedWrapper("1.0.0", "a"))
    registry.register("svc", new VersionedWrapper("1.2.0", "b"))
    const resolved = registry.resolve("svc", "1.1.0")
    expect(resolved).not.toBeNull()
    expect(resolved!.version).toBe("1.2.0")
  })
})

describe("version_compatibility rejection", () => {
  it("should reject major version mismatch", () => {
    const registry: VersionRegistry = new VersionRegistry()
    registry.register("svc", new VersionedWrapper("2.0.0", "a"))
    const resolved = registry.resolve("svc", "1.0.0")
    expect(resolved).toBeNull()
  })
})
