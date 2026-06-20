/**
 * DI container service tokens.
 */
export const TOKENS = {
  IQueryEngine: Symbol("IQueryEngine"),
  IAuthService: Symbol("IAuthService"),
  IShellService: Symbol("IShellService"),
  IMessageService: Symbol("IMessageService"),
  IApiGateway: Symbol("IApiGateway"),
  IAsyncAuthService: Symbol("IAsyncAuthService"),
  IAsyncShellService: Symbol("IAsyncShellService"),
  IAsyncMessageService: Symbol("IAsyncMessageService"),
  IAsyncApiGateway: Symbol("IAsyncApiGateway"),
  IAsyncLlmAdapter: Symbol("IAsyncLlmAdapter"),
  IAgentRegistry: Symbol("IAgentRegistry"),
  ITaskOrchestrator: Symbol("ITaskOrchestrator"),
  ISkillRegistry: Symbol("ISkillRegistry"),
  IPlanner: Symbol("IPlanner"),
  IDaemon: Symbol("IDaemon"),
  ILogger: Symbol("ILogger"),
  IConfigLoader: Symbol("IConfigLoader"),
  IConfigValidator: Symbol("IConfigValidator"),
  IToolScheduler: Symbol("IToolScheduler"),
  IMessagePipeline: Symbol("IMessagePipeline"),
  IMessageListRenderer: Symbol("IMessageListRenderer"),
  IDialogRenderer: Symbol("IDialogRenderer"),
} as const
