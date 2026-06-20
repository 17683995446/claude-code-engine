/**
 * Claude Code Engine - SDK Entry Point
 *
 * Usage:
 *   import { ClaudeCodeEngine } from "./index"
 *   const engine = new ClaudeCodeEngine({ cwd: "/project", max_turns: 50 })
 *   await engine.start()
 */

import { log_info, log_error, log_debug, log_warn, set_global_level, get_global_level, configure_global_logger, set_global_silent, is_global_silent } from "./core_infra/infra/global_logger.ts"
import { LogLevel } from "./core_infra/infra/log_level_enum.ts"
import { LoggerService } from "./core_infra/infra/logger_service.ts"
import { StructuredLogger } from "./core_infra/infra/structured_logger.ts"
import { parse_log_level, log_level_to_string, is_valid_log_level, LOG_LEVEL_NAMES } from "./core_infra/infra/log_level_helpers.ts"
import type { StructuredLogEntry } from "./core_infra/infra/structured_logger.ts"
import type { ILogger } from "./core_infra/core/i_logger.ts"
import { DiContainer } from "./core_infra/infra/di_container.ts"
import { TOKENS } from "./core_infra/infra/service_tokens.ts"
import { QueryEngine } from "./core_infra/core/query_engine.ts"
import { AuthService } from "./services_entry/services/auth_service.ts"
import { ShellService } from "./services_entry/services/shell_service.ts"
import { MessageService } from "./services_entry/services/message_service.ts"
import {
  AsyncAuthService,
  AsyncMessageService,
  AsyncShellService,
  AsyncApiGateway,
} from "./services_entry/services/async_services.ts"
import { MockLlmAdapter, OpenAiLlmAdapter, create_openai_adapter_from_env } from "./services_entry/services/llm_adapters.ts"
import { ConversationEngine } from "./services_entry/services/conversation_engine.ts"
import { SessionManager } from "./services_entry/services/session_manager.ts"
import { AgentRegistry } from "./services_entry/services/agent_registry.ts"
import { ShellAgent, ChatAgent } from "./services_entry/services/agents.ts"
import { TaskOrchestrator } from "./services_entry/services/task_orchestrator.ts"
import { SkillRegistry } from "./services_entry/services/skill_registry.ts"
import { ShellExecuteSkill, ChatCompleteSkill, EchoSkill } from "./services_entry/services/skills.ts"
import { Planner } from "./services_entry/services/planner.ts"
import { Daemon } from "./services_entry/services/daemon.ts"
import { ConfigManager } from "./services_entry/services/config_manager.ts"
import { parse_args, print_help, print_version, resolve_port, resolve_log_level, has_flag, get_option, get_number_option, CLI_VERSION } from "./services_entry/entry/cli_sdk/cli_args.ts"
import { InteractiveRepl } from "./services_entry/entry/cli_sdk/repl.ts"
import { ReplHistory, ReplCompleter, create_repl_completer, DEFAULT_HISTORY_FILE, DEFAULT_MAX_HISTORY } from "./services_entry/entry/cli_sdk/repl_history.ts"
import { InteractiveConfigWizard, generate_config_non_interactive, show_config, list_config_fields } from "./services_entry/entry/cli_sdk/config_wizard_cli.ts"
import { generate_template, list_templates, TEMPLATE_DESCRIPTIONS } from "./services_entry/entry/cli_sdk/template_generator.ts"
import type { TemplateType, TemplateOptions, TemplateResult } from "./services_entry/entry/cli_sdk/template_generator.ts"
import { run_diagnostics, format_diagnostic_report, check_port_available } from "./services_entry/entry/cli_sdk/diagnostics.ts"
import type { DiagnosticReport, DiagnosticCheck, DiagnosticLevel } from "./services_entry/entry/cli_sdk/diagnostics.ts"
import {
  is_first_run,
  should_show_guide,
  check_and_get_prompt,
  load_first_run_state,
  save_first_run_state,
  mark_first_run,
  mark_step_complete,
  reset_first_run_state,
  get_next_guide_step,
  get_guide_progress,
  generate_welcome_banner,
  generate_first_run_prompt,
  generate_quick_tips,
  FIRST_RUN_FILE,
  GUIDE_STEPS,
  get_default_first_run_state,
} from "./services_entry/entry/cli_sdk/first_run.ts"
import type { FirstRunState, GuideStep } from "./services_entry/entry/cli_sdk/first_run.ts"
import type { CliArgs } from "./services_entry/entry/cli_sdk/cli_args.ts"
import type { ReplCommand, ReplCommandHandler } from "./services_entry/entry/cli_sdk/repl.ts"
import type { Session, SessionConfig, SessionListItem, SessionPersistData } from "./services_entry/services/session_types.ts"
import { ApiGateway } from "./services_entry/entry/api_components/api_gateway.ts"
import { setup_api_routes, setup_gateway_route, setup_chat_routes, setup_session_routes, setup_stream_routes, setup_agent_routes, setup_task_routes, setup_skill_routes, setup_plan_routes, setup_daemon_routes, setup_health_routes, setup_config_routes, register_routes } from "./services_entry/entry/api_components/api_routes.ts"
import { setup_docs_routes } from "./services_entry/entry/api_components/api_docs_routes.ts"
import { setup_debug_console_routes, generate_debug_console_html } from "./services_entry/entry/api_components/api_debug_console.ts"
import { setup_dashboard_routes, generate_dashboard_html, DASHBOARD_DATA_SOURCES } from "./services_entry/entry/api_components/status_dashboard.ts"
import { generate_openapi_spec, get_endpoint_list, generate_html_docs, API_ENDPOINTS } from "./services_entry/entry/api_components/openapi_spec.ts"
import type { OpenApiSpec, EndpointInfo } from "./services_entry/entry/api_components/openapi_spec.ts"
import type { DashboardDataSource } from "./services_entry/entry/api_components/status_dashboard.ts"
import { HealthChecker } from "./core_infra/infra/health_checker.ts"
import { HealthEndpoint } from "./core_infra/infra/health_endpoint.ts"
import { AuditLogger } from "./core_infra/infra/audit_logger.ts"
import { ConfigCenter } from "./core_infra/infra/config_center.ts"
import { TenantManager } from "./core_infra/infra/tenant_manager.ts"
import { ExceptionHandler, AppException } from "./core_infra/infra/exception_handler.ts"
import { ErrorCode } from "./core_infra/core/error_code_enum.ts"
import { build_error_response, build_error_response_from_exception, build_error_response_from_unknown, format_error_text } from "./core_infra/infra/friendly_error.ts"
import { get_error_description, get_error_suggestion, get_error_info } from "./core_infra/core/error_code_descriptions.ts"
import type { FriendlyErrorInfo } from "./core_infra/core/error_code_descriptions.ts"
import type { FriendlyErrorResponse } from "./core_infra/infra/friendly_error.ts"
import type { IAppException, IExceptionHandler } from "./core_infra/core/i_exception_handler.ts"
import type { Message } from "./core_infra/core/message_types.ts"
import {
  create_engine,
  create_engine_from_env,
  quick_start,
  quick_serve,
  resolve_engine_config,
} from "./sdk_factory.ts"
import type { EngineOptions } from "./sdk_factory.ts"
import { DEFAULT_CONFIG, get_default_config, apply_config_defaults, config_to_yaml } from "./core_infra/infra/config_defaults.ts"
import type { DefaultConfig } from "./core_infra/infra/config_defaults.ts"
import {
  run_config_wizard,
  detect_environment,
  validate_config_file,
  generate_example_config,
  get_config_field_descriptions,
} from "./core_infra/infra/config_wizard.ts"
import type { WizardOptions, WizardResult, EnvironmentDetection } from "./core_infra/infra/config_wizard.ts"
import { CircuitBreaker } from "./core_infra/infra/circuit_breaker.ts"
import { TokenBucketLimiter } from "./core_infra/infra/token_bucket_limiter.ts"
import { MemoryCache } from "./core_infra/infra/memory_cache.ts"
import { BatchProcessor } from "./core_infra/infra/batch_processor.ts"
import { VersionRegistry } from "./core_infra/infra/version_registry.ts"
import { VersionedWrapper } from "./core_infra/infra/versioned_wrapper.ts"
import { PluginManager } from "./core_infra/infra/plugin_manager.ts"
import { FileStorage } from "./core_infra/infra/file_storage.ts"
import { DiskStorage } from "./core_infra/infra/disk_storage.ts"
import { SqliteStorage } from "./core_infra/infra/sqlite_storage.ts"
import { StorageFactory } from "./core_infra/infra/storage_factory.ts"
import { HttpServer } from "./core_infra/infra/http_server.ts"
import { HttpRouter } from "./core_infra/infra/http_router.ts"
import { HttpClient } from "./core_infra/infra/http_client.ts"
import { auth_middleware, rate_limit_middleware, load_api_keys_from_env, DEFAULT_AUTH_CONFIG, AuthMiddleware } from "./core_infra/infra/auth_middleware.ts"
import type { AuthMiddlewareConfig } from "./core_infra/infra/auth_middleware.ts"
import { error_handler_middleware, logging_middleware } from "./core_infra/infra/http_middlewares.ts"
import { MemoryRepository } from "./core_infra/infra/memory_repository.ts"
import { AlertManager } from "./core_infra/infra/alert_manager.ts"
import { MemoryNotifier } from "./core_infra/infra/memory_notifier.ts"
import { QuotaManager } from "./core_infra/infra/quota_manager.ts"
import { SimpleScheduler } from "./core_infra/infra/simple_scheduler.ts"
import type { QueryEngineConfig } from "./core_infra/core/query_engine_config.ts"
import type { IQueryEngine } from "./core_infra/core/i_query_engine.ts"
import type { IAuthService } from "./core_infra/core/i_auth_service.ts"
import type { IShellService } from "./core_infra/core/i_shell_service.ts"
import type { IMessageService } from "./core_infra/core/i_message_service.ts"
import type { IApiGateway } from "./core_infra/core/i_api_gateway.ts"
import type { IStorage } from "./core_infra/core/i_storage.ts"
import type {
  IAsyncAuthService,
  IAsyncMessageService,
  IAsyncShellService,
  IAsyncApiGateway,
} from "./core_infra/core/i_async_services.ts"
import type { IAsyncLlmAdapter, LlmAdapterConfig, LlmRequest, LlmResponse, LlmMessage, LlmUsage, LlmStreamChunk } from "./core_infra/core/i_llm_adapter.ts"
import type { IAgent, AgentInfo, AgentAction, AgentResult, AgentCapability, AgentStatus } from "./core_infra/core/i_agent.ts"
import type { Task, TaskStep, TaskStatus, StepResult, TaskSummary, TaskPersistData } from "./core_infra/core/i_task.ts"
import type { ISkill, SkillDefinition, SkillMetadata, SkillResult, SkillParameter, CompositeStep, SkillPersistData } from "./core_infra/core/i_skill.ts"
import type { Plan, PlanPhase, PlanStatus, PlanSummary, PlanPersistData, PhaseExecutor, PhaseValidator } from "./core_infra/core/i_plan.ts"
import type { DaemonStatus, DaemonConfig, DaemonMetrics, DaemonEvent } from "./core_infra/core/i_daemon.ts"

