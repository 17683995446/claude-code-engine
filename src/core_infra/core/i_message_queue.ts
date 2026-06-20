/**
 * Message queue interface.
 *
 * Defines the contract for async message queuing.
 */
export interface IMessageQueue<T> {
  /**
   * Enqueue a message.
   *
   * @param msg - The message.
   */
  enqueue(msg: T): void

  /**
   * Dequeue a message.
   *
   * @returns The message, or undefined if empty.
   */
  dequeue(): T | undefined

  /**
   * Get queue size.
   *
   * @returns The number of messages.
   */
  size(): number

  /**
   * Clear all messages.
   */
  clear(): void
}
