import type { Message } from "./message_types.ts"

/**
 * Message pipeline interface.
 *
 * Defines the contract for message creation and normalization.
 */
export interface IMessagePipeline {
  /**
   * Create a new message.
   *
   * @param id - The message id.
   * @param content - The message content.
   * @param role - The message role.
   * @returns The created message.
   */
  create(id: string, content: string, role: "user" | "assistant" | "system"): Message

  /**
   * Normalize a message.
   *
   * @param message - The message to normalize.
   * @returns The normalized message.
   */
  normalize(message: Message): Message
}
