import type { Message } from "./message_types.ts"

/**
 * Message service interface.
 *
 * Defines the contract for message creation, storage and normalization.
 */
export interface IMessageService {
  /**
   * Validate the internal state.
   *
   * @returns True if valid.
   */
  validate(): boolean

  /**
   * Add a new message.
   *
   * @param content - The message content.
   * @param role - The message role.
   * @returns The created message.
   */
  add(content: string, role: "user" | "assistant" | "system"): Message

  /**
   * Normalize all stored messages.
   *
   * @returns The normalized messages.
   */
  normalize_all(): Message[]

  /**
   * Get all stored messages.
   *
   * @returns The array of messages.
   */
  get_all(): Message[]

  /**
   * Convert the service state to a plain object.
   *
   * @returns The plain object representation.
   */
  to_object(): Record<string, unknown>
}