export class ClaudeCodeEngine {
  private container: DiContainer
  private config: QueryEngineConfig
  private health: HealthChecker
  private audit: AuditLogger
  private started: boolean = false
  private storage: IStorage | null = null
  private http_server: HttpServer | null = null
  private conversation_engine: ConversationEngine | null = null
  private session_manager: SessionManager | null = null
  private agent_registry: AgentRegistry | null = null
  private task_orchestrator: TaskOrchestrator | null = null
  private skill_registry: SkillRegistry | null = null
  private planner: Planner | null = null
  private daemon: Daemon | null = null
  private config_manager: ConfigManager | null = null
  private health_endpoint: HealthEndpoint | null = null

  constructor(config: QueryEngineConfig) {
    log_info("engine_construct")
    this.config = config
    this.container = new DiContainer()
    this.health = new HealthChecker()
    this.audit = new AuditLogger(10000)
    this.register_services()
  }

  private register_services(): void {
    log_info("engine_register_services")
    this.container.register_factory(TOKENS.IQueryEngine, () => new QueryEngine(this.config))
    this.container.register_factory(TOKENS.IAuthService, () => {
      const svc: AuthService = new AuthService()
      svc.set_token({ source: "demo", token: "demo-token", expires_at: Date.now() + 3600000 })
      return svc
    })
    this.container.register_factory(TOKENS.IShellService, () => new ShellService(30000))
    this.container.register_factory(TOKENS.IMessageService, () => new MessageService())
    this.container.register_factory(TOKENS.IApiGateway, () => new ApiGateway())

    // 异步服务注册（W3+W4）：使用 AsyncLock/AsyncCircuitBreaker 提供弹性，注入 DiskStorage 持久化
    const storage: IStorage = new DiskStorage("/tmp/claude_code_storage")
    this.storage = storage
    this.container.register_factory(TOKENS.IAsyncAuthService, () => {
      const svc: AsyncAuthService = new AsyncAuthService()
      void svc.set_token({ source: "demo", token: "demo-token", expires_at: Date.now() + 3600000 })
      return svc
    })
    this.container.register_factory(TOKENS.IAsyncMessageService, () => new AsyncMessageService(storage))
    this.container.register_factory(TOKENS.IAsyncShellService, () => new AsyncShellService(this.config.cwd))
    this.container.register_factory(TOKENS.IAsyncApiGateway, () => {
      const auth: IAsyncAuthService = this.container.resolve<IAsyncAuthService>(TOKENS.IAsyncAuthService)
      const messages: IAsyncMessageService = this.container.resolve<IAsyncMessageService>(TOKENS.IAsyncMessageService)
      const shell: IAsyncShellService = this.container.resolve<IAsyncShellService>(TOKENS.IAsyncShellService)
      return new AsyncApiGateway(auth, messages, shell)
    })

    // V3: LLM 适配器注册。优先从环境变量创建 OpenAI 适配器，无 API Key 时回退到 Mock。
    this.container.register_factory(TOKENS.IAsyncLlmAdapter, (): IAsyncLlmAdapter => {
      const api_key: string = process.env.OPENAI_API_KEY ?? ""
      if (api_key.length > 0) {
        log_info("engine_llm_openai")
        return create_openai_adapter_from_env()
      }
      log_info("engine_llm_mock_fallback")
      return new MockLlmAdapter()
    })
  }

