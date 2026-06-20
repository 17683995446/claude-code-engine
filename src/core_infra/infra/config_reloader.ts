import { log_info, log_error } from "./global_logger.js"
import type { IReloadable } from "../core/i_reloadable.js"
import type { IConfigLoader } from "../core/i_config.js"

export class ConfigReloader implements IReloadable {
  private loader: IConfigLoader
  private file_path: string
  private last_reload: number = 0
  private config: Record<string, unknown> = {}

  constructor(loader: IConfigLoader, file_path: string) {
    log_info("config_reloader_created")
    this.loader = loader
    this.file_path = file_path
  }

  reload(): boolean {
    log_info(`config_reloader_reload: ${this.file_path}`)
    try {
      this.config = this.loader.load(this.file_path)
      this.last_reload = Date.now()
      log_info("config_reloader_reload_done")
      return true
    } catch (error) {
      log_error(`config_reloader_reload_failed: ${error}`)
      return false
    }
  }

  last_reloaded_at(): number {
    log_info(`config_reloader_last_reloaded: ${this.last_reload}`)
    return this.last_reload
  }

  get_config(): Record<string, unknown> {
    log_info("config_reloader_get_config")
    return { ...this.config }
  }
}
