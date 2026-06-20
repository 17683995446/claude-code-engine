import type { AuthStatus, AuthToken } from "../../services_entry/services/auth_types.ts"

/**
 * Authentication service interface.
 *
 * Defines the contract for token management and authentication status.
 */
export interface IAuthService {
  /**
   * Validate the internal state.
   *
   * @returns True if a valid token is present.
   */
  validate(): boolean

  /**
   * Set the authentication token.
   *
   * @param token - The token to set.
   * @throws ValidationException if the token is invalid.
   */
  set_token(token: AuthToken): void

  /**
   * Get the current authentication status.
   *
   * @returns The authentication status.
   */
  get_status(): AuthStatus

  /**
   * Check if the current token is expired.
   *
   * @returns True if expired or no token.
   */
  is_token_expired(): boolean

  /**
   * Convert the service state to a plain object.
   *
   * @returns The plain object representation.
   */
  to_object(): Record<string, unknown>
}
