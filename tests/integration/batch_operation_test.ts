import { describe, it, expect } from "bun:test"
import { BatchProcessor } from "../../src/core_infra/infra/batch_processor.ts"
import { MessageService } from "../../src/services_entry/services/message_service.ts"
import { ShellService } from "../../src/services_entry/services/shell_service.ts"
import { ApiGateway } from "../../src/services_entry/entry/api_components/api_gateway.ts"

describe("batch_operation messages", () => {
  it("should batch add messages", async () => {
    const svc: MessageService = new MessageService()
    const processor: BatchProcessor<{ content: string; role: "user" | "assistant" }, unknown> =
      new BatchProcessor(async (item) => svc.add(item.content, item.role), 2)
    processor.submit([
      { content: "a", role: "user" },
      { content: "b", role: "assistant" },
      { content: "c", role: "user" },
    ])
    const result = await processor.execute()
    expect(result.succeeded).toBe(3)
    expect(svc.get_all().length).toBe(3)
  })
})

describe("batch_operation shell", () => {
  it("should batch run shell commands", async () => {
    const svc: ShellService = new ShellService(5000)
    const processor: BatchProcessor<string, unknown> = new BatchProcessor(
      async (cmd: string) => svc.run({ command: cmd, timeout_ms: 1000 }),
      2
    )
    processor.submit(["echo a", "echo b", "echo c"])
    const result = await processor.execute()
    expect(result.succeeded).toBe(3)
    expect(svc.get_history().length).toBe(3)
  })
})

describe("batch_operation api", () => {
  it("should batch handle api requests", async () => {
    const gateway: ApiGateway = new ApiGateway()
    const processor: BatchProcessor<{ action: string; payload: Record<string, unknown> }, unknown> =
      new BatchProcessor(async (req) => gateway.handle_request(req), 2)
    processor.submit([
      { action: "test", payload: {} },
      { action: "ok", payload: {} },
    ])
    const result = await processor.execute()
    expect(result.succeeded).toBe(2)
  })
})

describe("batch_operation mixed_failure", () => {
  it("should survive mixed success and failure", async () => {
    const gateway: ApiGateway = new ApiGateway()
    const processor: BatchProcessor<{ action: string; payload: Record<string, unknown> }, unknown> =
      new BatchProcessor(async (req) => gateway.handle_request(req), 2)
    processor.submit([
      { action: "valid", payload: {} },
      { action: "", payload: {} },
      { action: "ok", payload: {} },
    ])
    const result = await processor.execute()
    expect(result.total).toBe(3)
    expect(result.failed).toBe(1)
    expect(result.succeeded).toBe(2)
  })
})
