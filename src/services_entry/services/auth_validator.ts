import { validate_not_null } from "../../core_infra/infra/validator.js"
import { validate_string_length } from "../../core_infra/infra/validator.js"
import type { AuthToken } from "./auth_types.js"

export function validate_auth_token(token: AuthToken): void {
  validate_not_null(token, "token")
  validate_not_null(token.source, "source")
  validate_string_length(token.source, "source", 1, 64)
  validate_string_length(token.token, "token", 1, 4096)
}
