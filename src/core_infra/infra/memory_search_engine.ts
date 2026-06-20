import { log_info, log_warn } from "./global_logger.ts"
import type { ISearchEngine } from "../core/i_search_engine.ts"

export class MemorySearchEngine implements ISearchEngine {
  private idx: Map<string, Set<string>> = new Map()
  private docs: Map<string, string> = new Map()

  index(id: string, text: string): void {
    log_info(`search_index: ${id}`)
    if (this.docs.has(id)) {
      this.remove(id)
    }
    this.docs.set(id, text)
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
    for (const w of words) {
      if (!this.idx.has(w)) {
        this.idx.set(w, new Set())
      }
      this.idx.get(w)!.add(id)
    }
  }

  search(query: string): string[] {
    log_info(`search_query: ${query}`)
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) {
      return []
    }
    let result: Set<string> | undefined
    for (const w of words) {
      const ids = this.idx.get(w)
      if (!ids) {
        return []
      }
      if (!result) {
        result = new Set(ids)
      } else {
        for (const id of result) {
          if (!ids.has(id)) {
            result.delete(id)
          }
        }
      }
    }
    return result ? Array.from(result) : []
  }

  remove(id: string): void {
    log_info(`search_remove: ${id}`)
    this.docs.delete(id)
    for (const [, ids] of this.idx) {
      ids.delete(id)
    }
  }
}
