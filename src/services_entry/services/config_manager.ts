import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import { ConfigLoader } from "../../core_infra/infra/config_loader.ts"
import { ConfigCenter } from "../../core_infra/infra/config_center.ts"
import { ConfigReloader } from "../../core_infra/infra/config_reloader.ts"
import { ConfigValidator } from "../../core_infra/infra/config_validator.ts"
import type { IConfigLoader } from "../../core_infra/core/i_config.ts"

/**
 * ConfigManager - 配置管理器（V11）。
 *
 * 串联 ConfigLoader + ConfigCenter + ConfigReloader + ConfigValidator，
 * 提供统一的配置管理入口。
 *
 * 功能：
 *   - load_from_file：从 YAML 文件加载配置到 ConfigCenter
 *   - reload：热重载配置文件
 *   - get/set：运行时配置读写
 *   - watch：配置变更监听
 *   - get_all：获取所有配置快照
 *   - validate：验证配置项
 *
 * 设计原则：
 *   - 单一入口：所有配置操作通过 ConfigManager
 *   - 热重载：支持运行时重新加载配置文件
 *   - 可观测：记录配置变更日志
 *   - 容错：加载失败不崩溃，返回 false
 *   - 解耦：ConfigManager 依赖抽象（IConfigLoader），可替换加载器
 */
export class ConfigManager {
  private readonly loader: IConfigLoader
  private readonly center: ConfigCenter
  private readonly reloader: ConfigReloader | null
  private readonly validator: ConfigValidator
  private readonly file_path: string | null
  private loaded: boolean = false

  constructor(
    options: {
      loader?: IConfigLoader
      file_path?: string
    } = {},
  ) {
    this.loader = options.loader ?? new ConfigLoader()
    this.center = new ConfigCenter()
    this.validator = new ConfigValidator()
    this.file_path = options.file_path ?? null
    this.reloader = this.file_path ? new ConfigReloader(this.loader, this.file_path) : null
    log_info(`config_manager_created: file=${this.file_path ?? "none"}`)
  }

  /**
   * 从文件加载配置到 ConfigCenter。
   *
   * @param file_path 配置文件路径（可选，默认使用构造时的路径）
   * @returns 加载成功返回 true
   */
  load_from_file(file_path?: string): boolean {
    const path: string = file_path ?? this.file_path ?? ""
    if (path.length === 0) {
      log_warn("config_manager_no_file_path")
      return false
    }
    try {
      const config: Record<string, unknown> = this.loader.load(path)
      for (const [key, value] of Object.entries(config)) {
        this.center.set(key, value)
      }
      this.loaded = true
      log_info(`config_manager_loaded: ${Object.keys(config).length} keys from ${path}`)
      return true
    } catch (e) {
      log_error(`config_manager_load_failed: ${e}`)
      return false
    }
  }

  /**
   * 热重载配置文件。
   *
   * @returns 重载成功返回 true
   */
  reload(): boolean {
    if (!this.reloader) {
      log_warn("config_manager_no_reloader")
      return false
    }
    const success: boolean = this.reloader.reload()
    if (success) {
      const config: Record<string, unknown> = this.reloader.get_config()
      for (const [key, value] of Object.entries(config)) {
        this.center.set(key, value)
      }
      log_info("config_manager_reloaded")
    }
    return success
  }

  /**
   * 获取配置值。
   */
  get<T>(key: string): T | undefined {
    return this.center.get<T>(key)
  }

  /**
   * 获取配置值（字符串形式）。
   */
  get_string(key: string): string | undefined {
    const value: unknown = this.center.get<unknown>(key)
    if (value === undefined) {
      return undefined
    }
    return String(value)
  }

  /**
   * 获取配置值（数字形式）。
   */
  get_number(key: string): number | undefined {
    const value: unknown = this.center.get<unknown>(key)
    if (value === undefined) {
      return undefined
    }
    const num: number = Number(value)
    return Number.isFinite(num) ? num : undefined
  }

  /**
   * 获取配置值（布尔形式）。
   */
  get_boolean(key: string): boolean | undefined {
    const value: unknown = this.center.get<unknown>(key)
    if (value === undefined) {
      return undefined
    }
    if (typeof value === "boolean") {
      return value
    }
    if (typeof value === "string") {
      return value === "true" || value === "1" || value === "yes"
    }
    return Boolean(value)
  }

  /**
   * 设置配置值。
   */
  set<T>(key: string, value: T): void {
    this.center.set(key, value)
  }

  /**
   * 监听配置变更。
   */
  on_change<T>(key: string, handler: (value: T) => void): void {
    this.center.on_change<T>(key, handler)
  }

  /**
   * 获取所有配置键。
   */
  keys(): string[] {
    return this.center.keys()
  }

  /**
   * 获取所有配置快照。
   */
  get_all(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of this.center.keys()) {
      result[key] = this.center.get<unknown>(key)
    }
    return result
  }

  /**
   * 验证配置项是否存在。
   */
  validate_present(key: string): void {
    const value: unknown = this.center.get<unknown>(key)
    this.validator.validate_present(value, key)
  }

  /**
   * 验证配置项是否为字符串。
   */
  validate_string(key: string): void {
    const value: unknown = this.center.get<unknown>(key)
    this.validator.validate_string(value, key)
  }

  /**
   * 验证配置项是否在范围内。
   */
  validate_range(key: string, min: number, max: number): void {
    const value: number | undefined = this.get_number(key)
    if (value === undefined) {
      throw new Error(`config_missing: ${key}`)
    }
    this.validator.validate_range(value, key, min, max)
  }

  /**
   * 是否已加载配置。
   */
  is_loaded(): boolean {
    return this.loaded
  }

  /**
   * 获取上次重载时间。
   */
  last_reloaded_at(): number {
    return this.reloader ? this.reloader.last_reloaded_at() : 0
  }

  /**
   * 获取配置中心实例（用于直接操作）。
   */
  get_center(): ConfigCenter {
    return this.center
  }
}
