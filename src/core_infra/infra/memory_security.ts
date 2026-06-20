import { log_info, log_warn } from "./global_logger.ts"
import type { ISecurity } from "../core/i_security.ts"

export class MemorySecurity implements ISecurity {
  sanitize(input: string): string {
    log_info("security_sanitize")
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
  }

  validate_token(token: string): boolean {
    log_info("security_validate_token")
    if (!token || token.length < 8) {
      log_warn("security_token_too_short")
      return false
    }
    const has_upper: boolean = /[A-Z]/.test(token)
    const has_lower: boolean = /[a-z]/.test(token)
    const has_digit: boolean = /[0-9]/.test(token)
    return has_upper && has_lower && has_digit
  }

  is_dangerous(input: string): boolean {
    log_info("security_is_dangerous")
    const dangerous: string[] = ["<script", "javascript:", "onerror=", "eval(", "document.cookie"]
    const lower: string = input.toLowerCase()
    for (const pattern of dangerous) {
      if (lower.includes(pattern)) {
        log_warn(`security_dangerous_pattern: ${pattern}`)
        return true
      }
    }
    return false
  }
}
