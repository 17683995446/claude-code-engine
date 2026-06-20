import type { Message } from "./message_types.js"

export type QueryEngineConfig = {
  cwd: string
  initial_messages: Message[]
  max_turns: number
  verbose: boolean
}
