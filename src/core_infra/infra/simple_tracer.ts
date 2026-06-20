import { log_info, log_warn } from "./global_logger.js"
import type { ITracer, ISpan } from "../core/i_tracer.js"

export class SimpleTracer implements ITracer {
  private spans: Map<string, ISpan> = new Map()
  private completed: ISpan[] = []
  private readonly max_completed: number

  constructor(max_completed: number = 10000) {
    log_info(`simple_tracer_created: max=${max_completed}`)
    this.max_completed = max_completed
  }

  start_span(name: string): string {
    log_info(`tracer_start_span: ${name}`)
    const id: string = `span_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    this.spans.set(id, { id, name, start_time: Date.now(), end_time: null })
    return id
  }

  end_span(span_id: string): void {
    log_info(`tracer_end_span: ${span_id}`)
    const span = this.spans.get(span_id)
    if (!span) {
      return
    }
    span.end_time = Date.now()
    this.completed.push(span)
    this.spans.delete(span_id)
    if (this.completed.length > this.max_completed) {
      log_warn(`tracer_rotate: ${this.completed.length}`)
      this.completed.shift()
    }
  }

  get_spans(): ISpan[] {
    log_info(`tracer_get_spans: ${this.completed.length}`)
    return this.completed.map((s) => ({ ...s }))
  }

  clear(): void {
    log_info("tracer_clear")
    this.spans.clear()
    this.completed = []
  }
}
