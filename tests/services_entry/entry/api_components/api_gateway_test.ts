import {
  ApiGateway,
  type ApiRequest,
} from "../../../../src/services_entry/entry/api_components/api_gateway.ts"
import { ErrorCode } from "../../../../src/core_infra/core/error_code_enum.ts"
import { describe, it, expect } from "bun:test"

describe("api_gateway normal", () => {
  it("should handle valid request", () => {
    const gateway = new ApiGateway()
    const request: ApiRequest = { action: "test", payload: {} }
    const response = gateway.handle_request(request)
    expect(response.success).toBe(true)
  })
})

describe("api_gateway boundary", () => {
  it("should handle minimal action", () => {
    const gateway = new ApiGateway()
    const request: ApiRequest = { action: "a", payload: {} }
    const response = gateway.handle_request(request)
    expect(response.success).toBe(true)
  })
})

describe("api_gateway invalid", () => {
  it("should throw for empty action", () => {
    const gateway = new ApiGateway()
    const request: ApiRequest = { action: "", payload: {} }
    expect(() => gateway.handle_request(request)).toThrow()
  })
})

describe("api_gateway null edge", () => {
  it("should throw for null request", () => {
    const gateway = new ApiGateway()
    expect(() => gateway.handle_request(null as unknown as ApiRequest)).toThrow()
  })
})
