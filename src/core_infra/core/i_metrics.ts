/**
 * Metrics interface.
 *
 * Defines the contract for metrics collection.
 */
export interface IMetrics {
  /**
   * Increment a counter.
   *
   * @param name - The metric name.
   * @param value - The increment value.
   */
  counter(name: string, value: number): void

  /**
   * Record a gauge value.
   *
   * @param name - The metric name.
   * @param value - The gauge value.
   */
  gauge(name: string, value: number): void

  /**
   * Record a histogram value.
   *
   * @param name - The metric name.
   * @param value - The observed value.
   */
  histogram(name: string, value: number): void

  /**
   * Export all metrics in Prometheus format.
   *
   * @returns The metrics text.
   */
  export(): string
}
