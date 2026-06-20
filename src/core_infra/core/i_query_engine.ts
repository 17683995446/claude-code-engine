import type { Message } from "./message_types.ts"

/**
 * Query engine interface.
 *
 * Defines the contract for managing query lifecycle and messages.
 */
export interface IQueryEngine {
  /**
   * Validate the internal state.
   *
   * @returns True if valid, otherwise false.
   */
  validate(): boolean

  /**
   * Get all stored messages.
   *
   * @returns The array of messages.
   */
  get_messages(): Message[]

  /**
   * Add a message to the engine.
   *
   * @param message - The message to add.
   */
  add_message(message: Message): void

  /**
   * Convert the engine state to a plain object.
   *
   * @returns The plain object representation.
   */
  to_object(): Record<string, unknown>
}
