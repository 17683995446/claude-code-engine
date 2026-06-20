/**
 * Notifier interface.
 *
 * Defines the contract for sending notifications.
 */
export interface INotifier {
  /**
   * Send a message to a channel.
   *
   * @param channel - The target channel.
   * @param message - The message to send.
   */
  send(channel: string, message: string): void

  /**
   * Get all messages sent to a channel.
   *
   * @param channel - The target channel.
   * @returns Array of messages.
   */
  get_messages(channel: string): string[]
}
