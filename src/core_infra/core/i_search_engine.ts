/**
 * Search engine interface.
 *
 * Defines the contract for full-text search.
 */
export interface ISearchEngine {
  /**
   * Index a document with an id.
   *
   * @param id - The document id.
   * @param text - The document text.
   */
  index(id: string, text: string): void

  /**
   * Search for a query.
   *
   * @param query - The search query.
   * @returns Array of matching document ids.
   */
  search(query: string): string[]

  /**
   * Remove a document from the index.
   *
   * @param id - The document id.
   */
  remove(id: string): void
}
