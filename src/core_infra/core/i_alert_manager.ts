import type { INotifier } from "./i_notifier.ts"

/**
 * Alert rule interface.
 */
export interface IAlertRule {
  readonly name: string

  /**
   * Evaluate whether the alert condition is met.
   *
   * @returns True if triggered.
   */
  condition(): boolean

  /**
   * Build the notification message.
   *
   * @returns The alert message.
   */
  message(): string
}

/**
 * Alert manager interface.
 *
 * Manages alert rule evaluation and notification dispatch.
 */
export interface IAlertManager {
  /**
   * Register an alert rule.
   *
   * @param rule - The rule to register.
   * @param channel - The notification channel.
   */
  register(rule: IAlertRule, channel: string): void

  /**
   * Evaluate all rules and send notifications.
   */
  evaluate(): void

  /**
   * List all registered rule names.
   *
   * @returns Array of rule names.
   */
  list_rules(): string[]
}
