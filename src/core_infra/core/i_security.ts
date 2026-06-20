/**
 * Security interface.
 *
 * Defines the contract for input sanitization and token validation.
 */
export interface ISecurity {
  /**
   * Sanitize user input to prevent injection.
   *
   * @param input - Raw user input.
   * @returns Sanitized string.
   */
  sanitize(input: string): string

  /**
   * Validate a security token format.
   *
   * @param token - The token to validate.
   * @returns True if valid.
   */
  validate_token(token: string): boolean

  /**
   * Check if input contains dangerous patterns.
   *
   * @param input - The input to check.
   * @returns True if dangerous.
   */
  is_dangerous(input: string): boolean
}
