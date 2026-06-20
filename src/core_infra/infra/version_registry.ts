import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IVersionRegistry } from "../core/i_version_registry.ts"
import type { IVersioned } from "../core/i_versioned.ts"

function parse_major(version: string): number {
  log_info(`version_parse_major: ${version}`)
  const parts: string[] = version.split(".")
  const major: number = parseInt(parts[0] || "0", 10)
  return isNaN(major) ? 0 : major
}

function version_tuple(version: string): [number, number, number] {
  log_info(`version_tuple: ${version}`)
  const parts: string[] = version.split(".")
  const major: number = parseInt(parts[0] || "0", 10)
  const minor: number = parseInt(parts[1] || "0", 10)
  const patch: number = parseInt(parts[2] || "0", 10)
  return [isNaN(major) ? 0 : major, isNaN(minor) ? 0 : minor, isNaN(patch) ? 0 : patch]
}

function is_compatible(service_version: string, api_version: string): boolean {
  log_info(`version_compat_check: svc=${service_version} api=${api_version}`)
  const svc_major: number = parse_major(service_version)
  const api_major: number = parse_major(api_version)
  return svc_major === api_major
}

function is_greater_or_equal(a: string, b: string): boolean {
  log_info(`version_gte: ${a} >= ${b}`)
  const ta: [number, number, number] = version_tuple(a)
  const tb: [number, number, number] = version_tuple(b)
  for (let i: number = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] > tb[i]
  }
  return true
}

export class VersionRegistry implements IVersionRegistry {
  private services: Map<string, IVersioned[]> = new Map()

  register(name: string, service: IVersioned): void {
    log_info(`version_registry_register: ${name}@${service.version}`)
    const list: IVersioned[] = this.services.get(name) || []
    list.push(service)
    this.services.set(name, list)
  }

  resolve(name: string, api_version: string): IVersioned | null {
    log_info(`version_registry_resolve: ${name}@${api_version}`)
    const list: IVersioned[] | undefined = this.services.get(name)
    if (!list || list.length === 0) {
      log_warn(`version_registry_not_found: ${name}`)
      return null
    }
    const matches: IVersioned[] = list.filter((s: IVersioned) =>
      is_compatible(s.version, api_version)
    )
    if (matches.length === 0) {
      log_warn(`version_registry_no_compat: ${name}@${api_version}`)
      return null
    }
    const best: IVersioned = matches.reduce((a: IVersioned, b: IVersioned) =>
      is_greater_or_equal(a.version, b.version) ? a : b
    )
    log_info(`version_registry_resolved: ${name}@${best.version}`)
    return best
  }

  list_versions(name: string): string[] {
    log_info(`version_registry_list: ${name}`)
    const list: IVersioned[] | undefined = this.services.get(name)
    if (!list) {
      log_warn(`version_registry_empty: ${name}`)
      return []
    }
    return list.map((s: IVersioned) => s.version)
  }

  clear(name: string): void {
    log_info(`version_registry_clear: ${name}`)
    this.services.delete(name)
  }
}
