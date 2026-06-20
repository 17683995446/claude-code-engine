import { log_info } from "./global_logger.ts"
import type { IVersioned } from "../core/i_versioned.ts"

function parse_major(version: string): number {
  log_info(`wrapper_parse_major: ${version}`)
  const parts: string[] = version.split(".")
  const major: number = parseInt(parts[0] || "0", 10)
  return isNaN(major) ? 0 : major
}

export class VersionedWrapper<T> implements IVersioned {
  readonly version: string
  private readonly target: T

  constructor(version: string, target: T) {
    log_info(`versioned_wrapper_created: ${version}`)
    this.version = version
    this.target = target
  }

  supports(api_version: string): boolean {
    log_info(`versioned_wrapper_supports: ${this.version} vs ${api_version}`)
    return parse_major(this.version) === parse_major(api_version)
  }

  unwrap(): T {
    log_info(`versioned_wrapper_unwrap: ${this.version}`)
    return this.target
  }
}
