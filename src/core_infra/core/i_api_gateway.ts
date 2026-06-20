import type { ErrorCode } from "./error_code_enum.ts"

/**
 * API request type.
 */
export type ApiRequest = {
  action: string
  payload: Record<string, unknown>
}

/**
 * API response type.
 */
export type ApiResponse = {
  success: boolean
  error_code: ErrorCode | null
  data: unknown
}

/**
 * API gateway interface.
 *
 * Defines the contract for request handling.
 */
export interface IApiGateway {
  /**
   * Handle an API request.
   *
   * @param request - The request to handle.
   * @returns The response.
   * @throws ValidationException if the request is invalid.
   */
  handle_request(request: ApiRequest): ApiResponse
}
