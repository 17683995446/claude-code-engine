import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { ConfigManager } from "../../../src/services_entry/services/config_manager.ts"
import type { IConfigLoader } from "../../../src/core_infra/core/i_config.ts"
import { writeFileSync, mkdirSync, rmSync } from "fs"

// ============================================================
// V11: 配置管理器测试
// ============================================================

class MockLoader implements IConfigLoader {
  public config: Record<string, unknown> = {}
  public load_calls: number = 0

  load(file_path: string): Record<string, unknown> {
    this.load_calls += 1
    if (file_path === "fail") {
      throw new Error("load_error")
    }
    return { ...this.config }
  }
}

describe("V11 ConfigManager - constructor", () => {
  it("should create with default loader", () => {
    const mgr = new ConfigManager()
    expect(mgr.is_loaded()).toBe(false)
    expect(mgr.keys().length).toBe(0)
  })

  it("should create with custom loader", () => {
    const loader = new MockLoader()
    const mgr = new ConfigManager({ loader })
    expect(mgr.is_loaded()).toBe(false)
  })

  it("should create with file path", () => {
    const mgr = new ConfigManager({ file_path: "test.yaml" })
    expect(mgr.is_loaded()).toBe(false)
  })
})

describe("V11 ConfigManager - load_from_file", () => {
  it("should load config from file", () => {
    const loader = new MockLoader()
    loader.config = { key1: "value1", key2: 42, key3: true }
    const mgr = new ConfigManager({ loader })
    const success: boolean = mgr.load_from_file("test.yaml")
    expect(success).toBe(true)
    expect(mgr.is_loaded()).toBe(true)
    expect(mgr.get_string("key1")).toBe("value1")
    expect(mgr.get_number("key2")).toBe(42)
    expect(mgr.get_boolean("key3")).toBe(true)
  })

  it("should return false on load error", () => {
    const loader = new MockLoader()
    const mgr = new ConfigManager({ loader })
    const success: boolean = mgr.load_from_file("fail")
    expect(success).toBe(false)
    expect(mgr.is_loaded()).toBe(false)
  })

  it("should return false when no file path", () => {
    const mgr = new ConfigManager()
    const success: boolean = mgr.load_from_file()
    expect(success).toBe(false)
  })

  it("should use constructor file path by default", () => {
    const loader = new MockLoader()
    loader.config = { foo: "bar" }
    const mgr = new ConfigManager({ loader, file_path: "config.yaml" })
    const success: boolean = mgr.load_from_file()
    expect(success).toBe(true)
    expect(loader.load_calls).toBe(1)
    expect(mgr.get_string("foo")).toBe("bar")
  })
})

describe("V11 ConfigManager - get/set", () => {
  let mgr: ConfigManager

  beforeEach(() => {
    mgr = new ConfigManager()
  })

  it("should set and get value", () => {
    mgr.set("key", "value")
    expect(mgr.get<string>("key")).toBe("value")
  })

  it("should return undefined for missing key", () => {
    expect(mgr.get("missing")).toBeUndefined()
  })

  it("should get_string", () => {
    mgr.set("str", "hello")
    mgr.set("num", 42)
    expect(mgr.get_string("str")).toBe("hello")
    expect(mgr.get_string("num")).toBe("42")
    expect(mgr.get_string("missing")).toBeUndefined()
  })

  it("should get_number", () => {
    mgr.set("num", 42)
    mgr.set("str_num", "3.14")
    mgr.set("str", "abc")
    expect(mgr.get_number("num")).toBe(42)
    expect(mgr.get_number("str_num")).toBe(3.14)
    expect(mgr.get_number("str")).toBeUndefined()
    expect(mgr.get_number("missing")).toBeUndefined()
  })

  it("should get_boolean", () => {
    mgr.set("bool_true", true)
    mgr.set("bool_false", false)
    mgr.set("str_true", "true")
    mgr.set("str_1", "1")
    mgr.set("str_yes", "yes")
    mgr.set("num_1", 1)
    expect(mgr.get_boolean("bool_true")).toBe(true)
    expect(mgr.get_boolean("bool_false")).toBe(false)
    expect(mgr.get_boolean("str_true")).toBe(true)
    expect(mgr.get_boolean("str_1")).toBe(true)
    expect(mgr.get_boolean("str_yes")).toBe(true)
    expect(mgr.get_boolean("num_1")).toBe(true)
    expect(mgr.get_boolean("missing")).toBeUndefined()
  })

  it("should list keys", () => {
    mgr.set("a", 1)
    mgr.set("b", 2)
    mgr.set("c", 3)
    const keys = mgr.keys()
    expect(keys.length).toBe(3)
    expect(keys).toContain("a")
    expect(keys).toContain("b")
    expect(keys).toContain("c")
  })

  it("should get_all", () => {
    mgr.set("a", 1)
    mgr.set("b", "two")
    const all = mgr.get_all()
    expect(Object.keys(all).length).toBe(2)
    expect(all.a).toBe(1)
    expect(all.b).toBe("two")
  })
})

