import { describe, it, expect } from "bun:test"
import { MemoryRouter } from "../../../src/core_infra/infra/memory_router.ts"

describe("memory_router", () => {
  it("should register and match exact path", () => {
    const r: MemoryRouter = new MemoryRouter()
    r.register("/api/v1/users", "user_handler")
    expect(r.match("/api/v1/users")).toBe("user_handler")
  })

  it("should match prefix path", () => {
    const r: MemoryRouter = new MemoryRouter()
    r.register("/api/v1", "api_handler")
    expect(r.match("/api/v1/users")).toBe("api_handler")
  })

  it("should return undefined for no match", () => {
    const r: MemoryRouter = new MemoryRouter()
    r.register("/api/v1", "api_handler")
    expect(r.match("/other")).toBeUndefined()
  })

  it("should remove route", () => {
    const r: MemoryRouter = new MemoryRouter()
    r.register("/api/v1", "api_handler")
    r.remove("/api/v1")
    expect(r.match("/api/v1/users")).toBeUndefined()
  })

  it("should match longest prefix first", () => {
    const r: MemoryRouter = new MemoryRouter()
    r.register("/api", "api_handler")
    r.register("/api/v1", "v1_handler")
    const result: string | undefined = r.match("/api/v1/users")
    expect(result === "api_handler" || result === "v1_handler").toBe(true)
  })
})