  async start(): Promise<void> {
    log_info("engine_start")
    const engine: IQueryEngine = this.container.resolve<IQueryEngine>(TOKENS.IQueryEngine)
    if (!engine.validate()) {
      log_error("engine_start_invalid_config")
      throw new Error("Invalid configuration")
    }
    this.health.register("query_engine", () => engine.validate())
    this.started = true

    // 从持久化存储恢复消息（W4 持久化集成）
    const messages: IAsyncMessageService = this.get_async_messages()
    if (messages instanceof AsyncMessageService) {
      await messages.load_from_storage()
    }

    this.audit.record({
      timestamp: Date.now(),
      level: "info",
      actor: "system",
      action: "engine_start",
      resource: "engine",
      result: "success",
    })
    log_info("engine_started")
  }

  stop(): void {
    log_info("engine_stop")
    this.started = false
    if (this.daemon) {
      void this.daemon.stop()
    }
    if (this.http_server) {
      this.http_server.stop()
      this.http_server = null
    }
    if (this.storage) {
      this.storage.close()
      this.storage = null
    }
  }

  is_started(): boolean {
    return this.started
  }

  /**
   * 创建并启动 HTTP 服务器，暴露 async 服务的 REST API。
   *
   * 端点：
   *   GET    /api/auth/status
   *   GET    /api/auth/validate
   *   POST   /api/messages
   *   GET    /api/messages
   *   DELETE /api/messages
   *   POST   /api/shell/run
   *   GET    /api/shell/history
   *   POST   /api/gateway         统一网关入口
   *
   * V2：集成鉴权中间件（Bearer Token）+ 速率限制。
   * API Keys 从环境变量 API_KEYS 加载（逗号分隔）。
   *
   * @returns HttpServer 实例（已启动）
   */
  start_http_server(port: number = 3000): HttpServer {
    log_info(`engine_start_http: port=${port}`)
    const server: HttpServer = new HttpServer({ port })

    // V2: 鉴权 + 速率限制中间件
    const api_keys: Set<string> = load_api_keys_from_env()
    const auth_config: AuthMiddlewareConfig = {
      ...DEFAULT_AUTH_CONFIG,
      api_keys,
    }
    server.use(error_handler_middleware())
    server.use(logging_middleware())
    server.use(rate_limit_middleware(auth_config))
    server.use(auth_middleware(auth_config))

    const auth: IAsyncAuthService = this.get_async_auth()
    const messages: IAsyncMessageService = this.get_async_messages()
    const shell: IAsyncShellService = this.get_async_shell()
    const gateway: IAsyncApiGateway = this.get_async_gateway()
    const conversation: ConversationEngine = this.get_conversation_engine()
    const sessions: SessionManager = this.get_session_manager()
    const agents: AgentRegistry = this.get_agent_registry()
    const tasks: TaskOrchestrator = this.get_task_orchestrator()
    const skills: SkillRegistry = this.get_skill_registry()
    const plans: Planner = this.get_planner()
    const daemon: Daemon = this.get_daemon()
    const config_mgr: ConfigManager = this.get_config_manager()
    const health_endpoint: HealthEndpoint = this.get_health_endpoint()

    const api_routes = setup_api_routes(auth, messages, shell)
    const gateway_routes = setup_gateway_route(gateway)
    const chat_routes = setup_chat_routes(conversation)
    const session_routes = setup_session_routes(sessions)
    const stream_routes = setup_stream_routes(conversation, sessions)
    const agent_routes = setup_agent_routes(agents)
    const task_routes = setup_task_routes(tasks)
    const skill_routes = setup_skill_routes(skills)
    const plan_routes = setup_plan_routes(plans)
    const daemon_routes = setup_daemon_routes(daemon)
    const health_routes = setup_health_routes(health_endpoint)
    const config_routes = setup_config_routes(config_mgr)
    register_routes(server, [...api_routes, ...gateway_routes, ...chat_routes, ...session_routes, ...stream_routes, ...agent_routes, ...task_routes, ...skill_routes, ...plan_routes, ...daemon_routes, ...health_routes, ...config_routes])

    server.start()
    this.http_server = server
    return server
  }

