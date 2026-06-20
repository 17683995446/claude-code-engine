import { QueryEngine } from "../../../core_infra/core/query_engine.ts"
import type { QueryEngineConfig } from "../../../core_infra/core/query_engine_config.ts"
import { log_info } from "../../../core_infra/infra/global_logger.ts"
import { DiContainer } from "../../../core_infra/infra/di_container.ts"
import { TOKENS } from "../../../core_infra/infra/service_tokens.ts"
import type { IQueryEngine } from "../../../core_infra/core/i_query_engine.ts"

function create_engine(config: QueryEngineConfig): IQueryEngine {
  const container: DiContainer = new DiContainer()
  container.register_factory(TOKENS.IQueryEngine, () => new QueryEngine(config))
  return container.resolve<IQueryEngine>(TOKENS.IQueryEngine)
}

function validate_or_fail(engine: IQueryEngine, label: string): string | null {
  if (engine.validate()) {
    return null
  }
  log_info(`${label}_invalid`)
  return "invalid config"
}

function start_message(label: string, name: string): string {
  log_info(`${label}_done`)
  return `${name} started`
}

export function run_cli(config: QueryEngineConfig): string {
  log_info("cli_entry_run_cli")
  const engine: IQueryEngine = create_engine(config)
  const fail: string | null = validate_or_fail(engine, "cli_entry_run_cli")
  if (fail) {
    return fail
  }
  return start_message("cli_entry_run_cli", "cli")
}
