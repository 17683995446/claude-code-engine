import { log_info, log_warn } from "./global_logger.ts"
import type { IRouter } from "../core/i_router.ts"

export class MemoryRouter implements IRouter {
  private routes: Map<string, string> = new Map()

  register(pattern: string, handler: string): void {
    log_info(`router_register: ${pattern} -> ${handler}`)
    this.routes.set(pattern, handler)
  }

  match(path: string): string | undefined {
    log_info(`router_match: ${path}`)
    for (const [pattern, handler] of this.routes) {
      if (path === pattern || path.startsWith(pattern + "/")) {
        return handler
      }
    }
    log_warn(`router_no_match: ${path}`)
    return undefined
  }

  remove(pattern: string): void {
    log_info(`router_remove: ${pattern}`)
    this.routes.delete(pattern)
  }
}