  get_engine(): IQueryEngine {
    return this.container.resolve<IQueryEngine>(TOKENS.IQueryEngine)
  }

  get_auth(): IAuthService {
    return this.container.resolve<IAuthService>(TOKENS.IAuthService)
  }

  get_shell(): IShellService {
    return this.container.resolve<IShellService>(TOKENS.IShellService)
  }

  get_messages(): IMessageService {
    return this.container.resolve<IMessageService>(TOKENS.IMessageService)
  }

  get_gateway(): IApiGateway {
    return this.container.resolve<IApiGateway>(TOKENS.IApiGateway)
  }

  get_async_auth(): IAsyncAuthService {
    return this.container.resolve<IAsyncAuthService>(TOKENS.IAsyncAuthService)
  }

  get_async_messages(): IAsyncMessageService {
    return this.container.resolve<IAsyncMessageService>(TOKENS.IAsyncMessageService)
  }

  get_async_shell(): IAsyncShellService {
    return this.container.resolve<IAsyncShellService>(TOKENS.IAsyncShellService)
  }

  get_async_gateway(): IAsyncApiGateway {
    return this.container.resolve<IAsyncApiGateway>(TOKENS.IAsyncApiGateway)
  }

  get_async_llm_adapter(): IAsyncLlmAdapter {
    return this.container.resolve<IAsyncLlmAdapter>(TOKENS.IAsyncLlmAdapter)
  }

