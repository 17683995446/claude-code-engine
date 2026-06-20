import { readFileSync } from "fs"
import { parse } from "yaml"
import { log_info, log_warn } from "./global_logger.js"
import type { IConfigLoader } from "../core/i_config.js"

export class ConfigLoader implements IConfigLoader {
  load(file_path: string): Record<string, unknown> {
    log_info(`config_loader_load: ${file_path}`)
    try {
      const raw_content: string = this.read_file(file_path)
      const parsed_config: Record<string, unknown> = this.parse_yaml(raw_content)
      log_info("config_loader_load_done")
      return parsed_config
    } catch (e) {
      log_warn(`config_loader_load_failed: ${file_path} ${e}`)
      throw new Error(`config_load_failed: ${file_path} - ${e}`)
    }
  }

  private read_file(file_path: string): string {
    log_info(`config_loader_read_file: ${file_path}`)
    return readFileSync(file_path, "utf-8")
  }

  private parse_yaml(content: string): Record<string, unknown> {
    log_info("config_loader_parse_yaml")
    return parse(content) as Record<string, unknown>
  }
}

export function load_config(file_path: string): Record<string, unknown> {
  log_info(`load_config_compat: ${file_path}`)
  const loader = new ConfigLoader()
  return loader.load(file_path)
}
