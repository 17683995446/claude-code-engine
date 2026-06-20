import { ErrorCode } from "../core/error_code_enum.js"

/**
 * Validate that a value is not null or undefined.
 *
 * @param value - The value to check.
 * @param name - The parameter name.
 * @throws Error if the value is missing.
 */
export function validate_not_null(
  value: unknown,
  name: string,
): void {
  if (value === null || value === undefined) {
    throw new Error(`${ErrorCode.MISSING_ARGUMENT}: ${name} is required`)
  }
}

/**
 * Validate that a string length is within bounds.
 *
 * @param value - The string to check.
 * @param name - The parameter name.
 * @param min - The minimum length.
 * @param max - The maximum length.
 * @throws Error if the length is out of bounds.
 */
export function validate_string_length(
  value: string,
  name: string,
  min: number,
  max: number,
): void {
  if (value.length < min || value.length > max) {
    throw new Error(
      `${ErrorCode.OUT_OF_RANGE}: ${name} length must be between ${min} and ${max}`,
    )
  }
}

/**
 * Validate that a number is within range.
 *
 * @param value - The number to check.
 * @param name - The parameter name.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @throws Error if the value is out of range.
 */
export function validate_number_range(
  value: number,
  name: string,
  min: number,
  max: number,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `${ErrorCode.OUT_OF_RANGE}: ${name} must be between ${min} and ${max}`,
    )
  }
}

/**
 * Validate that a value matches a regex pattern.
 *
 * @param value - The string to check.
 * @param name - The parameter name.
 * @param pattern - The regex pattern.
 * @throws Error if the value does not match.
 */
export function validate_pattern(
  value: string,
  name: string,
  pattern: RegExp,
): void {
  if (!pattern.test(value)) {
    throw new Error(`${ErrorCode.TYPE_MISMATCH}: ${name} format is invalid`)
  }
}
