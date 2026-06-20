import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IAlertManager, IAlertRule } from "../core/i_alert_manager.ts"
import type { INotifier } from "../core/i_notifier.ts"

export class AlertManager implements IAlertManager {
  private rules: Map<string, { rule: IAlertRule; channel: string }> = new Map()
  private readonly notifier: INotifier

  constructor(notifier: INotifier) {
    log_info("alert_manager_created")
    this.notifier = notifier
  }

  register(rule: IAlertRule, channel: string): void {
    log_info(`alert_manager_register: ${rule.name}`)
    this.rules.set(rule.name, { rule, channel })
  }

  evaluate(): void {
    log_info(`alert_manager_evaluate: ${this.rules.size}`)
    for (const { rule, channel } of this.rules.values()) {
      this.eval_one(rule, channel)
    }
  }

  list_rules(): string[] {
    log_info(`alert_manager_list: ${this.rules.size}`)
    return Array.from(this.rules.keys())
  }

  private eval_one(rule: IAlertRule, channel: string): void {
    log_info(`alert_manager_eval: ${rule.name}`)
    try {
      if (rule.condition()) {
        this.notifier.send(channel, rule.message())
      }
    } catch (err) {
      log_error(`alert_manager_eval_fail: ${rule.name} ${err}`)
    }
  }
}
