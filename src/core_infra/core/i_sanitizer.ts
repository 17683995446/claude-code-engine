/**
 * Input sanitizer interface.
 */
export interface ISanitizer {
  /**
   * Sanitize a string input.
   *
   * @param input - The raw input.
   * @returns The sanitized string.
   */
  sanitize(input: string): string

  /**
   * Validate if input is safe.
   *
   * @param input - The input to check.
   * @returns True if safe.
   */
  is_safe(input: string): boolean
}

/**
 * Authentication middleware interface.
 */
export interface IAuthMiddleware {
  /**
   * Check if the request is authorized.
   *
   * @param token - The auth token.
   * @returns True if authorized.
   */
  check(token: string | null): boolean
}
