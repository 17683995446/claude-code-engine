import { log_info, log_warn } from "./global_logger.ts"
import type { ITracer } from "../core/i_tracer.ts"

interface Span {
  id: string
  name: string
  start: number
  end?: number
}

export class MemoryTracer implements ITracer {
  private data: Span[] = []
  private readonly max_spans: number

  constructor(max_spans: number = 10000) {
    log_info(`memory_tracer_created: max=${max_spans}`)
    this.max_spans = max_spans
  }

  start(name: string): string {
    log_info(`tracer_start: ${name}`)
    const id = `span_${Date.now()}_${Math.random()}`
    this.data.push({ id, name, start: Date.now() })
    if (this.data.length > this.max_spans) {
      log_warn(`tracer_rotate: ${this.data.length}`)
      this.data.shift()
    }
    return id
  }

  end(span_id: string): void {
    log_info(`tracer_end: ${span_id}`)
    const span = this.data.find((s) => s.id === span_id)
    if (span) {
      span.end = Date.now()
    }
  }

  spans(): Span[] {
    log_info(`tracer_spans: ${this.data.length}`)
    return this.data.map((s) => ({ ...s }))
  }

  clear(): void {
    log_info("tracer_clear")
    this.data = []
  }
}
