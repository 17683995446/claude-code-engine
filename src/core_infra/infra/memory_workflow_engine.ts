import { log_info, log_warn } from "./global_logger.ts"
import type { IWorkflowEngine } from "../core/i_workflow.ts"

interface Task {
  id: string
  deps: string[]
  action: string
  status: "pending" | "running" | "done" | "failed"
}

export class MemoryWorkflowEngine implements IWorkflowEngine {
  private tasks: Map<string, Task> = new Map()

  define_task(id: string, deps: string[], action: string): void {
    log_info(`workflow_define: ${id} deps=[${deps.join(",")}] action=${action}`)
    this.tasks.set(id, { id, deps, action, status: "pending" })
  }

  execute(): string[] {
    log_info("workflow_execute")
    const order: string[] = []
    const completed: Set<string> = new Set()
    let progress: boolean = true
    while (progress) {
      progress = false
      for (const [id, task] of this.tasks) {
        if (task.status !== "pending") {
          continue
        }
        const ready: boolean = task.deps.every((d) => completed.has(d))
        if (ready) {
          log_info(`workflow_run_task: ${id}`)
          task.status = "done"
          completed.add(id)
          order.push(id)
          progress = true
        }
      }
    }
    for (const [id, task] of this.tasks) {
      if (task.status === "pending") {
        log_warn(`workflow_deadlock: ${id}`)
        task.status = "failed"
      }
    }
    return order
  }

  get_status(id: string): string {
    log_info(`workflow_status: ${id}`)
    return this.tasks.get(id)?.status ?? "unknown"
  }
}
