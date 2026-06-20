import { describe, it, expect } from "bun:test"
import { MemoryEventBus } from "../../../src/core_infra/infra/memory_event_bus.ts"

describe("memory_event_bus", () => {
  it("should deliver event to subscriber", () => {
    const bus: MemoryEventBus = new MemoryEventBus()
    let received: string = ""
    const handler = (p: string): void => { received = p }
    bus.subscribe("test", handler)
    bus.publish("test", "hello")
    expect(received).toBe("hello")
  })

  it("should not deliver after unsubscribe", () => {
    const bus: MemoryEventBus = new MemoryEventBus()
    let received: string = ""
    const handler = (p: string): void => { received = p }
    bus.subscribe("test", handler)
    bus.unsubscribe("test", handler)
    bus.publish("test", "hello")
    expect(received).toBe("")
  })

  it("should deliver to multiple subscribers", () => {
    const bus: MemoryEventBus = new MemoryEventBus()
    let a: string = ""
    let b: string = ""
    bus.subscribe("test", (p: string) => { a = p })
    bus.subscribe("test", (p: string) => { b = p })
    bus.publish("test", "msg")
    expect(a).toBe("msg")
    expect(b).toBe("msg")
  })

  it("should isolate events by name", () => {
    const bus: MemoryEventBus = new MemoryEventBus()
    let received: string = ""
    bus.subscribe("a", (p: string) => { received = p })
    bus.publish("b", "msg")
    expect(received).toBe("")
  })

  it("should survive handler exception", () => {
    const bus: MemoryEventBus = new MemoryEventBus()
    let received: string = ""
    bus.subscribe("test", () => { throw new Error("fail") })
    bus.subscribe("test", (p: string) => { received = p })
    bus.publish("test", "msg")
    expect(received).toBe("msg")
  })
})
