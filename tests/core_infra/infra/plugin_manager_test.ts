import { describe, it, expect } from "bun:test"
import { PluginManager } from "../../../src/core_infra/infra/plugin_manager.ts"
import { DiContainer } from "../../../src/core_infra/infra/di_container.ts"
import type { IPlugin } from "../../../src/core_infra/core/i_plugin.ts"
import type { IContainer } from "../../../src/core_infra/core/i_container.ts"

class GoodPlugin implements IPlugin {
  readonly name: string = "good"
  readonly version: string = "1.0.0"
  activated: boolean = false

  activate(_container: IContainer): void {
    this.activated = true
  }
  deactivate(): void {
    this.activated = false
  }
}

class BadPlugin implements IPlugin {
  readonly name: string = "bad"
  readonly version: string = "1.0.0"

  activate(_container: IContainer): void {
    throw new Error("activate fail")
  }
  deactivate(): void {
    throw new Error("deactivate fail")
  }
}

describe("plugin_manager normal", () => {
  it("should load and activate plugin", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    const plugin: GoodPlugin = new GoodPlugin()
    manager.load(plugin)
    expect(manager.is_loaded("good")).toBe(true)
    expect(plugin.activated).toBe(true)
  })
})

describe("plugin_manager boundary", () => {
  it("should unload and deactivate plugin", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    const plugin: GoodPlugin = new GoodPlugin()
    manager.load(plugin)
    manager.unload("good")
    expect(manager.is_loaded("good")).toBe(false)
    expect(plugin.activated).toBe(false)
  })
})

describe("plugin_manager invalid", () => {
  it("should isolate activate failure", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    const bad: BadPlugin = new BadPlugin()
    manager.load(bad)
    expect(manager.is_loaded("bad")).toBe(false)
  })

  it("should isolate deactivate failure", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    const bad: BadPlugin = new BadPlugin()
    manager.load(bad)
    manager.unload("bad")
    expect(manager.is_loaded("bad")).toBe(false)
  })
})

describe("plugin_manager null edge", () => {
  it("should handle duplicate load", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    const plugin: GoodPlugin = new GoodPlugin()
    manager.load(plugin)
    plugin.activated = false
    manager.load(plugin)
    expect(plugin.activated).toBe(false)
  })

  it("should handle unload unknown", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    manager.unload("unknown")
    expect(manager.is_loaded("unknown")).toBe(false)
  })
})

describe("plugin_manager list", () => {
  it("should list loaded plugins", () => {
    const container: DiContainer = new DiContainer()
    const manager: PluginManager = new PluginManager(container)
    manager.load(new GoodPlugin())
    const names: string[] = manager.list()
    expect(names).toContain("good")
  })
})
