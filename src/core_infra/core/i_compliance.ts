/**
 * Compliance check result.
 */
export interface IComplianceResult {
  rule: string
  passed: boolean
  message: string
}

/**
 * Compliance checker interface.
 */
export interface IComplianceChecker {
  /**
   * Run all compliance checks.
   *
   * @returns The array of results.
   */
  check_all(): IComplianceResult[]

  /**
   * Check if all rules passed.
   *
   * @returns True if fully compliant.
   */
  is_compliant(): boolean
}