  /**
   * 获取对话引擎（V3）。
   * 首次调用时惰性创建，复用已注册的 IAsyncMessageService 和 IAsyncLlmAdapter。
   */
  get_conversation_engine(): ConversationEngine {
    if (this.conversation_engine) {
      return this.conversation_engine
    }
    const messages: IAsyncMessageService = this.get_async_messages()
    const llm: IAsyncLlmAdapter = this.get_async_llm_adapter()
    this.conversation_engine = new ConversationEngine(messages, llm, {
      system_prompt: "You are a helpful coding assistant.",
      max_history: 50,
    })
    return this.conversation_engine
  }

  /**
   * 获取会话管理器（V4）。
   * 首次调用时惰性创建，复用已注册的 IAsyncLlmAdapter 和 IStorage。
   */
  get_session_manager(): SessionManager {
    if (this.session_manager) {
      return this.session_manager
    }
    const llm: IAsyncLlmAdapter = this.get_async_llm_adapter()
    this.session_manager = new SessionManager(llm, {
      storage: this.storage ?? undefined,
      default_max_history: 50,
    })
    return this.session_manager
  }

  /**
   * 获取 Agent 注册中心（V6）。
   * 首次调用时惰性创建，注册默认 Agent（ShellAgent + ChatAgent）。
   */
  get_agent_registry(): AgentRegistry {
    if (this.agent_registry) {
      return this.agent_registry
    }
    this.agent_registry = new AgentRegistry({
      storage: this.storage ?? undefined,
    })
    // 注册默认 Agent
    const shell: IAsyncShellService = this.get_async_shell()
    const llm: IAsyncLlmAdapter = this.get_async_llm_adapter()
    const messages: IAsyncMessageService = this.get_async_messages()
    const shell_agent = new ShellAgent(this.agent_registry.next_id(), shell)
    const chat_agent = new ChatAgent(this.agent_registry.next_id(), llm, messages, {
      system_prompt: "You are a helpful coding assistant.",
    })
    void this.agent_registry.register(shell_agent).then(() => shell_agent.start())
    void this.agent_registry.register(chat_agent).then(() => chat_agent.start())
    return this.agent_registry
  }

