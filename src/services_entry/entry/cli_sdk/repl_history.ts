import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import { log_info, log_warn } from "../../../core_infra/infra/global_logger.ts"

/**
 * V18: REPL 历史记录持久化管理。
 *
 * 将用户在 REPL 中输入的命令和对话保存到文件，
 * 下次启动时自动加载，支持上下键浏览历史。
 */

/** 默认历史文件路径：~/.claude_code/repl_history */
export const DEFAULT_HISTORY_FILE: string = join(homedir(), ".claude_code", "repl_history")

/** 默认最大历史记录条数 */
export const DEFAULT_MAX_HISTORY: number = 1000

/**
 * V18: 历史记录管理器。
 */
export class ReplHistory {
  private readonly file_path: string
  private readonly max_entries: number
  private entries: string[] = []

  constructor(file_path: string = DEFAULT_HISTORY_FILE, max_entries: number = DEFAULT_MAX_HISTORY) {
    this.file_path = file_path
    this.max_entries = max_entries
    this.load()
  }

  /**
   * 从文件加载历史记录。
   */
  load(): void {
    try {
      if (!existsSync(this.file_path)) {
        this.entries = []
        return
      }
      const content: string = readFileSync(this.file_path, "utf-8")
      this.entries = content.split("\n").filter((line: string) => line.length > 0)
      if (this.entries.length > this.max_entries) {
        this.entries = this.entries.slice(-this.max_entries)
      }
      log_info(`repl_history_loaded: ${this.entries.length} entries`)
    } catch (e) {
      log_warn(`repl_history_load_failed: ${e}`)
      this.entries = []
    }
  }

  /**
   * 添加一条历史记录并持久化。
   */
  add(entry: string): void {
    const trimmed: string = entry.trim()
    if (trimmed.length === 0) return

    // 避免连续重复
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
      return
    }

    this.entries.push(trimmed)
    if (this.entries.length > this.max_entries) {
      this.entries = this.entries.slice(-this.max_entries)
    }
    this.append_to_file(trimmed)
  }

  /**
   * 获取所有历史记录。
   */
  get_all(): string[] {
    return [...this.entries]
  }

  /**
   * 获取最近的 N 条历史记录。
   */
  get_recent(count: number): string[] {
    if (count <= 0) return []
    return this.entries.slice(-count)
  }

  /**
   * 搜索历史记录（子串匹配）。
   */
  search(query: string): string[] {
    if (query.length === 0) return []
    const lower_query: string = query.toLowerCase()
    return this.entries.filter((entry: string) => entry.toLowerCase().includes(lower_query))
  }

  /**
   * 清空历史记录。
   */
  clear(): void {
    this.entries = []
    try {
      writeFileSync(this.file_path, "", "utf-8")
      log_info("repl_history_cleared")
    } catch (e) {
      log_warn(`repl_history_clear_failed: ${e}`)
    }
  }

  /**
   * 获取历史记录条数。
   */
  size(): number {
    return this.entries.length
  }

  /**
   * 确保历史文件所在目录存在。
   */
  private ensure_dir(): void {
    const dir: string = dirname(this.file_path)
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true })
      } catch (e) {
        log_warn(`repl_history_mkdir_failed: ${e}`)
      }
    }
  }

  /**
   * 追加一条记录到文件。
   */
  private append_to_file(entry: string): void {
    try {
      this.ensure_dir()
      appendFileSync(this.file_path, entry + "\n", "utf-8")
    } catch (e) {
      log_warn(`repl_history_append_failed: ${e}`)
    }
  }
}

/**
 * V18: REPL 命令补全器。
 *
 * 为 readline 提供Tab补全功能：
 *   - / 前缀命令补全
 *   - 文件路径补全
 */
export class ReplCompleter {
  private readonly commands: string[]

  constructor(command_names: string[]) {
    this.commands = command_names.map((c: string) => "/" + c)
  }

  /**
   * 补全函数，符合 readline.completer 签名。
   *
   * @param line 当前输入行
   * @returns [匹配列表, 当前补全子串]
   */
  complete(line: string): [string[], string] {
    // 命令补全：以 / 开头
    if (line.startsWith("/")) {
      const matches: string[] = this.commands.filter((cmd: string) => cmd.startsWith(line))
      return [matches, line]
    }

    // 文件路径补全：以 ./ 或 / 或 ~ 开头，或包含 /
    if (line.startsWith("./") || line.startsWith("/") || line.startsWith("~") || line.includes("/")) {
      return this.complete_path(line)
    }

    // 默认：无补全
    return [[], line]
  }

  /**
   * 文件路径补全。
   */
  private complete_path(line: string): [string[], string] {
    try {
      let dir_path: string
      let prefix: string

      const last_slash: number = line.lastIndexOf("/")
      if (last_slash >= 0) {
        dir_path = line.slice(0, last_slash + 1)
        prefix = line.slice(last_slash + 1)
      } else {
        dir_path = "./"
        prefix = line
      }

      // 展开 ~ 为 home 目录
      if (dir_path.startsWith("~")) {
        dir_path = join(homedir(), dir_path.slice(1))
      }

      if (!existsSync(dir_path)) {
        return [[], line]
      }

      const entries: string[] = readdirSync(dir_path)
      const matches: string[] = entries
        .filter((entry: string) => entry.startsWith(prefix))
        .map((entry: string) => {
          const full_path: string = dir_path.endsWith("/") ? dir_path + entry : dir_path + "/" + entry
          const is_dir: boolean = existsSync(full_path) && statSync(full_path).isDirectory()
          return is_dir ? entry + "/" : entry
        })

      return [matches, prefix]
    } catch {
      return [[], line]
    }
  }
}

/**
 * V18: 创建 readline 补全函数。
 *
 * 用法：
 * ```typescript
 * const completer = create_repl_completer(["help", "exit", "shell"])
 * const rl = readline.createInterface({
 *   input: process.stdin,
 *   output: process.stdout,
 *   completer: completer,
 * })
 * ```
 */
export function create_repl_completer(command_names: string[]) {
  const completer_instance: ReplCompleter = new ReplCompleter(command_names)
  return (line: string): [string[], string] => {
    return completer_instance.complete(line)
  }
}
