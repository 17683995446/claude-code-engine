import { log_info, log_warn } from "./global_logger.ts"
import type { ITenantManager } from "../core/i_tenant.ts"

interface TenantRecord {
  quota: number
  used: number
}

export class MemoryTenantManager implements ITenantManager {
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
    const rec: TenantRecord | undefined = this.tenants.get(tenant_id)
    if (!rec) {
      log_warn(`tenant_unknown: ${tenant_id}`)
      return false
    }
    if (rec.used >= rec.quota) {
      log_warn(`tenant_quota_exceeded: ${tenant_id}`)
      return false
    }
    rec.used += 1
    return true
  }

  release(tenant_id: string): void {
    log_info(`tenant_release: ${tenant_id}`)
    const rec: TenantRecord | undefined = this.tenants.get(tenant_id)
    if (rec && rec.used > 0) {
      rec.used -= 1
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
}
