import { AbcBase } from "./abc_base.js"
import type { ToolInput, ToolOutput } from "./tool_types.js"

export abstract class Tool extends AbcBase {
  protected name: string

  constructor(name: string) {
    super()
    this.name = name
  }

  validate(): boolean {
    return this.name.length > 0
  }

  to_object(): Record<string, unknown> {
    return { name: this.name }
  }

  abstract execute(input: ToolInput): ToolOutput
}