  /**
   * 获取任务编排器（V7）。
   * 首次调用时惰性创建，复用已注册的 AgentRegistry 和 IStorage。
   */
  get_task_orchestrator(): TaskOrchestrator {
    if (this.task_orchestrator) {
      return this.task_orchestrator
    }
    const registry: AgentRegistry = this.get_agent_registry()
    this.task_orchestrator = new TaskOrchestrator(registry, {
      storage: this.storage ?? undefined,
    })
    return this.task_orchestrator
  }

  /**
   * 获取技能注册中心（V8）。
   * 首次调用时惰性创建，注册默认内置技能（shell.execute + chat.complete + echo），
   * 并从存储加载已学习技能（自我增强恢复）。
   */
  get_skill_registry(): SkillRegistry {
    if (this.skill_registry) {
      return this.skill_registry
    }
    this.skill_registry = new SkillRegistry({
      storage: this.storage ?? undefined,
    })
    // 注册默认内置技能
    const shell: IAsyncShellService = this.get_async_shell()
    const llm: IAsyncLlmAdapter = this.get_async_llm_adapter()
    void this.skill_registry.register(new ShellExecuteSkill(shell))
    void this.skill_registry.register(new ChatCompleteSkill(llm))
    void this.skill_registry.register(new EchoSkill())
    // 从存储恢复已学习技能（自我增强恢复）
    void this.skill_registry.load_from_storage()
    return this.skill_registry
  }

  /**
   * 获取长任务规划器（V9）。
   * 首次调用时惰性创建，注入默认阶段执行器（调用 SkillRegistry 执行技能）
   * 和验证器（总是通过），并从存储恢复未完成的计划（断点续传）。
   */
  get_planner(): Planner {
    if (this.planner) {
      return this.planner
    }
    const skill_registry: SkillRegistry = this.get_skill_registry()
    // 默认阶段执行器：阶段 metadata.skill_id 指定要调用的技能，input 为技能输入
    const executor: PhaseExecutor = async (phase: PlanPhase): Promise<unknown> => {
      const skill_id: string = String((phase as PlanPhase & { skill_id?: string }).skill_id ?? "")
      if (skill_id.length === 0) {
        // 无技能指定的阶段，返回阶段目标作为输出
        return { goal: phase.goal }
      }
      const input: Record<string, unknown> =
        (phase as PlanPhase & { input?: Record<string, unknown> }).input ?? {}
      const result = await skill_registry.invoke(skill_id, input)
      if (!result.success) {
        throw new Error(result.error ?? "phase_execution_failed")
      }
      return result.output
    }
    // 默认验证器：总是通过（返回 null）
    const validator: PhaseValidator = async (_phase: PlanPhase, _output: unknown): Promise<string | null> => {
      return null
    }
    this.planner = new Planner({
      storage: this.storage ?? undefined,
      executor,
      validator,
    })
    // 从存储恢复未完成的计划（断点续传）
    void this.planner.load_from_storage()
    return this.planner
  }

