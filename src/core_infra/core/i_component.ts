import type { Message } from "./message_types.ts"

/**
 * Component renderer interface.
 *
 * Defines the contract for UI component rendering.
 */
export interface IComponentRenderer {
  /**
   * Render the component.
   *
   * @returns The rendered string.
   */
  render(): string
}

/**
 * Message list renderer interface.
 */
export interface IMessageListRenderer extends IComponentRenderer {
  /**
   * Set the messages to render.
   *
   * @param messages - The messages.
   */
  set_messages(messages: Message[]): void
}

/**
 * Dialog renderer interface.
 */
export interface IDialogRenderer extends IComponentRenderer {
  /**
   * Set the dialog title.
   *
   * @param title - The title.
   */
  set_title(title: string): void

  /**
   * Set the dialog body.
   *
   * @param body - The body.
   */
  set_body(body: string): void
}
