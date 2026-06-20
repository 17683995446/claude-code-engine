import { log_info, log_warn } from "./global_logger.ts"
import type { ICache } from "../core/i_cache.ts"

interface CacheEntry<T> {
  value: T
  expire_at: number
}

export class MemoryCache<T = string> implements ICache {
  private data: Map<string, CacheEntry<T>> = new Map()
  private default_ttl_ms: number

  constructor(default_ttl_ms?: number) {
    this.default_ttl_ms = default_ttl_ms ?? 0
  }

  get(key: string): string | undefined {
    log_info(`cache_get: ${key}`)
    const entry: CacheEntry<T> | undefined = this.data.get(key)
    if (!entry) {
      log_warn(`cache_miss: ${key}`)
      return undefined
    }
    if (Date.now() > entry.expire_at) {
      log_warn(`cache_expired: ${key}`)
      this.data.delete(key)
      return undefined
    }
    const val: unknown = entry.value
    if (typeof val === "string") {
      return val
    }
    return JSON.stringify(val)
  }

  set(key: string, value: T, ttl_ms?: number): void {
    log_info(`cache_set: ${key} ttl=${ttl_ms ?? this.default_ttl_ms}`)
    const effective_ttl: number = ttl_ms ?? (this.default_ttl_ms > 0 ? this.default_ttl_ms : undefined)
    const expire_at: number = effective_ttl ? Date.now() + effective_ttl : Number.MAX_SAFE_INTEGER
    this.data.set(key, { value, expire_at })
  }

  remove(key: string): void {
    log_info(`cache_remove: ${key}`)
    this.data.delete(key)
  }

  clear(): void {
    log_info("cache_clear")
    this.data.clear()
  }

  size(): number {
    log_info(`cache_size: ${this.data.size}`)
    return this.data.size
  }
}
