import { ErrorCode } from "../../../core_infra/core/error_code_enum.ts"
import {
  validate_not_null,
  validate_string_length,
} from "../../../core_infra/infra/validator.ts"
import { log_info, log_error } from "../../../core_infra/infra/global_logger.ts"
import type { IApiGateway, ApiRequest, ApiResponse } from "../../../core_infra/core/i_api_gateway.ts"

export class ApiGateway implements IApiGateway {
  handle_request(request: ApiRequest): ApiResponse {
    log_info(`api_gateway_handle_request: action=${request.action}`)
    try {
      this.validate_request(request)
    } catch (error) {
      log_error(`api_gateway_validation_failed: ${error}`)
      throw error
    }

    return {
      success: true,
      error_code: null,
      data: request.payload,
    }
  }

  private validate_request(request: ApiRequest): void {
    validate_not_null(request, "request")
    validate_not_null(request.action, "action")
    validate_string_length(request.action, "action", 1, 64)
  }
}
