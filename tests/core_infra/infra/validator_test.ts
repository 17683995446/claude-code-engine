import {
  validate_not_null,
  validate_string_length,
  validate_number_range,
  validate_pattern,
} from "../../../src/core_infra/infra/validator.js"
import { describe, it, expect } from "bun:test"

describe("validate_not_null normal", () => {
  it("should pass for string", () => {
    expect(() => validate_not_null("hello", "name")).not.toThrow()
  })
})

describe("validate_not_null null edge", () => {
  it("should throw for null", () => {
    expect(() => validate_not_null(null, "name")).toThrow()
  })

  it("should throw for undefined", () => {
    expect(() => validate_not_null(undefined, "name")).toThrow()
  })
})

describe("validate_string_length normal", () => {
  it("should pass for valid length", () => {
    expect(() => validate_string_length("abc", "name", 1, 5)).not.toThrow()
  })
})

describe("validate_string_length boundary", () => {
  it("should pass at exact min", () => {
    expect(() => validate_string_length("a", "name", 1, 5)).not.toThrow()
  })

  it("should pass at exact max", () => {
    expect(() => validate_string_length("abcde", "name", 1, 5)).not.toThrow()
  })
})

describe("validate_string_length invalid", () => {
  it("should throw for too short", () => {
    expect(() => validate_string_length("", "name", 1, 5)).toThrow()
  })

  it("should throw for too long", () => {
    expect(() => validate_string_length("abcdef", "name", 1, 5)).toThrow()
  })
})

describe("validate_number_range normal", () => {
  it("should pass for valid number", () => {
    expect(() => validate_number_range(5, "age", 0, 10)).not.toThrow()
  })
})

describe("validate_number_range boundary", () => {
  it("should pass at exact min", () => {
    expect(() => validate_number_range(0, "age", 0, 10)).not.toThrow()
  })

  it("should pass at exact max", () => {
    expect(() => validate_number_range(10, "age", 0, 10)).not.toThrow()
  })
})

describe("validate_number_range invalid", () => {
  it("should throw for too small", () => {
    expect(() => validate_number_range(-1, "age", 0, 10)).toThrow()
  })

  it("should throw for too large", () => {
    expect(() => validate_number_range(11, "age", 0, 10)).toThrow()
  })
})

describe("validate_pattern normal", () => {
  it("should pass for matching pattern", () => {
    expect(() => validate_pattern("abc", "name", /^[a-z]+$/)).not.toThrow()
  })
})

describe("validate_pattern invalid", () => {
  it("should throw for non matching", () => {
    expect(() => validate_pattern("123", "name", /^[a-z]+$/)).toThrow()
  })
})