describe("V11 ConfigManager - on_change", () => {
  it("should notify on change", () => {
    const mgr = new ConfigManager()
    let received_value: string | null = null
    mgr.on_change<string>("key", (value) => {
      received_value = value
    })
    mgr.set("key", "new_value")
    expect(received_value).toBe("new_value")
  })

  it("should not notify other keys", () => {
    const mgr = new ConfigManager()
    let received: boolean = false
    mgr.on_change("key_a", () => {
      received = true
    })
    mgr.set("key_b", "value")
    expect(received).toBe(false)
  })
})

describe("V11 ConfigManager - reload", () => {
  it("should reload config from file", () => {
    const loader = new MockLoader()
    loader.config = { v1: "initial" }
    const mgr = new ConfigManager({ loader, file_path: "config.yaml" })
    mgr.load_from_file()
    expect(mgr.get_string("v1")).toBe("initial")

    // 模拟文件变更
    loader.config = { v1: "updated", v2: "new" }
    const success: boolean = mgr.reload()
    expect(success).toBe(true)
    expect(mgr.get_string("v1")).toBe("updated")
    expect(mgr.get_string("v2")).toBe("new")
  })

  it("should return false when no reloader configured", () => {
    const mgr = new ConfigManager()
    const success: boolean = mgr.reload()
    expect(success).toBe(false)
  })

  it("should track last_reloaded_at", () => {
    const loader = new MockLoader()
    loader.config = { key: "value" }
    const mgr = new ConfigManager({ loader, file_path: "config.yaml" })
    expect(mgr.last_reloaded_at()).toBe(0)
    mgr.reload()
    expect(mgr.last_reloaded_at()).toBeGreaterThan(0)
  })
})

describe("V11 ConfigManager - validate", () => {
  let mgr: ConfigManager

  beforeEach(() => {
    mgr = new ConfigManager()
  })

  it("should validate present", () => {
    mgr.set("key", "value")
    expect(() => mgr.validate_present("key")).not.toThrow()
  })

  it("should throw on missing present", () => {
    expect(() => mgr.validate_present("missing")).toThrow()
  })

  it("should validate string", () => {
    mgr.set("key", "value")
    expect(() => mgr.validate_string("key")).not.toThrow()
  })

  it("should throw on non-string", () => {
    mgr.set("key", 42)
    expect(() => mgr.validate_string("key")).toThrow()
  })

  it("should validate range", () => {
    mgr.set("num", 50)
    expect(() => mgr.validate_range("num", 0, 100)).not.toThrow()
  })

  it("should throw on out of range", () => {
    mgr.set("num", 150)
    expect(() => mgr.validate_range("num", 0, 100)).toThrow()
  })

  it("should throw on missing range value", () => {
    expect(() => mgr.validate_range("missing", 0, 100)).toThrow()
  })
})

describe("V11 ConfigManager - YAML file integration", () => {
  const test_dir: string = "/tmp/v11_config_test"
  const test_file: string = `${test_dir}/config.yaml`

  beforeEach(() => {
    mkdirSync(test_dir, { recursive: true })
  })

  afterEach(() => {
    try {
      rmSync(test_dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it("should load real YAML file", () => {
    writeFileSync(test_file, "name: test_app\nport: 8080\ndebug: true\n")
    const mgr = new ConfigManager({ file_path: test_file })
    const success: boolean = mgr.load_from_file()
    expect(success).toBe(true)
    expect(mgr.get_string("name")).toBe("test_app")
    expect(mgr.get_number("port")).toBe(8080)
    expect(mgr.get_boolean("debug")).toBe(true)
  })

  it("should reload after file change", () => {
    writeFileSync(test_file, "version: 1\n")
    const mgr = new ConfigManager({ file_path: test_file })
    mgr.load_from_file()
    expect(mgr.get_number("version")).toBe(1)

    writeFileSync(test_file, "version: 2\nnew_key: added\n")
    mgr.reload()
    expect(mgr.get_number("version")).toBe(2)
    expect(mgr.get_string("new_key")).toBe("added")
  })
})
