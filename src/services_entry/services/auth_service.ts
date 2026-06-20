import { AbcBase } from "../../core_infra/core/abc_base.js"
import type { AuthStatus, AuthToken } from "./auth_types.js"
import { validate_auth_token } from "./auth_validator.js"
import { log_info, log_warn } from "../../core_infra/infra/global_logger.js"
import type { IAuthService } from "../../core_infra/core/i_auth_service.js"

export class AuthService extends AbcBase implements IAuthService {
  private token: AuthToken | null

  constructor() {
    super()
    this.token = null
    log_info("auth_service_created")
  }

  validate(): boolean {
    const has_token: boolean = this.token !== null && this.token.token.length > 0
    const not_expired: boolean = !this.is_token_expired()
    const is_valid: boolean = has_token && not_expired
    log_info(`auth_service_validate: ${is_valid}`)
    return is_valid
  }

  to_object(): Record<string, unknown> {
    return { has_token: this.token !== null }
  }

  set_token(token: AuthToken): void {
    log_info(`auth_service_set_token: source=${token.source}`)
    validate_auth_token(token)
    this.token = token
  }

  get_status(): AuthStatus {
    if (this.token === null) {
      log_info("auth_service_get_status: unauthenticated")
      return { is_authenticated: false, source: "none" }
    }
    if (this.is_token_expired()) {
      log_info(`auth_service_get_status: expired source=${this.token.source}`)
      return { is_authenticated: false, source: this.token.source }
    }
    log_info(`auth_service_get_status: source=${this.token.source}`)
    return { is_authenticated: true, source: this.token.source }
  }

  is_token_expired(): boolean {
    if (this.token === null) {
      log_info("auth_service_is_token_expired: no token")
      return true
    }
    if (!Number.isFinite(this.token.expires_at)) {
      log_warn(`auth_service_is_token_expired: invalid expires_at`)
      return true
    }
    const expired: boolean = Date.now() > this.token.expires_at
    log_info(`auth_service_is_token_expired: ${expired}`)
    return expired
  }
}
