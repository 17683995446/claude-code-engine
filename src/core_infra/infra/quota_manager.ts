import { log_info, log_warn } from "./global_logger.ts"
import type { IQuotaManager } from "../core/i_quota_manager.ts"

export class QuotaManager implements IQuotaManager {
  private usage: Map<string, number> = new Map()
  private limits: Map<string, number> = new Map()
  private readonly default_limit: number

  constructor(default_limit: number = 100) {
    log_info(`quota_manager_created: default=${default_limit}`)
    this.default_limit = default_limit
  }

  acquire(tenant: string, resource: string, cost: number): boolean {
    const key: string = this.key(tenant, resource)
    const current: number = this.usage.get(key) || 0
    const limit: number = this.limits.get(key) ?? this.default_limit
    log_info(`quota_acquire: ${key} ${current}/${limit}`)
    if (current + cost > limit) {
      log_warn(`quota_exceeded: ${key}`)
      return false
    }
    this.usage.set(key, current + cost)
    return true
  }

  release(tenant: string, resource: string, cost: number): void {
    const key: string = this.key(tenant, resource)
    const current: number = this.usage.get(key) || 0
    const next: number = Math.max(0, current - cost)
    log_info(`quota_release: ${key} ${next}`)
    this.usage.set(key, next)
  }

  get_usage(tenant: string, resource: string): number {
    const key: string = this.key(tenant, resource)
    return this.usage.get(key) || 0
  }

  set_limit(tenant: string, resource: string, limit: number): void {
    const key: string = this.key(tenant, resource)
    log_info(`quota_set_limit: ${key}=${limit}`)
    this.limits.set(key, limit)
  }

  private key(tenant: string, resource: string): string {
    return `${tenant}:${resource}`
  }
}
