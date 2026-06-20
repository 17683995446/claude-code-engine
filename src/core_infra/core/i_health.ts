/**
 * Health status type.
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy"

/**
 * Health check result.
 */
export interface IHealthResult {
  name: string
  status: HealthStatus
  message: string
  timestamp: number
}

/**
 * Health checker interface.
 */
export interface IHealthChecker {
  /**
   * Register a health check probe.
   *
   * @param name - The probe name.
   * @param probe - The probe function returning true if healthy.
   */
  register(name: string, probe: () => boolean): void

  /**
   * Run all health checks.
   *
   * @returns The array of results.
   */
  check_all(): IHealthResult[]

  /**
   * Get overall health status.
   *
   * @returns The overall status.
   */
  overall_status(): HealthStatus
}
