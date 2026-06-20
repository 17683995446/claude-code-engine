/**
 * Tracer interface.
 *
 * Defines the contract for distributed tracing.
 */
export interface ITracer {
  /**
   * Start a new span.
   *
   * @param name - The span name.
   * @returns The span id.
   */
  start(name: string): string

  /**
   * End a span.
   *
   * @param span_id - The span id.
   */
  end(span_id: string): void

  /**
   * Get all recorded spans.
   *
   * @returns Array of span records.
   */
  spans(): { id: string; name: string; start: number; end?: number }[]
}
