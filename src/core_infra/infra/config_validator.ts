import { ErrorCode } from "../core/error_code_enum.js"
import { log_info } from "./global_logger.js"
import type { IConfigValidator } from "../core/i_config.js"

export class ConfigValidator implements IConfigValidator {
  validate_present(value: unknown, key: string): void {
    log_info(`config_validator_present: ${key}`)
    if (value === null || value === undefined) {
      throw new Error(`${ErrorCode.CONFIG_MISSING}: ${key} is missing`)
    }
  }

  validate_string(value: unknown, key: string): void {
    log_info(`config_validator_string: ${key}`)
    if (typeof value !== "string") {
      throw new Error(`${ErrorCode.CONFIG_INVALID}: ${key} must be a string`)
    }
  }

  validate_range(value: number, key: string, min: number, max: number): void {
    log_info(`config_validator_range: ${key}=${value}`)
    if (value < min || value > max) {
      throw new Error(
        `${ErrorCode.OUT_OF_RANGE}: ${key} must be between ${min} and ${max}`,
      )
    }
  }
}

export function validate_config_present(
  value: unknown,
  key: string,
): void {
  log_info(`validate_config_present_compat: ${key}`)
  const validator = new ConfigValidator()
  validator.validate_present(value, key)
}

export function validate_config_string(
  value: unknown,
  key: string,
): void {
  log_info(`validate_config_string_compat: ${key}`)
  const validator = new ConfigValidator()
  validator.validate_string(value, key)
}

export function validate_config_range(
  value: number,
  key: string,
  min: number,
  max: number,
): void {
  log_info(`validate_config_range_compat: ${key}`)
  const validator = new ConfigValidator()
  validator.validate_range(value, key, min, max)
}