  /**
   * 获取守护进程（V10）。
   * 首次调用时惰性创建，注入 Planner（用于自动恢复失败计划）、
   * 健康探针（调用 HealthChecker）和 IStorage（持久化守护进程状态）。
   *
   * 守护进程创建后不自动启动，需显式调用 daemon.start() 或通过
   * POST /api/daemon/start 启动。
   */
  get_daemon(): Daemon {
    if (this.daemon) {
      return this.daemon
    }
    const planner: Planner = this.get_planner()
    // 健康探针：调用 HealthChecker 的 overall_status
    const health_probe: () => string = () => {
      return this.health.overall_status()
    }
    this.daemon = new Daemon({
      storage: this.storage ?? undefined,
      planner,
      health_probe,
    })
    // 从存储恢复守护进程指标（不自动启动）
    void this.daemon.load_from_storage()
    return this.daemon
  }

  /**
   * 获取配置管理器（V11）。
   * 首次调用时惰性创建，从 CONFIG_FILE 环境变量指定的文件加载配置。
   * 支持运行时热重载（POST /api/config/reload）。
   */
  get_config_manager(): ConfigManager {
    if (this.config_manager) {
      return this.config_manager
    }
    const config_file: string = process.env.CONFIG_FILE ?? ""
    this.config_manager = new ConfigManager({
      file_path: config_file.length > 0 ? config_file : undefined,
    })
    if (config_file.length > 0) {
      this.config_manager.load_from_file()
    }
    return this.config_manager
  }

  /**
   * 获取健康端点（V11）。
   * 首次调用时惰性创建，注册默认健康探针（引擎验证）。
   * 暴露 /health、/health/live、/health/ready 路由供 K8s 探针使用。
   */
  get_health_endpoint(): HealthEndpoint {
    if (this.health_endpoint) {
      return this.health_endpoint
    }
    this.health_endpoint = new HealthEndpoint()
    // 注册默认探针：引擎配置验证
    const engine: IQueryEngine = this.container.resolve<IQueryEngine>(TOKENS.IQueryEngine)
    this.health_endpoint.add_probe("engine", () => engine.validate())
    // 注册存储探针
    this.health_endpoint.add_probe("storage", () => this.storage !== null)
    return this.health_endpoint
  }

  health_check(): string {
    return this.health.overall_status()
  }

  get_audit_log(): string {
    return this.audit.export()
  }
}

