import { describe, it, expect } from "bun:test"
import { QueryEngine } from "../../../src/core_infra/core/query_engine.ts"
import { AuthService } from "../../../src/services_entry/services/auth_service.ts"
import { ShellService } from "../../../src/services_entry/services/shell_service.ts"
import { MessageService } from "../../../src/services_entry/services/message_service.ts"
import { ApiGateway } from "../../../src/services_entry/entry/api_components/api_gateway.ts"
import { LoggerService } from "../../../src/core_infra/infra/logger_service.ts"
import { ConfigLoader } from "../../../src/core_infra/infra/config_loader.ts"
import { ConfigValidator } from "../../../src/core_infra/infra/config_validator.ts"
import { ToolScheduler } from "../../../src/core_infra/core/tool_scheduler.ts"
import { MessagePipeline } from "../../../src/core_infra/core/message_pipeline.ts"
import { AppComponent } from "../../../src/services_entry/entry/api_components/components/app_component.ts"
import { DialogComponent } from "../../../src/services_entry/entry/api_components/components/dialog_component.ts"
import type { IQueryEngine } from "../../../src/core_infra/core/i_query_engine.ts"
import type { IAuthService } from "../../../src/core_infra/core/i_auth_service.ts"
import type { IShellService } from "../../../src/core_infra/core/i_shell_service.ts"
import type { IMessageService } from "../../../src/core_infra/core/i_message_service.ts"
import type { IApiGateway } from "../../../src/core_infra/core/i_api_gateway.ts"
import type { ILogger } from "../../../src/core_infra/core/i_logger.ts"
import type { IConfigLoader, IConfigValidator } from "../../../src/core_infra/core/i_config.ts"
import type { IToolScheduler } from "../../../src/core_infra/core/i_tool.ts"
import type { IMessagePipeline } from "../../../src/core_infra/core/i_message_pipeline.ts"
import type { IMessageListRenderer, IDialogRenderer } from "../../../src/core_infra/core/i_component.ts"
import { LogLevel } from "../../../src/core_infra/infra/log_level_enum.ts"

describe("interface_contract i_query_engine", () => {
  it("should be implemented by QueryEngine", () => {
    const engine: IQueryEngine = new QueryEngine({ cwd: "/tmp", initial_messages: [], max_turns: 10, verbose: false })
    expect(engine.validate()).toBe(true)
    expect(engine.get_messages()).toEqual([])
  })
})

describe("interface_contract i_auth_service", () => {
  it("should be implemented by AuthService", () => {
    const auth: IAuthService = new AuthService()
    auth.set_token({ source: "test", token: "abc", expires_at: Date.now() + 1000 })
    expect(auth.validate()).toBe(true)
    expect(auth.get_status().is_authenticated).toBe(true)
  })
})

describe("interface_contract i_shell_service", () => {
  it("should be implemented by ShellService", () => {
    const shell: IShellService = new ShellService()
    const result = shell.run({ command: "echo", timeout_ms: 1000 })
    expect(result.exit_code).toBe(0)
  })
})

describe("interface_contract i_message_service", () => {
  it("should be implemented by MessageService", () => {
    const msg: IMessageService = new MessageService()
    const added = msg.add("hello", "user")
    expect(added.content).toBe("hello")
    expect(msg.get_all().length).toBe(1)
  })
})

describe("interface_contract i_api_gateway", () => {
  it("should be implemented by ApiGateway", () => {
    const gateway: IApiGateway = new ApiGateway()
    const response = gateway.handle_request({ action: "test", payload: {} })
    expect(response.success).toBe(true)
  })
})

describe("interface_contract i_logger", () => {
  it("should be implemented by LoggerService", () => {
    const logger: ILogger = new LoggerService(LogLevel.DEBUG)
    logger.log_info("test")
    expect(logger.validate()).toBe(true)
  })
})

describe("interface_contract i_config_loader", () => {
  it("should be implemented by ConfigLoader", () => {
    const loader: IConfigLoader = new ConfigLoader()
    expect(typeof loader.load).toBe("function")
  })
})

describe("interface_contract i_config_validator", () => {
  it("should be implemented by ConfigValidator", () => {
    const validator: IConfigValidator = new ConfigValidator()
    expect(typeof validator.validate_present).toBe("function")
    expect(typeof validator.validate_string).toBe("function")
    expect(typeof validator.validate_range).toBe("function")
  })
})

describe("interface_contract i_tool_scheduler", () => {
  it("should be implemented by ToolScheduler", () => {
    const scheduler: IToolScheduler = new ToolScheduler()
    const call = scheduler.schedule("test", {})
    expect(scheduler.execute(call)).toContain("test")
  })
})

describe("interface_contract i_message_pipeline", () => {
  it("should be implemented by MessagePipeline", () => {
    const pipeline: IMessagePipeline = new MessagePipeline()
    const msg = pipeline.create("1", "hello", "user")
    expect(msg.content).toBe("hello")
    const normalized = pipeline.normalize(msg)
    expect(normalized.content).toBe("hello")
  })
})

describe("interface_contract i_message_list_renderer", () => {
  it("should be implemented by AppComponent", () => {
    const app: IMessageListRenderer = new AppComponent()
    app.set_messages([{ id: "1", content: "hi", role: "user", timestamp: 0 }])
    expect(app.render()).toContain("[user] hi")
  })
})

describe("interface_contract i_dialog_renderer", () => {
  it("should be implemented by DialogComponent", () => {
    const dialog: IDialogRenderer = new DialogComponent()
    dialog.set_title("T")
    dialog.set_body("B")
    expect(dialog.render()).toContain("T")
  })
})
