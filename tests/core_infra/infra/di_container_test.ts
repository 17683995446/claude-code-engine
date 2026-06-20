import { describe, it, expect } from "bun:test"
import { DiContainer, get_global_container, reset_global_container } from "../../../src/core_infra/infra/di_container.ts"
import { TOKENS } from "../../../src/core_infra/infra/service_tokens.ts"
import { QueryEngine } from "../../../src/core_infra/core/query_engine.ts"
import { AuthService } from "../../../src/services_entry/services/auth_service.ts"
import { ApiGateway } from "../../../src/services_entry/entry/api_components/api_gateway.ts"

describe("di_container normal", () => {
  it("should register and resolve service", () => {
    const container = new DiContainer()
    container.register(TOKENS.IAuthService, AuthService)
    const auth = container.resolve(TOKENS.IAuthService)
    expect(auth).toBeInstanceOf(AuthService)
  })
})

describe("di_container singleton", () => {
  it("should return same instance", () => {
    const container = new DiContainer()
    container.register(TOKENS.IAuthService, AuthService)
    const a = container.resolve(TOKENS.IAuthService)
    const b = container.resolve(TOKENS.IAuthService)
    expect(a).toBe(b)
  })
})

describe("di_container invalid", () => {
  it("should throw for unregistered token", () => {
    const container = new DiContainer()
    expect(() => container.resolve(Symbol("unknown"))).toThrow()
  })
})

describe("di_container global", () => {
  it("should provide global container", () => {
    reset_global_container()
    const container = get_global_container()
    container.register(TOKENS.IApiGateway, ApiGateway)
    const gateway = container.resolve(TOKENS.IApiGateway)
    expect(gateway).toBeInstanceOf(ApiGateway)
  })
})

describe("di_container factory", () => {
  it("should resolve QueryEngine via factory", () => {
    const container = new DiContainer()
    container.register_factory(TOKENS.IQueryEngine, () => new QueryEngine({ cwd: "/tmp", initial_messages: [], max_turns: 10, verbose: false }))
    const engine = container.resolve(TOKENS.IQueryEngine)
    expect(engine.validate()).toBe(true)
  })
})
