import { log_info, log_warn } from "./global_logger.js"
import type { ISanitizer } from "../core/i_sanitizer.js"

export class InputSanitizer implements ISanitizer {
  sanitize(input: string): string {
    log_info("input_sanitizer_sanitize")
    return input
      .replace(/[<>]/g, "")
      .replace(/['"]/g, "")
      .trim()
  }

  is_safe(input: string): boolean {
    log_info("input_sanitizer_is_safe")
    const dangerous = /[<>'"]|javascript:|data:|on\w+=/i
    const safe = !dangerous.test(input)
    if (!safe) {
      log_warn(`input_sanitizer_unsafe: ${input}`)
    }
    return safe
  }
}
