import type { AuthStatus, AuthToken } from "../../services_entry/services/auth_types.ts"
import type { ShellCommand, ShellResult } from "../../services_entry/services/shell_types.ts"
import type { Message } from "./message_types.ts"
import type { ApiRequest, ApiResponse } from "./i_api_gateway.ts"

/**
 * 异步业务服务接口集合。
 *
 * 与同步接口（i_auth_service / i_message_service / i_shell_service / i_api_gateway）对应。
 * 新代码应优先使用异步接口，以便接入持久化、网络 I/O 和弹性组件。
 */

/**
 * 异步认证服务接口。
 */
export interface IAsyncAuthService {
  validate(): Promise<boolean>
  set_token(token: AuthToken): Promise<void>
  get_status(): Promise<AuthStatus>
  is_token_expired(): Promise<boolean>
  to_object(): Promise<Record<string, unknown>>
}

/**
 * 异步消息服务接口。
 */
export interface IAsyncMessageService {
  validate(): Promise<boolean>
  add(content: string, role: "user" | "assistant" | "system"): Promise<Message>
  normalize_all(): Promise<Message[]>
  get_all(): Promise<Message[]>
  clear(): Promise<void>
  to_object(): Promise<Record<string, unknown>>
}

/**
 * 异步 Shell 服务接口。
 */
export interface IAsyncShellService {
  validate(): Promise<boolean>
  run(cmd: ShellCommand): Promise<ShellResult>
  get_history(): Promise<ShellCommand[]>
  to_object(): Promise<Record<string, unknown>>
}

/**
 * 异步 API 网关接口。
 *
 * 将请求路由到对应的异步业务服务。
 */
export interface IAsyncApiGateway {
  handle_request(request: ApiRequest): Promise<ApiResponse>
}