export {
  DiContainer,
  TOKENS,
  QueryEngine,
  AuthService,
  ShellService,
  MessageService,
  ApiGateway,
  AsyncAuthService,
  AsyncMessageService,
  AsyncShellService,
  AsyncApiGateway,
  MockLlmAdapter,
  OpenAiLlmAdapter,
  create_openai_adapter_from_env,
  ConversationEngine,
  SessionManager,
  AgentRegistry,
  ShellAgent,
  ChatAgent,
  TaskOrchestrator,
  SkillRegistry,
  ShellExecuteSkill,
  ChatCompleteSkill,
  EchoSkill,
  Planner,
  Daemon,
  ConfigManager,
  HealthEndpoint,
  HealthChecker,
  parse_args,
  print_help,
  print_version,
  resolve_port,
  resolve_log_level,
  has_flag,
  get_option,
  get_number_option,
  InteractiveRepl,
  CLI_VERSION,
  ReplHistory,
  ReplCompleter,
  create_repl_completer,
  DEFAULT_HISTORY_FILE,
  DEFAULT_MAX_HISTORY,
  InteractiveConfigWizard,
  generate_config_non_interactive,
  show_config,
  list_config_fields,
  generate_template,
  list_templates,
  TEMPLATE_DESCRIPTIONS,
  run_diagnostics,
  format_diagnostic_report,
  check_port_available,
  is_first_run,
  should_show_guide,
  check_and_get_prompt,
  load_first_run_state,
  save_first_run_state,
  mark_first_run,
  mark_step_complete,
  reset_first_run_state,
  get_next_guide_step,
  get_guide_progress,
  generate_welcome_banner,
  generate_first_run_prompt,
  generate_quick_tips,
  FIRST_RUN_FILE,
  GUIDE_STEPS,
  get_default_first_run_state,
  AuditLogger,
  ConfigCenter,
  TenantManager,
  ExceptionHandler,
  CircuitBreaker,
  TokenBucketLimiter,
  MemoryCache,
  BatchProcessor,
  VersionRegistry,
  VersionedWrapper,
  PluginManager,
  FileStorage,
  DiskStorage,
  SqliteStorage,
  StorageFactory,
  HttpServer,
  HttpRouter,
  HttpClient,
  auth_middleware,
  rate_limit_middleware,
  load_api_keys_from_env,
  DEFAULT_AUTH_CONFIG,
  AuthMiddleware,
  error_handler_middleware,
  logging_middleware,
  MemoryRepository,
  AlertManager,
  MemoryNotifier,
  QuotaManager,
  SimpleScheduler,
  setup_api_routes,
  setup_gateway_route,
  setup_chat_routes,
  setup_session_routes,
  setup_stream_routes,
  setup_agent_routes,
  setup_task_routes,
  setup_skill_routes,
  setup_plan_routes,
  setup_daemon_routes,
  setup_health_routes,
  setup_config_routes,
  setup_docs_routes,
  setup_debug_console_routes,
  generate_debug_console_html,
  setup_dashboard_routes,
  generate_dashboard_html,
  DASHBOARD_DATA_SOURCES,
  register_routes,
  generate_openapi_spec,
  get_endpoint_list,
  generate_html_docs,
  API_ENDPOINTS,
  LogLevel,
  LoggerService,
  StructuredLogger,
  parse_log_level,
  log_level_to_string,
  is_valid_log_level,
  LOG_LEVEL_NAMES,
  log_debug,
  log_info,
  log_warn,
  log_error,
  set_global_level,
  get_global_level,
  configure_global_logger,
  set_global_silent,
  is_global_silent,
  ErrorCode,
  AppException,
  get_error_description,
  get_error_suggestion,
  get_error_info,
  build_error_response,
  build_error_response_from_exception,
  build_error_response_from_unknown,
  format_error_text,
  create_engine,
  create_engine_from_env,
  quick_start,
  quick_serve,
  resolve_engine_config,
  DEFAULT_CONFIG,
  get_default_config,
  apply_config_defaults,
  config_to_yaml,
  run_config_wizard,
  detect_environment,
  validate_config_file,
  generate_example_config,
  get_config_field_descriptions,
}

export type {
  QueryEngineConfig,
  IQueryEngine,
  IAuthService,
  IShellService,
  IMessageService,
  IApiGateway,
  IAsyncAuthService,
  IAsyncMessageService,
  IAsyncShellService,
  IAsyncApiGateway,
  IAsyncLlmAdapter,
  LlmAdapterConfig,
  LlmRequest,
  LlmResponse,
  LlmMessage,
  LlmUsage,
  LlmStreamChunk,
  Session,
  SessionConfig,
  SessionListItem,
  SessionPersistData,
  IStorage,
  AuthMiddlewareConfig,
  IAgent,
  AgentInfo,
  AgentAction,
  AgentResult,
  AgentCapability,
  AgentStatus,
  Task,
  TaskStep,
  TaskStatus,
  StepResult,
  TaskSummary,
  TaskPersistData,
  ISkill,
  SkillDefinition,
  SkillMetadata,
  SkillResult,
  SkillParameter,
  CompositeStep,
  SkillPersistData,
  Plan,
  PlanPhase,
  PlanStatus,
  PlanSummary,
  PlanPersistData,
  PhaseExecutor,
  PhaseValidator,
  DaemonStatus,
  DaemonConfig,
  DaemonMetrics,
  DaemonEvent,
  CliArgs,
  ReplCommand,
  ReplCommandHandler,
  ILogger,
  StructuredLogEntry,
  IAppException,
  IExceptionHandler,
  FriendlyErrorInfo,
  FriendlyErrorResponse,
  Message,
  EngineOptions,
  DefaultConfig,
  WizardOptions,
  WizardResult,
  EnvironmentDetection,
  OpenApiSpec,
  EndpointInfo,
  DashboardDataSource,
  TemplateType,
  TemplateOptions,
  TemplateResult,
  DiagnosticReport,
  DiagnosticCheck,
  DiagnosticLevel,
  FirstRunState,
  GuideStep,
}
