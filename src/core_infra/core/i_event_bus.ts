/**
 * Event bus interface.
 *
 * Defines the contract for publish-subscribe event communication.
 */
export interface IEventBus {
  /**
   * Subscribe to an event type.
   *
   * @param event - The event name.
   * @param handler - The callback handler.
   */
  subscribe(event: string, handler: (payload: string) => void): void

  /**
   * Unsubscribe a handler from an event.
   *
   * @param event - The event name.
   * @param handler - The callback to remove.
   */
  unsubscribe(event: string, handler: (payload: string) => void): void

  /**
   * Publish an event to all subscribers.
   *
   * @param event - The event name.
   * @param payload - The event payload.
   */
  publish(event: string, payload: string): void
}
