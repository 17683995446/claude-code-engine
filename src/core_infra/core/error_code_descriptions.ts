import { ErrorCode } from "./error_code_enum.js"

/**
 * V14: 错误码 → 人类可读描述映射表（完整覆盖全部 67 个错误码）。
 */
const ERROR_DESCRIPTION_MAP: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN_ERROR]: "An unknown error occurred.",
  [ErrorCode.INVALID_ARGUMENT]: "The provided argument is invalid.",
  [ErrorCode.MISSING_ARGUMENT]: "A required argument is missing.",
  [ErrorCode.TYPE_MISMATCH]: "The argument type does not match the expected type.",
  [ErrorCode.OUT_OF_RANGE]: "The argument value is out of the allowed range.",
  [ErrorCode.AUTH_UNAUTHORIZED]: "Authentication is required.",
  [ErrorCode.AUTH_FORBIDDEN]: "Access to this resource is forbidden.",
  [ErrorCode.AUTH_TOKEN_EXPIRED]: "The authentication token has expired.",
  [ErrorCode.AUTH_TOKEN_INVALID]: "The authentication token is invalid.",
  [ErrorCode.AUTH_API_KEY_MISSING]: "The API key is missing.",
  [ErrorCode.SHELL_COMMAND_FAILED]: "The shell command execution failed.",
  [ErrorCode.SHELL_TIMEOUT]: "The shell command timed out.",
  [ErrorCode.SHELL_NOT_FOUND]: "The specified shell was not found.",
  [ErrorCode.SHELL_PERMISSION_DENIED]: "Permission denied for shell execution.",
  [ErrorCode.API_REQUEST_FAILED]: "The API request failed.",
  [ErrorCode.API_RATE_LIMITED]: "API rate limit exceeded.",
  [ErrorCode.API_TIMEOUT]: "The API request timed out.",
  [ErrorCode.API_BAD_RESPONSE]: "The API returned an unexpected response.",
  [ErrorCode.FILE_NOT_FOUND]: "The requested file was not found.",
  [ErrorCode.FILE_READ_ERROR]: "Failed to read the file.",
  [ErrorCode.FILE_WRITE_ERROR]: "Failed to write the file.",
  [ErrorCode.FILE_PERMISSION_DENIED]: "Permission denied for file operation.",
  [ErrorCode.CONFIG_MISSING]: "A required configuration is missing.",
  [ErrorCode.CONFIG_INVALID]: "The configuration value is invalid.",
  [ErrorCode.CONFIG_ENV_MISSING]: "A required environment variable is missing.",
  [ErrorCode.MESSAGE_PARSE_ERROR]: "Failed to parse the message.",
  [ErrorCode.MESSAGE_VALIDATION_ERROR]: "The message failed validation.",
  [ErrorCode.MESSAGE_TOO_LARGE]: "The message exceeds the maximum allowed size.",
  [ErrorCode.LLM_REQUEST_FAILED]: "The LLM request failed.",
  [ErrorCode.LLM_TIMEOUT]: "The LLM request timed out.",
  [ErrorCode.LLM_RATE_LIMITED]: "The LLM API rate limit was exceeded.",
  [ErrorCode.LLM_INVALID_RESPONSE]: "The LLM returned an invalid or malformed response.",
  [ErrorCode.LLM_API_KEY_MISSING]: "The LLM API key is missing or empty.",
  [ErrorCode.LLM_STREAM_FAILED]: "The LLM streaming connection failed.",
  [ErrorCode.LLM_STREAM_CLOSED]: "The LLM streaming connection was closed unexpectedly.",
  [ErrorCode.AGENT_NOT_FOUND]: "The specified agent was not found.",
  [ErrorCode.AGENT_ALREADY_EXISTS]: "An agent with this name already exists.",
  [ErrorCode.AGENT_INVALID_ACTION]: "The agent received an invalid action.",
  [ErrorCode.AGENT_EXECUTION_FAILED]: "The agent failed to execute the action.",
  [ErrorCode.AGENT_NOT_INITIALIZED]: "The agent has not been initialized.",
  [ErrorCode.TASK_NOT_FOUND]: "The specified task was not found.",
  [ErrorCode.TASK_ALREADY_EXISTS]: "A task with this ID already exists.",
  [ErrorCode.TASK_STEP_FAILED]: "A step in the task failed to execute.",
  [ErrorCode.TASK_CIRCULAR_DEPENDENCY]: "A circular dependency was detected in the task graph.",
  [ErrorCode.TASK_AGENT_UNAVAILABLE]: "The required agent for the task is unavailable.",
  [ErrorCode.SKILL_NOT_FOUND]: "The specified skill was not found.",
  [ErrorCode.SKILL_ALREADY_EXISTS]: "A skill with this name already exists.",
  [ErrorCode.SKILL_INVALID_INPUT]: "The skill received invalid input.",
  [ErrorCode.SKILL_EXECUTION_FAILED]: "The skill failed to execute.",
  [ErrorCode.SKILL_VALIDATION_FAILED]: "The skill definition failed validation.",
  [ErrorCode.PLAN_NOT_FOUND]: "The specified plan was not found.",
  [ErrorCode.PLAN_ALREADY_EXISTS]: "A plan with this ID already exists.",
  [ErrorCode.PLAN_PHASE_FAILED]: "A phase in the plan failed to execute.",
  [ErrorCode.PLAN_VALIDATION_FAILED]: "The plan failed validation.",
  [ErrorCode.PLAN_NOT_CANCELLABLE]: "The plan cannot be cancelled in its current state.",
  [ErrorCode.DAEMON_NOT_RUNNING]: "The daemon is not running.",
  [ErrorCode.DAEMON_ALREADY_RUNNING]: "The daemon is already running.",
  [ErrorCode.DAEMON_INVALID_STATE]: "The daemon is in an invalid state for this operation.",
  [ErrorCode.DAEMON_RECOVERY_FAILED]: "The daemon failed to recover a failed plan.",
  [ErrorCode.DAEMON_RECOVERY_THRESHOLD]: "The daemon recovery failure threshold was exceeded.",
}

