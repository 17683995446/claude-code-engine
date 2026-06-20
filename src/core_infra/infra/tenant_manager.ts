import { log_info, log_warn } from "./global_logger.ts"
import type { ITenantManager, ITenantContext, ITenantQuota } from "../core/i_tenant.ts"

interface TenantRecord {
  quota: number
  used: number
  context?: ITenantContext
}

/**
 * TenantManager - 租户管理器。
 *
 * 正确实现 ITenantManager 接口，支持 register/allow/release/usage/unregister。
 * 同时保留扩展方法 get_context/check_quota 用于富配额场景。
 */
export class TenantManager implements ITenantManager {
  private tenants: Map<string, TenantRecord> = new Map()

  register(tenant_id: string, quota: number): void {
    log_info(`tenant_register: ${tenant_id} quota=${quota}`)
    const existing: TenantRecord | undefined = this.tenants.get(tenant_id)
    if (existing) {
      existing.quota = quota
    } else {
      this.tenants.set(tenant_id, { quota, used: 0 })
    }
  }

  allow(tenant_id: string): boolean {
    log_info(`tenant_allow: ${tenant_id}`)
    const record: TenantRecord | undefined = this.tenants.get(tenant_id)
    if (!record) {
      log_warn(`tenant_not_found: ${tenant_id}`)
      return false
    }
    if (record.used >= record.quota) {
      log_warn(`tenant_quota_exceeded: ${tenant_id}`)
      return false
    }
    record.used += 1
    return true
  }

  release(tenant_id: string): void {
    log_info(`tenant_release: ${tenant_id}`)
    const record: TenantRecord | undefined = this.tenants.get(tenant_id)
    if (record && record.used > 0) {
      record.used -= 1
    }
  }

  usage(tenant_id: string): number {
    log_info(`tenant_usage: ${tenant_id}`)
    return this.tenants.get(tenant_id)?.used ?? 0
  }

  unregister(tenant_id: string): void {
    log_info(`tenant_unregister: ${tenant_id}`)
    this.tenants.delete(tenant_id)
  }

  // ---- 扩展方法（接口外，用于富配额场景）----

  /**
   * 注册带富配额的租户（扩展方法）。
   * 注意：此方法会覆盖 register 的简单配额，使用 max_messages 作为 quota。
   */
  register_with_quota(tenant_id: string, quota: ITenantQuota): void {
    log_info(`tenant_register_rich: ${tenant_id}`)
    this.tenants.set(tenant_id, {
      quota: quota.max_messages,
      used: 0,
      context: { tenant_id, quota },
    })
  }

  get_context(tenant_id: string): ITenantContext | null {
    log_info(`tenant_get_context: ${tenant_id}`)
    return this.tenants.get(tenant_id)?.context ?? null
  }

  check_quota(
    tenant_id: string,
    usage: { messages: number; requests: number; storage_mb: number },
  ): boolean {
    log_info(`tenant_check_quota: ${tenant_id}`)
    const record = this.tenants.get(tenant_id)
    if (!record || !record.context) {
      log_warn(`tenant_not_found_or_no_rich_quota: ${tenant_id}`)
      return false
    }
    const within =
      usage.messages <= record.context.quota.max_messages &&
      usage.requests <= record.context.quota.max_requests_per_minute &&
      usage.storage_mb <= record.context.quota.max_storage_mb
    if (!within) {
      log_warn(`tenant_rich_quota_exceeded: ${tenant_id}`)
    }
    return within
  }
}
