import { log_info, log_warn } from "./global_logger.ts"
import type { IConsistencyChecker } from "../core/i_consistency.ts"

export class MemoryConsistencyChecker implements IConsistencyChecker {
  checksum(data: string): string {
    log_info("consistency_checksum")
    let hash: number = 0
    for (let i: number = 0; i < data.length; i++) {
      const char: number = data.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return (hash >>> 0).toString(16)
  }

  verify(data: string, expected: string): boolean {
    log_info("consistency_verify")
    const actual: string = this.checksum(data)
    return actual === expected
  }

  is_corrupted(data: string, stored_checksum: string): boolean {
    log_info("consistency_check")
    const corrupted: boolean = !this.verify(data, stored_checksum)
    if (corrupted) {
      log_warn("consistency_corruption_detected")
    }
    return corrupted
  }
}
