import { log_info } from "./global_logger.js"

export interface IDocEntry {
  name: string
  type: "interface" | "class" | "function"
  path: string
  description: string
}

export class DocGenerator {
  private entries: IDocEntry[] = []

  add(entry: IDocEntry): void {
    log_info(`doc_add: ${entry.name}`)
    this.entries.push(entry)
  }

  generate_markdown(): string {
    log_info(`doc_generate: ${this.entries.length}`)
    const lines: string[] = ["# API Documentation", ""]
    for (const e of this.entries) {
      lines.push(`## ${e.name}`)
      lines.push(`- **Type**: ${e.type}`)
      lines.push(`- **Path**: ${e.path}`)
      lines.push(`- **Description**: ${e.description}`)
      lines.push("")
    }
    return lines.join("\n")
  }

  get_entries(): IDocEntry[] {
    log_info("doc_get_entries")
    return this.entries.map((e) => ({ ...e }))
  }
}
