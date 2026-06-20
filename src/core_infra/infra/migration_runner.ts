import { log_info, log_warn, log_error } from "./global_logger.ts"
import type { IMigration } from "../core/i_migration.ts"

export class MigrationRunner {
  private migrations: IMigration[] = []

  register(m: IMigration): void {
    log_info(`migration_register: ${m.version}`)
    this.migrations.push(m)
  }

  async up(): Promise<void> {
    log_info(`migration_up: ${this.migrations.length}`)
    for (const m of this.migrations) {
      try {
        await m.up()
        log_info(`migration_up_ok: ${m.version}`)
      } catch (err) {
        log_error(`migration_up_fail: ${m.version} ${err}`)
        throw err
      }
    }
  }

  async down(): Promise<void> {
    log_info(`migration_down: ${this.migrations.length}`)
    for (let i = this.migrations.length - 1; i >= 0; i--) {
      const m = this.migrations[i]
      try {
        await m.down()
        log_info(`migration_down_ok: ${m.version}`)
      } catch (err) {
        log_error(`migration_down_fail: ${m.version} ${err}`)
        throw err
      }
    }
  }
}
