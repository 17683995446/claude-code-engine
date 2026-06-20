import { describe, it, expect } from "bun:test"
import { SimpleEventBus } from "../../../src/core_infra/infra/simple_event_bus.ts"

describe("simple_event_bus normal", () => {
  it("should publish and receive", () => {
    const bus = new SimpleEventBus()
    let received: string = ""
    bus.subscribe("test", (payload: string) => { received = payload })
    bus.publish("test", "hello")
    expect(received).toBe("hello")
  })
})

describe("simple_event_bus multiple", () => {
  it("should broadcast to multiple subscribers", () => {
    const bus = new SimpleEventBus()
    let count = 0
    bus.subscribe("x", () => { count += 1 })
    bus.subscribe("x", () => { count += 1 })
    bus.publish("x", null)
    expect(count).toBe(2)
  })
})

describe("simple_event_bus unsubscribe", () => {
  it("should remove subscriber", () => {
    const bus = new SimpleEventBus()
    const handler = () => {}
    bus.subscribe("y", handler)
    expect(bus.subscriber_count("y")).toBe(1)
    bus.unsubscribe("y", handler)
    expect(bus.subscriber_count("y")).toBe(0)
  })
})

describe("simple_event_bus no_subscribers", () => {
  it("should not throw for no subscribers", () => {
    const bus = new SimpleEventBus()
    expect(() => bus.publish("z", "data")).not.toThrow()
  })
})