/**
 * V14: 错误码 → 修复建议映射表。
 *
 * 为每个错误码提供具体的、可操作的修复建议，帮助用户快速解决问题。
 */
const ERROR_SUGGESTION_MAP: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN_ERROR]: "Check the logs for more details. If the problem persists, report this issue.",
  [ErrorCode.INVALID_ARGUMENT]: "Verify the argument name, type, and format against the API documentation.",
  [ErrorCode.MISSING_ARGUMENT]: "Provide the missing required argument in your request.",
  [ErrorCode.TYPE_MISMATCH]: "Ensure the argument type matches the expected type (string, number, boolean, object, or array).",
  [ErrorCode.OUT_OF_RANGE]: "Ensure the value is within the allowed range specified in the documentation.",
  [ErrorCode.AUTH_UNAUTHORIZED]: "Provide a valid API key in the 'Authorization: Bearer <key>' header.",
  [ErrorCode.AUTH_FORBIDDEN]: "Verify your API key has the required permissions for this operation.",
  [ErrorCode.AUTH_TOKEN_EXPIRED]: "Refresh your authentication token and retry the request.",
  [ErrorCode.AUTH_TOKEN_INVALID]: "Check that your API key is correctly formatted and not corrupted.",
  [ErrorCode.AUTH_API_KEY_MISSING]: "Set the API_KEY environment variable or provide it in the Authorization header.",
  [ErrorCode.SHELL_COMMAND_FAILED]: "Check the command syntax and ensure the target program is installed.",
  [ErrorCode.SHELL_TIMEOUT]: "Increase the shell timeout or optimize the command to run faster.",
  [ErrorCode.SHELL_NOT_FOUND]: "Verify the shell executable path and ensure it is installed on the system.",
  [ErrorCode.SHELL_PERMISSION_DENIED]: "Check file permissions and ensure the user has execute rights.",
  [ErrorCode.API_REQUEST_FAILED]: "Check network connectivity and verify the API endpoint URL.",
  [ErrorCode.API_RATE_LIMITED]: "Reduce request frequency or implement exponential backoff retry logic.",
  [ErrorCode.API_TIMEOUT]: "Increase the request timeout or check if the server is responsive.",
  [ErrorCode.API_BAD_RESPONSE]: "Verify the API version compatibility and request format.",
  [ErrorCode.FILE_NOT_FOUND]: "Verify the file path exists and is accessible.",
  [ErrorCode.FILE_READ_ERROR]: "Check file permissions and ensure the file is not corrupted or locked.",
  [ErrorCode.FILE_WRITE_ERROR]: "Verify the directory is writable and there is sufficient disk space.",
  [ErrorCode.FILE_PERMISSION_DENIED]: "Adjust file permissions using 'chmod' or run with appropriate user privileges.",
  [ErrorCode.CONFIG_MISSING]: "Provide the required configuration via config file or environment variable.",
  [ErrorCode.CONFIG_INVALID]: "Check the configuration value format against the schema documentation.",
  [ErrorCode.CONFIG_ENV_MISSING]: "Set the required environment variable before starting the application.",
  [ErrorCode.MESSAGE_PARSE_ERROR]: "Verify the message format is valid JSON with the correct schema.",
  [ErrorCode.MESSAGE_VALIDATION_ERROR]: "Ensure all required message fields are present and valid.",
  [ErrorCode.MESSAGE_TOO_LARGE]: "Reduce the message size or increase the maximum allowed size in configuration.",
  [ErrorCode.LLM_REQUEST_FAILED]: "Check the LLM API endpoint, API key, and network connectivity.",
  [ErrorCode.LLM_TIMEOUT]: "Increase the LLM request timeout or use a faster model.",
  [ErrorCode.LLM_RATE_LIMITED]: "Reduce request frequency or upgrade your LLM API plan for higher rate limits.",
  [ErrorCode.LLM_INVALID_RESPONSE]: "Verify the model supports the requested format and check API compatibility.",
  [ErrorCode.LLM_API_KEY_MISSING]: "Set the OPENAI_API_KEY (or equivalent) environment variable.",
  [ErrorCode.LLM_STREAM_FAILED]: "Check network stability and retry; consider disabling streaming for reliability.",
  [ErrorCode.LLM_STREAM_CLOSED]: "The stream was closed prematurely; retry the request or use non-streaming mode.",
  [ErrorCode.AGENT_NOT_FOUND]: "Verify the agent name is correct and the agent is registered.",
  [ErrorCode.AGENT_ALREADY_EXISTS]: "Use a different agent name or remove the existing agent first.",
  [ErrorCode.AGENT_INVALID_ACTION]: "Check the action type and parameters against the agent's supported actions.",
  [ErrorCode.AGENT_EXECUTION_FAILED]: "Check agent logs for details; verify dependencies are available.",
  [ErrorCode.AGENT_NOT_INITIALIZED]: "Call agent.initialize() before performing actions.",
  [ErrorCode.TASK_NOT_FOUND]: "Verify the task ID is correct and the task has not been deleted.",
  [ErrorCode.TASK_ALREADY_EXISTS]: "Use a unique task ID or remove the existing task first.",
  [ErrorCode.TASK_STEP_FAILED]: "Check the failed step's error details and fix the underlying issue before retrying.",
  [ErrorCode.TASK_CIRCULAR_DEPENDENCY]: "Remove the circular reference in the task dependency graph.",
  [ErrorCode.TASK_AGENT_UNAVAILABLE]: "Ensure the required agent is registered and healthy before creating the task.",
  [ErrorCode.SKILL_NOT_FOUND]: "Verify the skill name is correct; use GET /api/skills to list available skills.",
  [ErrorCode.SKILL_ALREADY_EXISTS]: "Use a different skill name or delete the existing skill first.",
  [ErrorCode.SKILL_INVALID_INPUT]: "Check the skill's expected input schema and provide valid parameters.",
  [ErrorCode.SKILL_EXECUTION_FAILED]: "Check the skill execution logs and verify all dependencies are met.",
  [ErrorCode.SKILL_VALIDATION_FAILED]: "Ensure the skill definition includes all required fields (name, description, execute).",
  [ErrorCode.PLAN_NOT_FOUND]: "Verify the plan ID is correct; use GET /api/plans to list all plans.",
  [ErrorCode.PLAN_ALREADY_EXISTS]: "Use a unique plan ID or cancel the existing plan first.",
  [ErrorCode.PLAN_PHASE_FAILED]: "Check the failed phase's error details and fix the issue before resuming.",
  [ErrorCode.PLAN_VALIDATION_FAILED]: "Ensure the plan has at least one phase with valid executors.",
  [ErrorCode.PLAN_NOT_CANCELLABLE]: "The plan has completed or is already cancelled; no action needed.",
  [ErrorCode.DAEMON_NOT_RUNNING]: "Start the daemon using POST /api/daemon/start or set AUTO_START_DAEMON=true.",
  [ErrorCode.DAEMON_ALREADY_RUNNING]: "The daemon is already running; no action needed.",
  [ErrorCode.DAEMON_INVALID_STATE]: "Check the daemon status with GET /api/daemon/status before retrying.",
  [ErrorCode.DAEMON_RECOVERY_FAILED]: "Check the failed plan's details and fix the underlying issue; the daemon will retry.",
  [ErrorCode.DAEMON_RECOVERY_THRESHOLD]: "Call POST /api/daemon/reset to reset the recovery failure counter, then restart.",
}

/**
 * Get the human readable description for an error code.
 */
export function get_error_description(code: ErrorCode): string {
  const description: string | undefined = ERROR_DESCRIPTION_MAP[code]
  if (description === undefined) {
    return "An unexpected error occurred."
  }
  return description
}

/**
 * V14: Get the actionable suggestion for fixing an error code.
 */
export function get_error_suggestion(code: ErrorCode): string {
  const suggestion: string | undefined = ERROR_SUGGESTION_MAP[code]
  if (suggestion === undefined) {
    return "Check the documentation and logs for more details."
  }
  return suggestion
}

/**
 * V14: 友好错误信息接口。
 */
export interface FriendlyErrorInfo {
  /** 错误码数值 */
  code: ErrorCode
  /** 错误码名称（枚举键名） */
  name: string
  /** 人类可读的错误描述 */
  description: string
  /** 可操作的修复建议 */
  suggestion: string
}

/**
 * V14: 获取错误的完整友好信息（描述 + 修复建议）。
 */
export function get_error_info(code: ErrorCode): FriendlyErrorInfo {
  return {
    code,
    name: ErrorCode[code] ?? "UNKNOWN",
    description: get_error_description(code),
    suggestion: get_error_suggestion(code),
  }
}
