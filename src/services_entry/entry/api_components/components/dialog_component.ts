import { log_info } from "../../../../core_infra/infra/global_logger.js"
import type { IDialogRenderer } from "../../../../core_infra/core/i_component.js"

export class DialogComponent implements IDialogRenderer {
  private title: string = ""
  private body: string = ""

  set_title(title: string): void {
    log_info(`dialog_component_set_title: ${title}`)
    this.title = title
  }

  set_body(body: string): void {
    log_info(`dialog_component_set_body: ${body.length}`)
    this.body = body
  }

  render(): string {
    log_info("dialog_component_render")
    const header: string = `=== ${this.title} ===`
    const footer: string = "=".repeat(header.length)
    return `${header}\n${this.body}\n${footer}`
  }
}

export function render_dialog(title: string, body: string): string {
  log_info(`render_dialog_compat: ${title}`)
  const comp = new DialogComponent()
  comp.set_title(title)
  comp.set_body(body)
  return comp.render()
}
