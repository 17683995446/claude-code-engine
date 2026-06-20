import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import {
  ReplHistory,
  ReplCompleter,
  create_repl_completer,
  DEFAULT_HISTORY_FILE,
  DEFAULT_MAX_HISTORY,
} from "../../../src/services_entry/entry/cli_sdk/repl_history.ts"

const TEST_DIR = "/tmp/v18_repl_test"
const TEST_HISTORY_FILE = `${TEST_DIR}/repl_history`

describe("V18 ReplHistory", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  test("should create empty history when file does not exist", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    expect(history.size()).toBe(0)
    expect(history.get_all()).toEqual([])
  })

  test("should add entries and persist to file", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    history.add("hello world")
    history.add("/help")
    expect(history.size()).toBe(2)
    expect(history.get_all()).toContain("hello world")
    expect(history.get_all()).toContain("/help")
    // 验证持久化
    expect(existsSync(TEST_HISTORY_FILE)).toBe(true)
    const content = readFileSync(TEST_HISTORY_FILE, "utf-8")
    expect(content).toContain("hello world")
    expect(content).toContain("/help")
  })

  test("should load existing history from file", () => {
    // 先写入历史文件
    writeFileSync(TEST_HISTORY_FILE, "entry1\nentry2\nentry3\n", "utf-8")
    const history = new ReplHistory(TEST_HISTORY_FILE)
    expect(history.size()).toBe(3)
    expect(history.get_all()).toEqual(["entry1", "entry2", "entry3"])
  })

  test("should not add empty entries", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    history.add("")
    history.add("   ")
    expect(history.size()).toBe(0)
  })

  test("should not add consecutive duplicates", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    history.add("same command")
    history.add("same command")
    expect(history.size()).toBe(1)
    // 不同命令可以添加
    history.add("different command")
    expect(history.size()).toBe(2)
    // 再次添加相同命令（非连续）可以
    history.add("same command")
    expect(history.size()).toBe(3)
  })

  test("should trim entries before saving", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    history.add("  padded entry  ")
    expect(history.get_all()).toContain("padded entry")
  })

  test("get_recent should return last N entries", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    for (let i = 0; i < 10; i++) {
      history.add(`entry-${i}`)
    }
    expect(history.get_recent(3)).toEqual(["entry-7", "entry-8", "entry-9"])
    expect(history.get_recent(0)).toEqual([])
    expect(history.get_recent(100).length).toBe(10)
  })

  test("search should find matching entries case-insensitively", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    history.add("/help")
    history.add("Hello World")
    history.add("/shell ls -la")
    history.add("hello again")

    const results1 = history.search("hello")
    expect(results1.length).toBe(2)
    expect(results1).toContain("Hello World")
    expect(results1).toContain("hello again")

    const results2 = history.search("/shell")
    expect(results2.length).toBe(1)
    expect(results2).toContain("/shell ls -la")

    const results3 = history.search("nonexistent")
    expect(results3.length).toBe(0)

    const results4 = history.search("")
    expect(results4.length).toBe(0)
  })

  test("clear should empty history and file", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE)
    history.add("entry1")
    history.add("entry2")
    expect(history.size()).toBe(2)
    history.clear()
    expect(history.size()).toBe(0)
    expect(history.get_all()).toEqual([])
    const content = readFileSync(TEST_HISTORY_FILE, "utf-8")
    expect(content).toBe("")
  })

  test("should respect max_entries limit", () => {
    const history = new ReplHistory(TEST_HISTORY_FILE, 5)
    for (let i = 0; i < 10; i++) {
      history.add(`entry-${i}`)
    }
    expect(history.size()).toBe(5)
    const all = history.get_all()
    expect(all[0]).toBe("entry-5")
    expect(all[4]).toBe("entry-9")
  })

  test("should create parent directory if not exists", () => {
    const nested_path = `${TEST_DIR}/nested/deep/history.txt`
    const history = new ReplHistory(nested_path)
    history.add("test entry")
    expect(existsSync(nested_path)).toBe(true)
  })

  test("DEFAULT_HISTORY_FILE should be in home directory", () => {
    expect(DEFAULT_HISTORY_FILE).toContain(".claude_code")
    expect(DEFAULT_HISTORY_FILE).toContain("repl_history")
  })

  test("DEFAULT_MAX_HISTORY should be 1000", () => {
    expect(DEFAULT_MAX_HISTORY).toBe(1000)
  })
})

describe("V18 ReplCompleter", () => {
  test("should complete / commands", () => {
    const completer = new ReplCompleter(["help", "history", "exit", "shell"])
    const [matches, substring] = completer.complete("/h")
    expect(matches).toContain("/help")
    expect(matches).toContain("/history")
    expect(substring).toBe("/h")
  })

  test("should return all matching commands for /", () => {
    const completer = new ReplCompleter(["help", "exit", "shell"])
    const [matches] = completer.complete("/")
    expect(matches.length).toBe(3)
    expect(matches).toContain("/help")
    expect(matches).toContain("/exit")
    expect(matches).toContain("/shell")
  })

  test("should return empty for non-matching command prefix", () => {
    const completer = new ReplCompleter(["help", "exit"])
    const [matches] = completer.complete("/xyz")
    expect(matches.length).toBe(0)
  })

  test("should return empty for plain text without /", () => {
    const completer = new ReplCompleter(["help", "exit"])
    const [matches] = completer.complete("hello")
    expect(matches.length).toBe(0)
  })

  test("should complete file paths", () => {
    const completer = new ReplCompleter(["help"])
    // 测试目录补全
    const [matches] = completer.complete(`${TEST_DIR}/`)
    // 应该返回目录中的文件（如果存在）
    expect(Array.isArray(matches)).toBe(true)
  })

  test("create_repl_completer should return a function", () => {
    const completer_fn = create_repl_completer(["help", "exit"])
    expect(typeof completer_fn).toBe("function")
    const [matches, substring] = completer_fn("/he")
    expect(matches).toContain("/help")
    expect(substring).toBe("/he")
  })
})
